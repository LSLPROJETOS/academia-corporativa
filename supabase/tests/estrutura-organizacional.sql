-- Testes de integração da estrutura organizacional.
-- Execute somente em staging/desenvolvimento com uma conta de teste ativa.
-- Todo o conteúdo criado neste arquivo é revertido no ROLLBACK final.

begin;

create temporary table organization_test_refs (
  actor_id uuid,
  organization_a uuid,
  organization_b uuid,
  unit_a uuid,
  unit_b uuid,
  unit_foreign uuid,
  sector_a uuid,
  sector_b uuid,
  sector_other uuid,
  record_a bigint,
  record_b bigint,
  record_other_sector bigint,
  record_foreign bigint
) on commit drop;

do $$
declare
  actor uuid;
  organization_a uuid;
  organization_b uuid;
  unit_a uuid;
  unit_b uuid;
  unit_foreign uuid;
  sector_a uuid;
  sector_b uuid;
  sector_other uuid;
  record_a bigint;
  record_b bigint;
  record_other_sector bigint;
  record_foreign bigint;
begin
  select id into actor
  from public.profiles
  where role <> 'admin' and active and not pending
  order by created_at
  limit 1;
  if actor is null then
    raise exception 'O teste requer uma conta não administradora ativa em staging.';
  end if;

  insert into public.organizations (name) values ('Teste temporário A') returning id into organization_a;
  insert into public.organizations (name) values ('Teste temporário B') returning id into organization_b;
  insert into public.units (organization_id, name) values (organization_a, 'Unidade repetida') returning id into unit_a;
  insert into public.units (organization_id, name) values (organization_a, 'Unidade repetida') returning id into unit_b;
  insert into public.units (organization_id, name) values (organization_b, 'Unidade externa') returning id into unit_foreign;

  insert into public.sectors (organization_id, unit_id, name)
  values (organization_a, unit_a, 'Setor repetido') returning id into sector_a;
  insert into public.sectors (organization_id, unit_id, name)
  values (organization_a, unit_b, 'Setor repetido') returning id into sector_b;
  insert into public.sectors (organization_id, unit_id, name)
  values (organization_a, unit_a, 'Setor não autorizado') returning id into sector_other;

  if sector_a = sector_b then
    raise exception 'Setores de unidades diferentes receberam o mesmo identificador.';
  end if;

  insert into public.memberships (user_id, organization_id, unit_id, sector_id, role)
  values (actor, organization_a, unit_a, sector_a, 'sector_manager');
  insert into public.memberships (user_id, organization_id, unit_id, sector_id, role)
  values (actor, organization_a, unit_b, sector_b, 'collaborator');
  insert into public.user_organizational_contexts (user_id, organization_id, unit_id, sector_id)
  values (actor, organization_a, unit_a, sector_a)
  on conflict (user_id) do update
    set organization_id = excluded.organization_id, unit_id = excluded.unit_id,
        sector_id = excluded.sector_id, updated_at = now();

  insert into public.app_records (
    collection, record_id, payload, organization_id, unit_id, sector_id
  ) values ('courses', 'sector-a', '{"status":"publicado"}',
            organization_a, unit_a, sector_a)
  returning id into record_a;
  insert into public.app_records (
    collection, record_id, payload, organization_id, unit_id, sector_id
  ) values ('courses', 'sector-b', '{"status":"publicado"}',
            organization_a, unit_b, sector_b)
  returning id into record_b;
  insert into public.app_records (
    collection, record_id, payload, organization_id, unit_id, sector_id
  ) values ('courses', 'other-sector', '{"status":"publicado"}',
            organization_a, unit_a, sector_other)
  returning id into record_other_sector;
  insert into public.app_records (
    collection, record_id, payload, organization_id, unit_id
  ) values ('courses', 'other-organization', '{"status":"publicado"}',
            organization_b, unit_foreign)
  returning id into record_foreign;

  begin
    insert into public.app_records (
      collection, record_id, payload, organization_id, unit_id, sector_id
    ) values ('organization_test', 'invalid-parent', '{}',
              organization_a, unit_b, sector_a);
    raise exception 'A relação incompatível entre unidade e setor foi aceita.';
  exception when foreign_key_violation then
    null;
  end;

  insert into organization_test_refs values (
    actor, organization_a, organization_b, unit_a, unit_b, unit_foreign,
    sector_a, sector_b, sector_other, record_a, record_b, record_other_sector, record_foreign
  );
