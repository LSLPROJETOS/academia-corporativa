-- ============================================================================
-- Academia Corporativa — migração: regras de negócio no servidor
-- Rode no SQL Editor do Supabase DEPOIS de supabase/schema.sql.
-- É idempotente (pode ser executada mais de uma vez).
--
-- O que muda:
--   1. O aluno não altera mais points/xp/badges/streak/email/internal_id.
--   2. O aluno não grava mais enrollments, progress, attempts, certificates,
--      redemptions nem log diretamente: só por funções (RPC) abaixo.
--   3. O gabarito da prova deixa de ir ao navegador (get_quiz / submit_quiz).
--   4. Resgate na loja desconta saldo e estoque de forma atômica.
--   5. "Exigir aprovação" passa a funcionar também no modo Supabase.
--   6. ranking_xp ignora registros malformados em vez de falhar.
--
-- ATENÇÃO: o front-end precisa ser ajustado para chamar as funções
-- (veja a seção "Integração no front-end" no fim deste arquivo).
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 0. Utilitários internos (não expostos ao cliente)
-- ---------------------------------------------------------------------------

-- Código aleatório de n posições (alfabeto sem 0/O/1/I), n <= 13.
create or replace function public.gen_code(n integer default 8)
returns text
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  -- bytes 6 e 8 do UUID v4 têm bits fixos; ficam de fora.
  positions constant integer[] := array[0,1,2,3,4,5,7,9,10,11,12,13,14,15];
  raw bytea := uuid_send(gen_random_uuid());
  result text := '';
  i integer;
begin
  if n < 1 or n > 13 then raise exception 'Tamanho de código inválido.'; end if;
  for i in 1..n loop
    result := result || substr(alphabet, (get_byte(raw, positions[i]) % 32) + 1, 1);
  end loop;
  return result;
end;
$$;
revoke all on function public.gen_code(integer) from public, anon, authenticated;

-- Id numérico no mesmo estilo do nid() do front (cabe em 2^53).
create or replace function public.new_numeric_id()
returns bigint
language sql
volatile
as $$ select floor(random() * 9007199254740991)::bigint + 1; $$;
revoke all on function public.new_numeric_id() from public, anon, authenticated;

create or replace function public.platform_setting(p_key text, p_default numeric)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select case when payload ->> p_key ~ '^-?[0-9]{1,9}(\.[0-9]+)?$'
                 then (payload ->> p_key)::numeric end
       from public.app_records
      where collection = 'settings' and owner_id is null and record_id = 'platform'
      limit 1),
    p_default);
$$;
revoke all on function public.platform_setting(text, numeric) from public, anon, authenticated;

-- Perfil de quem está logado (precisa estar ativo e aprovado). Trava a linha.
create or replace function public.current_member(p_lock boolean default false)
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me public.profiles;
begin
  if auth.uid() is null then raise exception 'Faça login para continuar.'; end if;
  if p_lock then
    select * into me from public.profiles where id = auth.uid() for update;
  else
    select * into me from public.profiles where id = auth.uid();
  end if;
  if me.id is null or not me.active or me.pending then
    raise exception 'Conta inativa ou aguardando aprovação.';
  end if;
  return me;
end;
$$;
revoke all on function public.current_member(boolean) from public, anon, authenticated;

-- Notificação no mesmo formato do notify() do front.
create or replace function public.push_notification(p_user_id uuid, p_internal_id bigint, p_text text, p_link text default '')
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  nid bigint := public.new_numeric_id();
begin
  insert into public.app_records (collection, record_id, owner_id, payload)
  values ('notifications', nid::text, p_user_id,
          jsonb_build_object('id', nid, 'userId', p_internal_id, 'text', p_text, 'link', p_link,
                             'at', (extract(epoch from now()) * 1000)::bigint, 'read', false));
end;
$$;
revoke all on function public.push_notification(uuid, bigint, text, text) from public, anon, authenticated;

-- Soma/subtrai pontos, grava no log e notifica mudança de nível.
-- p_gain_xp = false para estornos (devolve saldo sem aumentar XP).
create or replace function public.grant_points(p_user_id uuid, p_amount integer, p_reason text, p_gain_xp boolean default true)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prof public.profiles;
  step numeric := greatest(public.platform_setting('levelStep', 100), 1);
  level_before integer;
  level_after integer;
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
  log_id bigint := public.new_numeric_id();
begin
  if p_amount is null or p_amount = 0 then return; end if;
  select * into prof from public.profiles where id = p_user_id for update;
  if prof.id is null then return; end if;

  level_before := floor(sqrt(prof.xp / step))::integer + 1;
  perform set_config('app.server_rule', 'on', true);
  update public.profiles
     set points = points + p_amount,
         xp = case when p_gain_xp and p_amount > 0 then xp + p_amount else xp end
   where id = p_user_id
  returning * into prof;
  perform set_config('app.server_rule', 'off', true);

  insert into public.app_records (collection, record_id, owner_id, payload)
  values ('log',
          log_id::text,
          p_user_id,
          jsonb_build_object('id', log_id, 'userId', prof.internal_id, 'delta', p_amount, 'reason', p_reason, 'at', now_ms));

  level_after := floor(sqrt(prof.xp / step))::integer + 1;
  if p_amount > 0 and p_gain_xp and level_after > level_before then
    perform public.push_notification(p_user_id, prof.internal_id,
      '⭐ Você subiu para o nível ' || level_after || '!', '#/profile');
  end if;
end;
$$;
revoke all on function public.grant_points(uuid, integer, text, boolean) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 1. Proteção das colunas sensíveis de profiles
-- ---------------------------------------------------------------------------
-- Estende o trigger existente. Fora das funções do servidor, só admin altera
-- pontos/XP/conquistas/sequência; ninguém altera e-mail nem internal_id.
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if current_setting('app.bootstrap_first_admin', true) = 'on'
     or current_setting('app.server_rule', true) = 'on' then
    return new;
  end if;

  if auth.uid() is not null then
    if new.internal_id is distinct from old.internal_id
       or lower(new.email) is distinct from lower(old.email) then
      raise exception 'E-mail e identificador interno não podem ser alterados.';
    end if;

    if (new.role is distinct from old.role
        or new.active is distinct from old.active
        or new.pending is distinct from old.pending)
       and not public.is_platform_admin() then
      raise exception 'Somente um administrador pode alterar perfil ou acesso.';
    end if;

    if (new.points is distinct from old.points
        or new.xp is distinct from old.xp
        or new.badges is distinct from old.badges
        or new.streak is distinct from old.streak
        or new.last_checkin is distinct from old.last_checkin)
       and not public.is_platform_admin() then
      raise exception 'Pontos, XP, conquistas e sequência são calculados pelo servidor.';
    end if;
  end if;
  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- 2. Cadastro: aprovação obrigatória realmente aplicada
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  needs_approval boolean := coalesce(
    (select (payload ->> 'requireApproval') = 'true'
       from public.app_records
      where collection = 'settings' and owner_id is null and record_id = 'platform'
      limit 1), false);
  meta_avatar jsonb := coalesce(new.raw_user_meta_data -> 'avatar', '{}'::jsonb);
begin
  -- Evita metadados gigantes vindos do cliente.
  if jsonb_typeof(meta_avatar) <> 'object' or length(meta_avatar::text) > 2000 then
    meta_avatar := '{}'::jsonb;
  end if;

  insert into public.profiles (id, email, name, dept, avatar, pending)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    left(coalesce(new.raw_user_meta_data ->> 'name', ''), 120),
    left(coalesce(new.raw_user_meta_data ->> 'dept', ''), 80),
    meta_avatar,
    needs_approval
  )
  on conflict (id) do nothing;
  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- 3. Quem pode escrever o quê em app_records
-- ---------------------------------------------------------------------------
-- O aluno passa a gravar diretamente apenas dados que não valem pontos.
-- Todo o resto entra pelas funções abaixo (security definer).
do $$
declare
  writable constant text := $q$('ratings', 'comments', 'notes', 'favorites', 'watch', 'notifications')$q$;
begin
  execute 'drop policy if exists "Insert owned or staff records" on public.app_records';
  execute format($p$
    create policy "Insert owned or staff records"
    on public.app_records for insert to authenticated
    with check (
      public.is_platform_staff()
      or (owner_id = auth.uid() and collection in %s)
    )$p$, writable);

  execute 'drop policy if exists "Update owned or staff records" on public.app_records';
  execute format($p$
    create policy "Update owned or staff records"
    on public.app_records for update to authenticated
    using (public.is_platform_staff() or owner_id = auth.uid())
    with check (
      public.is_platform_staff()
      or (owner_id = auth.uid() and collection in %s)
    )$p$, writable);

  execute 'drop policy if exists "Delete owned or staff records" on public.app_records';
  execute format($p$
    create policy "Delete owned or staff records"
    on public.app_records for delete to authenticated
    using (
      public.is_platform_staff()
      or (owner_id = auth.uid() and collection in %s)
    )$p$, writable);