end;
$$;

select set_config('test.organization_actor', actor_id::text, true),
       set_config('request.jwt.claim.sub', actor_id::text, true),
       set_config('test.organization_record_a', record_a::text, true),
       set_config('test.organization_record_b', record_b::text, true),
       set_config('test.organization_record_other_sector', record_other_sector::text, true),
       set_config('test.organization_record_foreign', record_foreign::text, true),
       set_config('test.organization_unit_a', unit_a::text, true),
       set_config('test.organization_unit_b', unit_b::text, true),
       set_config('test.organization_sector_b', sector_b::text, true),
       set_config('test.organization_a', organization_a::text, true)
from organization_test_refs;

set local role authenticated;
do $$
declare
  visible_count integer;
  changed_count integer;
begin
  select count(*) into visible_count
  from public.app_records
  where id in (
    current_setting('test.organization_record_a')::bigint,
    current_setting('test.organization_record_b')::bigint,
    current_setting('test.organization_record_other_sector')::bigint,
    current_setting('test.organization_record_foreign')::bigint
  );
  if visible_count <> 1 then
    raise exception 'O contexto ativo expôs registros de outra unidade: esperado 1, obtido %.', visible_count;
  end if;

  update public.app_records
     set payload = payload || '{"attempted":"unauthorized"}'::jsonb
   where id = current_setting('test.organization_record_other_sector')::bigint;
  get diagnostics changed_count = row_count;
  if changed_count <> 0 then
    raise exception 'Um gestor conseguiu editar um registro de outro setor.';
  end if;

  begin
    update public.app_records
       set organization_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid
     where id = current_setting('test.organization_record_a')::bigint;
    get diagnostics changed_count = row_count;
  exception when insufficient_privilege then
    changed_count := 0;
  end;
  if changed_count <> 0 then
    raise exception 'Um usuário conseguiu mover um registro para outra organização.';
  end;

  perform public.set_active_organizational_context(
    current_setting('test.organization_a')::uuid,
    current_setting('test.organization_unit_b')::uuid,
    current_setting('test.organization_sector_b')::uuid
  );
  select count(*) into visible_count
  from public.app_records
  where id in (
    current_setting('test.organization_record_a')::bigint,
    current_setting('test.organization_record_b')::bigint,
    current_setting('test.organization_record_other_sector')::bigint,
    current_setting('test.organization_record_foreign')::bigint
  );
  if visible_count <> 1 then
    raise exception 'Troca de unidade não atualizou o isolamento do conjunto de registros.';
  end if;
end;
$$;
reset role;

do $$
declare
  unit_a uuid := current_setting('test.organization_unit_a')::uuid;
  record_a bigint := current_setting('test.organization_record_a')::bigint;
  actor uuid := current_setting('test.organization_actor')::uuid;
  refs organization_test_refs%rowtype;
  membership_count integer;
  record_count integer;
begin
  select * into refs from organization_test_refs;
  update public.units set status = 'inactive' where id = unit_a;
  select count(*) into record_count from public.app_records where id = record_a;
  if record_count <> 1 then
    raise exception 'Desativar unidade removeu registros associados.';
  end if;
  update public.units set status = 'active' where id = unit_a;

  update public.memberships
     set active = false, updated_at = now()
   where user_id = actor and organization_id = refs.organization_a
     and unit_id = refs.unit_a and sector_id = refs.sector_a;
  insert into public.memberships (user_id, organization_id, unit_id, sector_id, role)
  values (actor, refs.organization_b, refs.unit_foreign, null, 'unit_admin');
  select count(*) into membership_count
  from public.memberships
  where user_id = actor and organization_id in (refs.organization_a, refs.organization_b);
  if membership_count < 3 then
    raise exception 'A transferência não preservou o vínculo anterior e o novo vínculo.';
  end if;

  insert into public.app_records (collection, record_id, payload)
  values ('organization_test', 'concurrent-unique-key', '{}')
  on conflict (collection, record_id, owner_scope) do nothing;
  insert into public.app_records (collection, record_id, payload)
  values ('organization_test', 'concurrent-unique-key', '{}')
  on conflict (collection, record_id, owner_scope) do nothing;
  select count(*) into record_count
  from public.app_records
  where collection = 'organization_test' and record_id = 'concurrent-unique-key';
  if record_count <> 1 then
    raise exception 'A restrição de unicidade não impediu registros duplicados.';
  end if;
end;
$$;

rollback;