end $$;

-- Provas (com gabarito) só para a equipe; o aluno usa get_quiz().
drop policy if exists "Read platform records" on public.app_records;
create policy "Read platform records"
on public.app_records for select to anon, authenticated
using (
  (
    owner_id is null
    and (
      collection in ('settings', 'departments')
      or (
        auth.uid() is not null
        and (
          (collection = 'courses' and public.can_view_course(record_id))
          or (collection = 'lessons' and public.can_view_course(payload ->> 'courseId'))
          or (collection = 'quizzes' and public.is_platform_staff())
          or (collection = 'products'
              and (public.is_platform_staff() or payload ->> 'active' = 'true'))
          or (collection = 'announcements'
              and (public.is_platform_staff() or public.is_visible_announcement(payload)))
          or (collection = 'audit' and public.is_platform_staff())
        )
      )
    )
  )
  or (auth.uid() is not null and owner_id = auth.uid())
  or (auth.uid() is not null and public.is_platform_staff())
);


-- ---------------------------------------------------------------------------
-- 4. Conquistas (espelha BADGES de rules.js)
-- ---------------------------------------------------------------------------
create or replace function public.check_badges(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prof public.profiles;
  n_lessons integer; n_courses integer; n_perfect integer; n_redeems integer; n_mandatory integer;
  def record;
  earned boolean;
begin
  select * into prof from public.profiles where id = p_user_id;
  if prof.id is null then return; end if;

  select count(*) into n_lessons from public.app_records
   where collection = 'progress' and owner_id = p_user_id;
  select count(*) into n_courses from public.app_records
   where collection = 'certificates' and owner_id = p_user_id;
  select count(*) into n_perfect from public.app_records
   where collection = 'attempts' and owner_id = p_user_id and payload ->> 'score' = '100';
  select count(*) into n_redeems from public.app_records
   where collection = 'redemptions' and owner_id = p_user_id;
  select count(*) into n_mandatory
    from public.app_records cert
    join public.app_records c
      on c.collection = 'courses' and c.owner_id is null
     and c.record_id = cert.payload ->> 'courseId'
   where cert.collection = 'certificates' and cert.owner_id = p_user_id
     and c.payload ->> 'mandatory' = 'true';

  for def in
    select * from (values
      ('first',     'Primeiro passo', '🚀',  5),
      ('lessons10', 'Estudioso',      '📚', 20),
      ('lessons50', 'Maratonista',    '🧠', 80),
      ('course1',   'Formado',        '🎓', 30),
      ('course5',   'Colecionador',   '🏆', 100),
      ('perfect',   'Nota máxima',    '💯', 25),
      ('streak7',   'Constância',     '🔥', 40),
      ('xp500',     'Poupador',       '💰', 30),
      ('shop',      'Primeira troca', '🎁',  0),
      ('duty',      'Cumpridor',      '✅', 30)
    ) as t(id, name, icon, bonus)
  loop
    -- Relê o perfil: um bônus anterior pode ter mudado o XP.
    select * into prof from public.profiles where id = p_user_id;
    if prof.badges ? def.id then continue; end if;

    earned := case def.id
      when 'first'     then n_lessons >= 1
      when 'lessons10' then n_lessons >= 10
      when 'lessons50' then n_lessons >= 50
      when 'course1'   then n_courses >= 1
      when 'course5'   then n_courses >= 5
      when 'perfect'   then n_perfect >= 1
      when 'streak7'   then prof.streak >= 7
      when 'xp500'     then prof.xp >= 500
      when 'shop'      then n_redeems >= 1
      when 'duty'      then n_mandatory >= 1
      else false end;

    if earned then
      perform set_config('app.server_rule', 'on', true);
      update public.profiles set badges = badges || to_jsonb(def.id) where id = p_user_id;
      perform set_config('app.server_rule', 'off', true);
      perform public.push_notification(p_user_id, prof.internal_id,
        def.icon || ' Nova conquista: ' || def.name || '!', '#/profile');
      perform public.grant_points(p_user_id, def.bonus, 'Conquista: ' || def.name);
    end if;
  end loop;
end;
$$;
revoke all on function public.check_badges(uuid) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 5. Conclusão de curso e certificado
-- ---------------------------------------------------------------------------
create or replace function public.check_course_completion(p_user_id uuid, p_course_id text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prof public.profiles;
  course_row public.app_records;
  total_lessons integer;
  done_lessons integer;
  has_quiz boolean;
  quiz_ok boolean;
  bonus integer;
  code text;
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  select * into prof from public.profiles where id = p_user_id;
  select * into course_row from public.app_records
   where collection = 'courses' and owner_id is null and record_id = p_course_id;
  if prof.id is null or course_row.id is null then return null; end if;

  -- Já tem certificado?
  if exists (select 1 from public.app_records
              where collection = 'certificates' and owner_id = p_user_id
                and payload ->> 'courseId' = p_course_id) then
    return null;
  end if;

  select count(*) into total_lessons from public.app_records
   where collection = 'lessons' and owner_id is null and payload ->> 'courseId' = p_course_id;
  select count(*) into done_lessons
    from public.app_records l
    join public.app_records pr
      on pr.collection = 'progress' and pr.owner_id = p_user_id
     and pr.payload ->> 'lessonId' = l.record_id
   where l.collection = 'lessons' and l.owner_id is null and l.payload ->> 'courseId' = p_course_id;

  select exists (select 1 from public.app_records
                  where collection = 'quizzes' and owner_id is null and record_id = p_course_id)
    into has_quiz;
  select exists (select 1 from public.app_records
                  where collection = 'attempts' and owner_id = p_user_id
                    and payload ->> 'courseId' = p_course_id and payload ->> 'passed' = 'true')
    into quiz_ok;

  if total_lessons = 0 or done_lessons < total_lessons or (has_quiz and not quiz_ok) then
    return null;
  end if;

  code := public.gen_code(10);
  insert into public.app_records (collection, record_id, owner_id, payload)
  values ('certificates', code, p_user_id,
          jsonb_build_object('code', code, 'userId', prof.internal_id,
                             'courseId', p_course_id::numeric, 'at', now_ms));

  bonus := coalesce(case when course_row.payload ->> 'bonus' ~ '^[0-9]{1,6}$'
                         then (course_row.payload ->> 'bonus')::integer end, 0);
  if bonus > 0 then
    perform public.grant_points(p_user_id, bonus, 'Curso concluído: ' || coalesce(course_row.payload ->> 'title', ''));
  end if;
  perform public.push_notification(p_user_id, prof.internal_id,
    '🎓 Você concluiu "' || coalesce(course_row.payload ->> 'title', '') || '" e ganhou um certificado!',
    '#/certificate/' || code);
  perform public.check_badges(p_user_id);
  return code;
end;
$$;
revoke all on function public.check_course_completion(uuid, text) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 6. RPCs chamadas pelo front-end (autenticado)
-- ---------------------------------------------------------------------------

-- 6.1 Matrícula: aluno só em curso publicado e com pré-requisito cumprido.
create or replace function public.enroll_in_course(p_course_id text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me public.profiles := public.current_member();
  cp jsonb;
  prereq text;
begin
  select payload into cp from public.app_records
   where collection = 'courses' and owner_id is null and record_id = p_course_id;
  if cp is null then raise exception 'Curso indisponível.'; end if;

  if not public.is_platform_staff() then
    if cp ->> 'status' is distinct from 'publicado' then raise exception 'Curso indisponível.'; end if;
    prereq := nullif(cp ->> 'prereq', '');
    if prereq is not null and not exists (
      select 1 from public.app_records
       where collection = 'certificates' and owner_id = me.id and payload ->> 'courseId' = prereq) then
      raise exception 'Conclua antes o curso pré-requisito.';
    end if;
  end if;

  insert into public.app_records (collection, record_id, owner_id, payload)
  values ('enrollments', me.internal_id || ':' || p_course_id, me.id,
          jsonb_build_object('userId', me.internal_id, 'courseId', p_course_id::numeric,
                             'at', (extract(epoch from now()) * 1000)::bigint, 'dueDate', ''))
  on conflict (collection, record_id, owner_scope) do nothing;
end;
$$;

-- 6.1b Cancelar a própria inscrição (o progresso é mantido).
create or replace function public.unenroll_from_course(p_course_id text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me public.profiles := public.current_member();
begin
  delete from public.app_records
   where collection = 'enrollments' and owner_id = me.id and payload ->> 'courseId' = p_course_id;
end;
$$;

-- 6.1c Dados gerais das provas (sem perguntas nem gabarito) para a interface do aluno.
create or replace function public.my_quiz_overview()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'courseId', q.payload -> 'courseId',
           'passScore', q.payload -> 'passScore',
           'points', q.payload -> 'points',
           'maxAttempts', q.payload -> 'maxAttempts',
           'questionCount', jsonb_array_length(coalesce(q.payload -> 'questions', '[]'::jsonb)))), '[]'::jsonb)
    from public.app_records q
   where q.collection = 'quizzes' and q.owner_id is null
     and auth.uid() is not null
     and (public.is_platform_staff() or public.has_course_enrollment(q.record_id));
$$;

-- 6.2 Concluir aula (pontos só na primeira vez).
create or replace function public.complete_lesson(p_lesson_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me public.profiles := public.current_member(true);
  lesson_row public.app_records;
  course_id text;
  sequential boolean;
  my_pos numeric;
  pts integer;
  inserted integer;
  cert text;
begin
  select * into lesson_row from public.app_records
   where collection = 'lessons' and owner_id is null and record_id = p_lesson_id;
  if lesson_row.id is null then raise exception 'Aula não encontrada.'; end if;
  course_id := lesson_row.payload ->> 'courseId';

  if not public.can_view_course(course_id) then raise exception 'Sem acesso a este curso.'; end if;
  -- Só cria matrícula quando ainda não existe. Matrículas ativas continuam válidas
  -- para concluir aulas mesmo se o curso for despublicado depois.
  if not public.is_platform_staff()
     and not public.has_course_enrollment(course_id) then
    perform public.enroll_in_course(course_id);
  end if;

  -- Curso sequencial: as aulas anteriores precisam estar concluídas.
  select (payload ->> 'sequential' = 'true') into sequential
    from public.app_records
   where collection = 'courses' and owner_id is null and record_id = course_id;
  if sequential is true and not public.is_platform_staff() then
    my_pos := coalesce((lesson_row.payload ->> 'position')::numeric, 0);
    if exists (
      select 1 from public.app_records l
       where l.collection = 'lessons' and l.owner_id is null
         and l.payload ->> 'courseId' = course_id
         and coalesce((l.payload ->> 'position')::numeric, 0) < my_pos
         and not exists (select 1 from public.app_records pr
                          where pr.collection = 'progress' and pr.owner_id = me.id
                            and pr.payload ->> 'lessonId' = l.record_id)
    ) then
      raise exception 'Conclua as aulas anteriores primeiro.';
    end if;
  end if;

  insert into public.app_records (collection, record_id, owner_id, payload)
  values ('progress', me.internal_id || ':' || p_lesson_id, me.id,
          jsonb_build_object('userId', me.internal_id, 'lessonId', p_lesson_id::numeric,
                             'at', (extract(epoch from now()) * 1000)::bigint))
  on conflict (collection, record_id, owner_scope) do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then return jsonb_build_object('earned', 0, 'certificate', null); end if;

  pts := coalesce(case when lesson_row.payload ->> 'points' ~ '^[0-9]{1,5}$'
                       then (lesson_row.payload ->> 'points')::integer end, 0);
  if pts > 0 then
    perform public.grant_points(me.id, pts, 'Aula concluída: ' || coalesce(lesson_row.payload ->> 'title', ''));
  end if;
  cert := public.check_course_completion(me.id, course_id);
  perform public.check_badges(me.id);
  return jsonb_build_object('earned', pts, 'certificate', cert);
end;
$$;

-- 6.3 Prova SEM gabarito, para o aluno responder.
create or replace function public.get_quiz(p_course_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  me public.profiles := public.current_member();
  quiz_row public.app_records;
begin
  if not (public.is_platform_staff() or public.has_course_enrollment(p_course_id)) then
    raise exception 'Matricule-se no curso para fazer a prova.';
  end if;
  select * into quiz_row from public.app_records
   where collection = 'quizzes' and owner_id is null and record_id = p_course_id;
  if quiz_row.id is null then return null; end if;

  return jsonb_build_object(
    'courseId',    quiz_row.payload -> 'courseId',
    'passScore',   quiz_row.payload -> 'passScore',
    'points',      quiz_row.payload -> 'points',
    'maxAttempts', quiz_row.payload -> 'maxAttempts',
    'questions',   (select coalesce(jsonb_agg(jsonb_build_object('q', q -> 'q', 'options', q -> 'options')
                                              order by ord), '[]'::jsonb)
                      from jsonb_array_elements(quiz_row.payload -> 'questions') with ordinality as t(q, ord))
  );
end;
$$;

-- 6.4 Corrige a prova no servidor. Devolve nota e o gabarito (só após enviar).
create or replace function public.submit_quiz(p_course_id text, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me public.profiles := public.current_member(true);
  quiz_row public.app_records;
  questions jsonb;
  total integer;
  right_count integer := 0;
  i integer;
  score integer;
  pass_score integer;
  max_attempts integer;
  attempts_used integer;
  passed boolean;
  first_pass boolean;
  attempt_id bigint := public.new_numeric_id();
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
  quiz_points integer;
  cert text;
begin
  if not public.has_course_enrollment(p_course_id) then
    raise exception 'Matricule-se no curso para fazer a prova.';
  end if;
  select * into quiz_row from public.app_records
   where collection = 'quizzes' and owner_id is null and record_id = p_course_id;
  if quiz_row.id is null then raise exception 'Este curso não tem prova.'; end if;

  questions := quiz_row.payload -> 'questions';
  total := jsonb_array_length(questions);
  if total = 0 then raise exception 'Prova sem perguntas.'; end if;
  if jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) <> total then
    raise exception 'Responda todas as perguntas.';
  end if;

  max_attempts := coalesce((quiz_row.payload ->> 'maxAttempts')::integer, 0);
  select count(*) into attempts_used from public.app_records
   where collection = 'attempts' and owner_id = me.id and payload ->> 'courseId' = p_course_id;
  if max_attempts > 0 and attempts_used >= max_attempts then
    raise exception 'Limite de tentativas atingido.';
  end if;

  for i in 0 .. total - 1 loop
    if (p_answers ->> i) ~ '^[0-9]+$'
       and (p_answers ->> i)::integer = (questions -> i ->> 'correct')::integer then
      right_count := right_count + 1;
    end if;
  end loop;

  score := round(right_count * 100.0 / total);
  pass_score := coalesce((quiz_row.payload ->> 'passScore')::integer, 70);
  passed := score >= pass_score;
  first_pass := passed and not exists (
    select 1 from public.app_records
     where collection = 'attempts' and owner_id = me.id
       and payload ->> 'courseId' = p_course_id and payload ->> 'passed' = 'true');

  insert into public.app_records (collection, record_id, owner_id, payload)
  values ('attempts', attempt_id::text, me.id,
          jsonb_build_object('id', attempt_id, 'userId', me.internal_id,
                             'courseId', p_course_id::numeric, 'score', score,
                             'passed', passed, 'at', now_ms, 'answers', p_answers));

  if first_pass then
    quiz_points := coalesce(case when quiz_row.payload ->> 'points' ~ '^[0-9]{1,6}$'
                                 then (quiz_row.payload ->> 'points')::integer end, 0);
    if quiz_points > 0 then
      perform public.grant_points(me.id, quiz_points,
        'Prova aprovada: ' || coalesce((select payload ->> 'title' from public.app_records
                                         where collection = 'courses' and owner_id is null
                                           and record_id = p_course_id), ''));
    end if;
    cert := public.check_course_completion(me.id, p_course_id);
  end if;
  perform public.check_badges(me.id);

  return jsonb_build_object(
    'attempt', jsonb_build_object('id', attempt_id, 'score', score, 'passed', passed, 'at', now_ms),
    'certificate', cert,
    'review', questions   -- gabarito e explicações liberados depois do envio
  );
end;
$$;

-- 6.5 Check-in diário (fuso America/Sao_Paulo).
create or replace function public.daily_checkin()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me public.profiles := public.current_member(true);
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  new_streak integer;
  daily integer := public.platform_setting('dailyBonus', 5)::integer;
  bonus7 integer := public.platform_setting('streak7Bonus', 50)::integer;
  total integer;
begin
  if me.last_checkin = today then return null; end if;
  new_streak := case when me.last_checkin = today - 1 then me.streak + 1 else 1 end;

  perform set_config('app.server_rule', 'on', true);
  update public.profiles set streak = new_streak, last_checkin = today where id = me.id;
  perform set_config('app.server_rule', 'off', true);

  total := daily;
  perform public.grant_points(me.id, daily,
    'Check-in diário (' || new_streak || ' dia' || case when new_streak > 1 then 's' else '' end || ' seguidos)');
  if new_streak % 7 = 0 then
    perform public.grant_points(me.id, bonus7, 'Bônus de 7 dias seguidos');
    total := total + bonus7;
  end if;
  perform public.check_badges(me.id);
  return total;
end;
$$;

-- 6.6 Resgate na loja: saldo, estoque e limite validados em uma transação.
create or replace function public.redeem_product(p_product_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me public.profiles := public.current_member(true);
  prod public.app_records;
  cost integer;
  stock integer;
  unlimited boolean;
  per_person integer;
  already integer;
  code text := public.gen_code(8);
  redemption_id bigint := public.new_numeric_id();
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
  admin_row record;
begin
  select * into prod from public.app_records
   where collection = 'products' and owner_id is null and record_id = p_product_id
   for update;
  if prod.id is null or prod.payload ->> 'active' is distinct from 'true' then
    raise exception 'Produto indisponível.';
  end if;

  cost      := coalesce((prod.payload ->> 'cost')::integer, 0);
  stock     := coalesce((prod.payload ->> 'stock')::integer, 0);
  unlimited := coalesce((prod.payload ->> 'unlimited')::boolean, false);
  per_person := coalesce((prod.payload ->> 'limit')::integer, 0);
  if cost < 0 then raise exception 'Produto com preço inválido.'; end if;

  if not unlimited and stock <= 0 then raise exception 'Produto sem estoque.'; end if;
  if me.points < cost then raise exception 'Pontos insuficientes.'; end if;

  select count(*) into already from public.app_records
   where collection = 'redemptions' and owner_id = me.id
     and payload ->> 'productId' = p_product_id and payload ->> 'status' <> 'cancelado';
  if per_person > 0 and already >= per_person then
    raise exception 'Você atingiu o limite deste produto.';
  end if;

  if not unlimited then
    update public.app_records
       set payload = jsonb_set(payload, '{stock}', to_jsonb(stock - 1)), updated_at = now()
     where id = prod.id;
  end if;

  perform public.grant_points(me.id, -cost, 'Troca: ' || (prod.payload ->> 'name'));

  insert into public.app_records (collection, record_id, owner_id, payload)
  values ('redemptions', redemption_id::text, me.id,
          jsonb_build_object('id', redemption_id, 'userId', me.internal_id,
                             'productId', p_product_id::numeric,
                             'productName', prod.payload ->> 'name', 'cost', cost,
                             'status', 'pendente', 'code', code, 'at', now_ms, 'note', ''));

  for admin_row in
    select id, internal_id from public.profiles where role = 'admin' and active and not pending
  loop
    perform public.push_notification(admin_row.id, admin_row.internal_id,
      '🎁 Nova troca: ' || (prod.payload ->> 'name') || ' (' || me.name || ')', '#/admin/redemptions');
  end loop;

  perform public.check_badges(me.id);
  return jsonb_build_object('code', code, 'id', redemption_id);
end;
$$;

-- 6.7 Cancelar troca: dono (se pendente) ou equipe. Devolve saldo e estoque.
create or replace function public.cancel_redemption(p_redemption_id text, p_note text default '')
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me public.profiles := public.current_member();
  r public.app_records;
  status text;
begin
  select * into r from public.app_records
   where collection = 'redemptions' and record_id = p_redemption_id for update;
  if r.id is null then raise exception 'Pedido não encontrado.'; end if;
  status := r.payload ->> 'status';

  if r.owner_id <> me.id and not public.is_platform_staff() then
    raise exception 'Sem permissão para cancelar este pedido.';
  end if;
  if r.owner_id = me.id and not public.is_platform_staff() and status <> 'pendente' then
    raise exception 'Só dá para cancelar pedidos pendentes.';
  end if;
  if status in ('entregue', 'cancelado') then
    raise exception 'Este pedido não pode ser cancelado.';
  end if;

  update public.app_records
     set payload = payload || jsonb_build_object('status', 'cancelado', 'note', left(coalesce(p_note, ''), 500)),
         updated_at = now()
   where id = r.id;

  perform public.grant_points(r.owner_id, (r.payload ->> 'cost')::integer,
                              'Estorno: ' || (r.payload ->> 'productName'), false);

  update public.app_records
     set payload = jsonb_set(payload, '{stock}', to_jsonb((payload ->> 'stock')::integer + 1))
   where collection = 'products' and owner_id is null
     and record_id = r.payload ->> 'productId'
     and payload ->> 'unlimited' is distinct from 'true';
end;
$$;

revoke all on function public.enroll_in_course(text)        from public, anon;
revoke all on function public.unenroll_from_course(text)    from public, anon;
revoke all on function public.my_quiz_overview()            from public, anon;
revoke all on function public.complete_lesson(text)         from public, anon;
revoke all on function public.get_quiz(text)                from public, anon;
revoke all on function public.submit_quiz(text, jsonb)      from public, anon;
revoke all on function public.daily_checkin()               from public, anon;
revoke all on function public.redeem_product(text)          from public, anon;
revoke all on function public.cancel_redemption(text, text) from public, anon;
grant execute on function public.enroll_in_course(text)        to authenticated;
grant execute on function public.unenroll_from_course(text)    to authenticated;
grant execute on function public.my_quiz_overview()            to authenticated;
grant execute on function public.complete_lesson(text)         to authenticated;
grant execute on function public.get_quiz(text)                to authenticated;
grant execute on function public.submit_quiz(text, jsonb)      to authenticated;
grant execute on function public.daily_checkin()               to authenticated;
grant execute on function public.redeem_product(text)          to authenticated;
grant execute on function public.cancel_redemption(text, text) to authenticated;


-- ---------------------------------------------------------------------------
-- 7. ranking_xp resistente a registros malformados
-- ---------------------------------------------------------------------------
create or replace function public.ranking_xp()
returns table (user_id bigint, weekly_xp bigint, monthly_xp bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with period_start as (
    select
      date_trunc('week',  now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' as week_start,
      date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' as month_start
  ),
  entries as (
    select
      owner_id,
      case when payload ->> 'delta' ~ '^-?[0-9]{1,9}$' then (payload ->> 'delta')::integer else 0 end as delta,
      case when payload ->> 'at' ~ '^[0-9]{10,16}$'
           then (payload ->> 'at')::numeric end as at_ms,
      coalesce(payload ->> 'reason', '') as reason
    from public.app_records
    where collection = 'log'
  )
  select
    profile.internal_id,
    coalesce(sum(greatest(entry.delta, 0)) filter (
      where entry.at_ms >= extract(epoch from period_start.week_start) * 1000
        and entry.at_ms <= extract(epoch from now()) * 1000
        and entry.reason not like 'Estorno:%'), 0)::bigint,
    coalesce(sum(greatest(entry.delta, 0)) filter (
      where entry.at_ms >= extract(epoch from period_start.month_start) * 1000
        and entry.at_ms <= extract(epoch from now()) * 1000
        and entry.reason not like 'Estorno:%'), 0)::bigint
  from public.profiles as profile
  cross join period_start
  left join entries as entry on entry.owner_id = profile.id
  where profile.role = 'aluno' and profile.active and not profile.pending
  group by profile.internal_id;
$$;
revoke all on function public.ranking_xp() from public, anon;
grant execute on function public.ranking_xp() to authenticated;


-- ============================================================================
-- Integração no front-end
-- ============================================================================
-- Aplique junto os arquivos ajustados: data.js, learner.js, rules.js e admin.js
-- (assets/js/index/). Eles chamam estas funções via backend.rpc() quando
-- LOCAL_MODE = false e mantêm o comportamento anterior no modo local.
--
-- Limitações que continuam:
--  * "watch" (tempo assistido) segue sendo gravado pelo cliente; a conclusão automática
--    por % de vídeo ainda pode ser forjada. Para fechar, valide via RPC com limites de tempo.
--  * Matrículas em lote feitas por admin/instrutor continuam pela policy de staff.
--  * Instrutores (staff) ainda gravam em qualquer coleção de app_records.
-- ============================================================================
