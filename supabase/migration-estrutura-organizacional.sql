-- Estrutura organizacional para Academia Corporativa.
-- Execute depois de schema.sql e migration-regras-no-servidor.sql.
-- A migração é aditiva: registros antigos permanecem sem escopo até associação
-- explícita por um administrador geral.

begin;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 160),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id)
);

create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (length(btrim(name)) between 2 and 160),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);
create index if not exists units_organization_status_idx
  on public.units (organization_id, status);

create table if not exists public.sectors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  unit_id uuid not null,
  name text not null check (length(btrim(name)) between 2 and 160),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id, unit_id),
  constraint sectors_unit_organization_fk
    foreign key (unit_id, organization_id)
    references public.units (id, organization_id) on delete restrict
);
create index if not exists sectors_unit_status_idx
  on public.sectors (organization_id, unit_id, status);

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid,
  sector_id uuid,
  role text not null check (role in (
    'organization_admin', 'unit_admin', 'sector_manager', 'collaborator'
  )),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint memberships_scope_shape check (
    (role = 'organization_admin' and unit_id is null and sector_id is null)
    or (role = 'unit_admin' and unit_id is not null and sector_id is null)
    or (role = 'sector_manager' and unit_id is not null and sector_id is not null)
    or (role = 'collaborator' and unit_id is not null)
  ),
  constraint memberships_unit_organization_fk
    foreign key (unit_id, organization_id)
    references public.units (id, organization_id) on delete restrict,
  constraint memberships_sector_unit_fk
    foreign key (sector_id, organization_id, unit_id)
    references public.sectors (id, organization_id, unit_id) on delete restrict
);
drop index if exists public.memberships_scope_role_uidx;
create unique index if not exists memberships_organization_role_uidx
  on public.memberships (user_id, organization_id, role)
  where unit_id is null and sector_id is null;
create unique index if not exists memberships_unit_role_uidx
  on public.memberships (user_id, organization_id, unit_id, role)
  where unit_id is not null and sector_id is null;
create unique index if not exists memberships_sector_role_uidx
  on public.memberships (user_id, organization_id, unit_id, sector_id, role)
  where sector_id is not null;
create index if not exists memberships_user_active_idx
  on public.memberships (user_id, active, organization_id);
create index if not exists memberships_scope_active_idx
  on public.memberships (organization_id, unit_id, sector_id, active, role);

create table if not exists public.user_organizational_contexts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid,
  sector_id uuid,
  updated_at timestamptz not null default now(),
  constraint user_context_unit_organization_fk
    foreign key (unit_id, organization_id)
    references public.units (id, organization_id) on delete restrict,
  constraint user_context_sector_unit_fk
    foreign key (sector_id, organization_id, unit_id)
    references public.sectors (id, organization_id, unit_id) on delete restrict,
  constraint user_context_sector_requires_unit check (sector_id is null or unit_id is not null)
);

create table if not exists public.organization_audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete restrict,
  unit_id uuid references public.units(id) on delete restrict,
  sector_id uuid references public.sectors(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE', 'ASSOCIATE')),
  entity_type text not null,
  entity_id text not null,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);
create index if not exists organization_audit_scope_created_idx
  on public.organization_audit_logs (organization_id, unit_id, sector_id, created_at desc);
create index if not exists organization_audit_entity_idx
  on public.organization_audit_logs (entity_type, entity_id, created_at desc);

alter table public.app_records
  add column if not exists organization_id uuid,
  add column if not exists unit_id uuid,
  add column if not exists sector_id uuid,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists status text not null default 'active';

create index if not exists app_records_organization_scope_idx
  on public.app_records (organization_id, unit_id, sector_id, collection);
create index if not exists app_records_created_by_idx
  on public.app_records (created_by);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'app_records_organization_fk'
      and conrelid = 'public.app_records'::regclass
  ) then
    alter table public.app_records
      add constraint app_records_organization_fk
      foreign key (organization_id)
      references public.organizations(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'app_records_unit_organization_fk'
      and conrelid = 'public.app_records'::regclass
  ) then
    alter table public.app_records
      add constraint app_records_unit_organization_fk
      foreign key (unit_id, organization_id)
      references public.units (id, organization_id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'app_records_sector_unit_fk'
      and conrelid = 'public.app_records'::regclass
  ) then
    alter table public.app_records
      add constraint app_records_sector_unit_fk
      foreign key (sector_id, organization_id, unit_id)
      references public.sectors (id, organization_id, unit_id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'app_records_scope_shape'
      and conrelid = 'public.app_records'::regclass
  ) then
    alter table public.app_records
      add constraint app_records_scope_shape
      check (
        (unit_id is null or organization_id is not null)
        and (sector_id is null or unit_id is not null)
      );
  end if;
end;
$$;

create or replace function public.can_access_organization_scope(
  p_organization_id uuid,
  p_unit_id uuid default null,
  p_sector_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and (
    public.is_platform_admin()
    or exists (
      select 1
      from public.memberships m
      join public.profiles p on p.id = m.user_id
      join public.organizations o on o.id = m.organization_id
      where m.user_id = auth.uid()
        and m.active and p.active and not p.pending and o.status = 'active'
        and m.organization_id = p_organization_id
        and (p_unit_id is null or exists (
          select 1 from public.units u
          where u.id = p_unit_id and u.organization_id = p_organization_id and u.status = 'active'
        ))
        and (p_sector_id is null or exists (
          select 1 from public.sectors s
          where s.id = p_sector_id and s.organization_id = p_organization_id
            and s.unit_id = p_unit_id and s.status = 'active'
        ))
        and (m.unit_id is null or m.unit_id = p_unit_id)
        and (m.sector_id is null or m.sector_id = p_sector_id)
    )
  );
$$;
revoke all on function public.can_access_organization_scope(uuid, uuid, uuid) from public, anon;
grant execute on function public.can_access_organization_scope(uuid, uuid, uuid) to authenticated;

create or replace function public.can_manage_organization_scope(
  p_organization_id uuid,
  p_unit_id uuid default null,
  p_sector_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and (
    public.is_platform_admin()
    or exists (
      select 1
      from public.memberships m
      join public.profiles p on p.id = m.user_id
      join public.organizations o on o.id = m.organization_id
      where m.user_id = auth.uid()
        and m.active and p.active and not p.pending and o.status = 'active'
        and m.organization_id = p_organization_id
        and (
          m.role = 'organization_admin'
          or (m.role = 'unit_admin' and p_unit_id is not null and m.unit_id = p_unit_id)
        )
        and (m.unit_id is null or m.unit_id = p_unit_id)
        and (m.sector_id is null or m.sector_id = p_sector_id)
        and exists (
          select 1 from public.user_organizational_contexts c
          where c.user_id = auth.uid()
            and c.organization_id = p_organization_id
            and (c.unit_id is null or p_unit_id is null or c.unit_id = p_unit_id)
            and (c.sector_id is null or p_sector_id is null or c.sector_id = p_sector_id)
        )
    )
  );
$$;
revoke all on function public.can_manage_organization_scope(uuid, uuid, uuid) from public, anon;
grant execute on function public.can_manage_organization_scope(uuid, uuid, uuid) to authenticated;

create or replace function public.can_write_organization_scope(
  p_organization_id uuid,
  p_unit_id uuid,
  p_sector_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and (
    public.is_platform_admin()
    or exists (
      select 1
      from public.memberships m
      join public.profiles p on p.id = m.user_id
      join public.organizations o on o.id = m.organization_id
      where m.user_id = auth.uid()
        and m.active and p.active and not p.pending and o.status = 'active'
        and m.organization_id = p_organization_id
        and (m.unit_id is null or m.unit_id = p_unit_id)
        and (m.sector_id is null or m.sector_id = p_sector_id)
        and m.role in ('organization_admin', 'unit_admin', 'sector_manager')
        and exists (
          select 1 from public.user_organizational_contexts c
          where c.user_id = auth.uid()
            and c.organization_id = p_organization_id
            and (c.unit_id is null or p_unit_id is null or c.unit_id = p_unit_id)
            and (c.sector_id is null or p_sector_id is null or c.sector_id = p_sector_id)
        )
    )
  );
$$;
revoke all on function public.can_write_organization_scope(uuid, uuid, uuid) from public, anon;
grant execute on function public.can_write_organization_scope(uuid, uuid, uuid) to authenticated;

create or replace function public.can_view_organizational_member(p_target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_target_user_id = auth.uid()
    or public.is_platform_admin()
    or exists (
      select 1
      from public.memberships mine
      join public.memberships theirs
        on theirs.organization_id = mine.organization_id
       and theirs.active
       and (mine.unit_id is null or theirs.unit_id = mine.unit_id)
       and (mine.sector_id is null or theirs.sector_id = mine.sector_id)
      join public.profiles target on target.id = theirs.user_id
      where mine.user_id = auth.uid() and mine.active
        and mine.role in ('organization_admin', 'unit_admin')
        and target.active and not target.pending
        and exists (
          select 1 from public.user_organizational_contexts c
          where c.user_id = auth.uid()
            and c.organization_id = mine.organization_id
            and (c.unit_id is null or theirs.unit_id is null or c.unit_id = theirs.unit_id)
            and (c.sector_id is null or theirs.sector_id is null or c.sector_id = theirs.sector_id)
            and public.can_access_organization_scope(
              mine.organization_id, c.unit_id, c.sector_id
            )
        )
    );
$$;
revoke all on function public.can_view_organizational_member(uuid) from public, anon;
grant execute on function public.can_view_organizational_member(uuid) to authenticated;

create or replace function public.is_platform_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_platform_admin()
    or exists (
      select 1
      from public.memberships m
      join public.profiles p on p.id = m.user_id
      join public.organizations o on o.id = m.organization_id
      where m.user_id = auth.uid() and m.active and p.active and not p.pending
        and o.status = 'active'
        and m.role in ('organization_admin', 'unit_admin', 'sector_manager')
        and exists (
          select 1 from public.user_organizational_contexts c
          where c.user_id = auth.uid()
            and c.organization_id = m.organization_id
            and (m.unit_id is null or m.unit_id = c.unit_id)
            and (m.sector_id is null or m.sector_id = c.sector_id)
        )
    );
$$;
revoke all on function public.is_platform_staff() from public, anon;
grant execute on function public.is_platform_staff() to authenticated;

create or replace function public.set_active_organizational_context(
  p_organization_id uuid,
  p_unit_id uuid default null,
  p_sector_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then raise exception 'Faça login para selecionar um escopo.'; end if;
  if not exists (
    select 1 from public.profiles
    where id = actor and active and not pending
  ) then raise exception 'Conta inativa ou aguardando aprovação.'; end if;

  if p_organization_id is null then
    delete from public.user_organizational_contexts where user_id = actor;
    return jsonb_build_object('organizationId', null, 'unitId', null, 'sectorId', null);
  end if;
  if not exists (
    select 1 from public.organizations
    where id = p_organization_id and status = 'active'
  ) then raise exception 'Organização indisponível.'; end if;
  if p_unit_id is not null and not exists (
    select 1 from public.units
    where id = p_unit_id and organization_id = p_organization_id and status = 'active'
  ) then raise exception 'A unidade não pertence à organização ativa ou está desativada.'; end if;
  if p_sector_id is not null and not exists (
    select 1 from public.sectors
    where id = p_sector_id and organization_id = p_organization_id
      and unit_id = p_unit_id and status = 'active'
  ) then raise exception 'O setor não pertence à unidade ativa ou está desativado.'; end if;
  if not public.is_platform_admin()
     and not public.can_access_organization_scope(p_organization_id, p_unit_id, p_sector_id) then
    raise exception 'Você não possui vínculo com esse escopo.';
  end if;

  insert into public.user_organizational_contexts (user_id, organization_id, unit_id, sector_id)
  values (actor, p_organization_id, p_unit_id, p_sector_id)
  on conflict (user_id) do update
    set organization_id = excluded.organization_id,
        unit_id = excluded.unit_id,
        sector_id = excluded.sector_id,
        updated_at = now();
  return jsonb_build_object(
    'organizationId', p_organization_id, 'unitId', p_unit_id, 'sectorId', p_sector_id
  );
end;
$$;
revoke all on function public.set_active_organizational_context(uuid, uuid, uuid) from public, anon;
grant execute on function public.set_active_organizational_context(uuid, uuid, uuid) to authenticated;

create or replace function public.organizational_bootstrap()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  active_context jsonb;
begin
  if actor is null or not exists (
    select 1 from public.profiles where id = actor and active and not pending
  ) then raise exception 'Faça login com uma conta ativa.'; end if;

  select jsonb_build_object(
    'organizationId', organization_id, 'unitId', unit_id, 'sectorId', sector_id
  ) into active_context
  from public.user_organizational_contexts where user_id = actor;

  return jsonb_build_object(
    'organizations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'name', o.name, 'status', o.status
      ) order by o.name)
      from public.organizations o
      where public.is_platform_admin()
         or exists (select 1 from public.memberships m
                    where m.user_id = actor and m.organization_id = o.id and m.active)
    ), '[]'::jsonb),
    'units', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id, 'organizationId', u.organization_id, 'name', u.name, 'status', u.status
      ) order by u.name)
      from public.units u
      where public.is_platform_admin()
         or exists (
           select 1 from public.memberships m
           where m.user_id = actor and m.active and m.organization_id = u.organization_id
             and (m.unit_id is null or m.unit_id = u.id)
         )
    ), '[]'::jsonb),
    'sectors', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'organizationId', s.organization_id, 'unitId', s.unit_id,
        'name', s.name, 'status', s.status
      ) order by s.name)
      from public.sectors s
      where public.is_platform_admin()
         or public.can_access_organization_scope(s.organization_id, s.unit_id, s.id)
    ), '[]'::jsonb),
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'userId', m.user_id, 'organizationId', m.organization_id,
        'unitId', m.unit_id, 'sectorId', m.sector_id, 'role', m.role, 'active', m.active
      ) order by m.created_at)
      from public.memberships m
      where m.user_id = actor
         or public.is_platform_admin()
         or (m.active and public.can_manage_organization_scope(m.organization_id, m.unit_id, m.sector_id))
    ), '[]'::jsonb),
    'context', coalesce(active_context, jsonb_build_object(
      'organizationId', null, 'unitId', null, 'sectorId', null
    ))
  );
end;
$$;
revoke all on function public.organizational_bootstrap() from public, anon;
grant execute on function public.organizational_bootstrap() to authenticated;

create or replace function public.guard_app_record_organization_scope()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_scope public.user_organizational_contexts;
begin
  if current_setting('app.organizational_migration', true) = 'on' then
    new.updated_at := now();
    return new;
  end if;

  new.updated_at := now();
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.created_by := auth.uid();
      new.created_at := now();
    end if;
    if auth.uid() is not null then
      if new.owner_id is null and new.collection in ('settings', 'departments') then
        return new;
      end if;
      select * into selected_scope
      from public.user_organizational_contexts
      where user_id = auth.uid();
      if selected_scope.user_id is not null then
        if new.organization_id is not null
           and (
             new.organization_id is distinct from selected_scope.organization_id
             or (selected_scope.unit_id is not null
                 and new.unit_id is distinct from selected_scope.unit_id)
             or (selected_scope.sector_id is not null and new.sector_id is not null
                 and new.sector_id is distinct from selected_scope.sector_id)
           ) then
          raise exception 'O registro precisa usar o escopo organizacional ativo.';
        end if;
        if new.organization_id is null then
          new.organization_id := selected_scope.organization_id;
          new.unit_id := selected_scope.unit_id;
          new.sector_id := selected_scope.sector_id;
        end if;
      elsif not public.is_platform_admin()
         or new.collection not in ('settings', 'departments') then
        raise exception 'Selecione uma organização autorizada antes de criar registros.';
      end if;
    end if;
  else
    if (new.organization_id, new.unit_id, new.sector_id)
        is distinct from (old.organization_id, old.unit_id, old.sector_id) then
      raise exception 'O escopo de um registro existente não pode ser alterado diretamente.';
    end if;
    if new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at
       or new.owner_id is distinct from old.owner_id then
      raise exception 'A autoria e o proprietário de um registro são imutáveis.';
    end if;
  end if;
  if auth.uid() is not null and new.organization_id is not null
     and not public.is_platform_admin()
     and not public.can_access_organization_scope(
       new.organization_id, new.unit_id, new.sector_id
     ) then
    raise exception 'O vínculo organizacional ativo não autoriza este registro.';
  end if;
  if auth.uid() is not null and new.organization_id is not null
     and not public.is_platform_admin()
     and not exists (
       select 1 from public.user_organizational_contexts c
       where c.user_id = auth.uid()
         and c.organization_id = new.organization_id
         and (c.unit_id is null or new.unit_id is null or c.unit_id = new.unit_id)
         and (c.sector_id is null or new.sector_id is null or c.sector_id = new.sector_id)
     ) then
    raise exception 'O registro precisa pertencer ao escopo organizacional ativo.';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_app_record_organization_scope() from public, anon, authenticated;

drop trigger if exists guard_app_record_organization_scope on public.app_records;
create trigger guard_app_record_organization_scope
before insert or update on public.app_records
for each row execute function public.guard_app_record_organization_scope();

create or replace function public.audit_organizational_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_row jsonb;
  new_row jsonb;
  entity text := tg_table_name;
  entity_key text;
  org_id uuid;
  unit_key uuid;
  sector_key uuid;
  record_collection text;
begin
  if tg_op <> 'INSERT' then old_row := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then new_row := to_jsonb(new); end if;

  if tg_table_name = 'app_records' then
    record_collection := coalesce(new_row ->> 'collection', old_row ->> 'collection');
    if record_collection in (
      'watch', 'notes', 'notifications', 'progress', 'attempts', 'log',
      'ratings', 'comments', 'favorites'
    ) then
      return null;
    end if;
    entity := 'app_record:' || record_collection;
    entity_key := coalesce(new_row ->> 'record_id', old_row ->> 'record_id', '');
  else
    entity_key := coalesce(new_row ->> 'id', old_row ->> 'id', '');
  end if;

  org_id := coalesce(
    nullif(coalesce(new_row ->> 'organization_id', old_row ->> 'organization_id'), '')::uuid
  );
  unit_key := nullif(coalesce(new_row ->> 'unit_id', old_row ->> 'unit_id'), '')::uuid;
  sector_key := nullif(coalesce(new_row ->> 'sector_id', old_row ->> 'sector_id'), '')::uuid;

  insert into public.organization_audit_logs (
    organization_id, unit_id, sector_id, actor_id, operation,
    entity_type, entity_id, old_values, new_values
  )
  values (
    org_id, unit_key, sector_key, auth.uid(), tg_op,
    entity, entity_key, old_row, new_row
  );
  return null;
end;
$$;
revoke all on function public.audit_organizational_change() from public, anon, authenticated;

drop trigger if exists audit_organizations on public.organizations;
create trigger audit_organizations after insert or update or delete on public.organizations
for each row execute function public.audit_organizational_change();
drop trigger if exists audit_units on public.units;
create trigger audit_units after insert or update or delete on public.units
for each row execute function public.audit_organizational_change();
drop trigger if exists audit_sectors on public.sectors;
create trigger audit_sectors after insert or update or delete on public.sectors
for each row execute function public.audit_organizational_change();
drop trigger if exists audit_memberships on public.memberships;
create trigger audit_memberships after insert or update or delete on public.memberships
for each row execute function public.audit_organizational_change();
drop trigger if exists audit_app_records_organization on public.app_records;
create trigger audit_app_records_organization after insert or update or delete on public.app_records
for each row execute function public.audit_organizational_change();

create or replace function public.create_organization(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'Somente o administrador geral pode criar organizações.';
  end if;
  if length(btrim(coalesce(p_name, ''))) not between 2 and 160 then
    raise exception 'O nome da organização deve ter entre 2 e 160 caracteres.';
  end if;

  insert into public.organizations (name, created_by)
  values (btrim(p_name), auth.uid())
  returning id into new_id;
  insert into public.memberships (user_id, organization_id, role, created_by)
  values (auth.uid(), new_id, 'organization_admin', auth.uid())
  on conflict do nothing;
  perform public.set_active_organizational_context(new_id, null, null);
  return new_id;
end;
$$;
revoke all on function public.create_organization(text) from public, anon;
grant execute on function public.create_organization(text) to authenticated;

create or replace function public.save_organization(
  p_organization_id uuid,
  p_name text,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_status not in ('active', 'inactive') then
    raise exception 'Situação da organização inválida.';
  end if;
  if length(btrim(coalesce(p_name, ''))) not between 2 and 160 then
    raise exception 'O nome da organização deve ter entre 2 e 160 caracteres.';
  end if;
  if not public.can_manage_organization_scope(p_organization_id, null, null) then
    raise exception 'Sem permissão para editar esta organização.';
  end if;
  update public.organizations
     set name = btrim(p_name), status = p_status, updated_at = now()
   where id = p_organization_id;
  if not found then raise exception 'Organização não encontrada.'; end if;
end;
$$;
revoke all on function public.save_organization(uuid, text, text) from public, anon;
grant execute on function public.save_organization(uuid, text, text) to authenticated;

create or replace function public.save_unit(
  p_operation text,
  p_unit_id uuid,
  p_organization_id uuid,
  p_name text,
  p_status text default 'active'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result_id uuid;
  target_org uuid := p_organization_id;
begin
  if p_operation not in ('create', 'update', 'deactivate', 'activate') then
    raise exception 'Operação de unidade inválida.';
  end if;
  if p_operation = 'create' then
    if not public.can_manage_organization_scope(target_org, null, null) then
      raise exception 'Sem permissão para criar unidade nesta organização.';
    end if;
    if length(btrim(coalesce(p_name, ''))) not between 2 and 160 then
      raise exception 'O nome da unidade deve ter entre 2 e 160 caracteres.';
    end if;
    insert into public.units (organization_id, name, created_by)
    values (target_org, btrim(p_name), auth.uid()) returning id into result_id;
    return result_id;
  end if;

  select organization_id into target_org from public.units where id = p_unit_id for update;
  if target_org is null or not public.can_manage_organization_scope(target_org, p_unit_id, null) then
    raise exception 'Unidade não encontrada ou sem permissão.';
  end if;
  if p_operation = 'update' then
    if length(btrim(coalesce(p_name, ''))) not between 2 and 160 then
      raise exception 'O nome da unidade deve ter entre 2 e 160 caracteres.';
    end if;
    update public.units set name = btrim(p_name), updated_at = now() where id = p_unit_id;
  else
    update public.units
       set status = case when p_operation = 'deactivate' then 'inactive' else 'active' end,
           updated_at = now()
     where id = p_unit_id;
  end if;
  return p_unit_id;
end;
$$;
revoke all on function public.save_unit(text, uuid, uuid, text, text) from public, anon;
grant execute on function public.save_unit(text, uuid, uuid, text, text) to authenticated;

create or replace function public.save_sector(
  p_operation text,
  p_sector_id uuid,
  p_organization_id uuid,
  p_unit_id uuid,
  p_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result_id uuid;
  target_org uuid := p_organization_id;
  target_unit uuid := p_unit_id;
begin
  if p_operation not in ('create', 'update', 'deactivate', 'activate') then
    raise exception 'Operação de setor inválida.';
  end if;
  if p_operation = 'create' then
    if not exists (
      select 1 from public.units
      where id = target_unit and organization_id = target_org and status = 'active'
    ) then raise exception 'Selecione uma unidade ativa da organização.'; end if;
    if not public.can_manage_organization_scope(target_org, target_unit, null) then
      raise exception 'Sem permissão para criar setor nesta unidade.';
    end if;
    if length(btrim(coalesce(p_name, ''))) not between 2 and 160 then
      raise exception 'O nome do setor deve ter entre 2 e 160 caracteres.';
    end if;
    insert into public.sectors (organization_id, unit_id, name, created_by)
    values (target_org, target_unit, btrim(p_name), auth.uid()) returning id into result_id;
    return result_id;
  end if;

  select organization_id, unit_id into target_org, target_unit
  from public.sectors where id = p_sector_id for update;
  if target_org is null
     or not public.can_manage_organization_scope(target_org, target_unit, p_sector_id) then
    raise exception 'Setor não encontrado ou sem permissão.';
  end if;
  if p_operation = 'update' then
    if length(btrim(coalesce(p_name, ''))) not between 2 and 160 then
      raise exception 'O nome do setor deve ter entre 2 e 160 caracteres.';
    end if;
    update public.sectors set name = btrim(p_name), updated_at = now() where id = p_sector_id;
  else
    update public.sectors
       set status = case when p_operation = 'deactivate' then 'inactive' else 'active' end,
           updated_at = now()
     where id = p_sector_id;
  end if;
  return p_sector_id;
end;
$$;
revoke all on function public.save_sector(text, uuid, uuid, uuid, text) from public, anon;
grant execute on function public.save_sector(text, uuid, uuid, uuid, text) to authenticated;

create or replace function public.set_organizational_membership(
  p_user_id uuid,
  p_organization_id uuid,
  p_unit_id uuid,
  p_sector_id uuid,
  p_role text,
  p_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  membership_id uuid;
  can_manage boolean;
begin
  if p_role not in ('organization_admin', 'unit_admin', 'sector_manager', 'collaborator') then
    raise exception 'Função organizacional inválida.';
  end if;
  if not (
    (p_role = 'organization_admin' and p_unit_id is null and p_sector_id is null)
    or (p_role = 'unit_admin' and p_unit_id is not null and p_sector_id is null)
    or (p_role = 'sector_manager' and p_unit_id is not null and p_sector_id is not null)
    or (p_role = 'collaborator' and p_unit_id is not null)
  ) then raise exception 'A função e o escopo informados não são compatíveis.'; end if;
  if not exists (
    select 1 from public.organizations
    where id = p_organization_id and status = 'active'
  ) then raise exception 'Selecione uma organização ativa.'; end if;
  if p_unit_id is not null and not exists (
    select 1 from public.units
    where id = p_unit_id and organization_id = p_organization_id and status = 'active'
  ) then raise exception 'Selecione uma unidade ativa da organização.'; end if;
  if p_sector_id is not null and not exists (
    select 1 from public.sectors
    where id = p_sector_id and unit_id = p_unit_id
      and organization_id = p_organization_id and status = 'active'
  ) then raise exception 'Selecione um setor ativo da unidade.'; end if;

  can_manage := public.can_manage_organization_scope(
    p_organization_id, p_unit_id, p_sector_id
  );
  if not can_manage then raise exception 'Sem permissão para gerenciar usuários neste escopo.'; end if;
  if p_role = 'organization_admin' and not public.is_platform_admin()
     and not exists (
       select 1 from public.memberships m
       where m.user_id = auth.uid() and m.organization_id = p_organization_id
         and m.role = 'organization_admin' and m.active
     ) then
    raise exception 'Somente o administrador geral ou da organização pode conceder essa função.';
  end if;

  select id into membership_id from public.memberships
  where user_id = p_user_id and organization_id = p_organization_id
    and unit_id is not distinct from p_unit_id
    and sector_id is not distinct from p_sector_id
    and role = p_role
  for update;

  if membership_id is null then
    insert into public.memberships (
      user_id, organization_id, unit_id, sector_id, role, active, created_by
    ) values (
      p_user_id, p_organization_id, p_unit_id, p_sector_id, p_role, p_active, auth.uid()
    ) returning id into membership_id;
  else
    update public.memberships
       set active = p_active, updated_at = now()
     where id = membership_id;
  end if;
  return membership_id;
end;
$$;
revoke all on function public.set_organizational_membership(uuid, uuid, uuid, uuid, text, boolean) from public, anon;
grant execute on function public.set_organizational_membership(uuid, uuid, uuid, uuid, text, boolean) to authenticated;

create or replace function public.associate_legacy_app_record(
  p_record_id bigint,
  p_organization_id uuid,
  p_unit_id uuid default null,
  p_sector_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Somente o administrador geral pode classificar registros antigos.';
  end if;
  if p_sector_id is not null and p_unit_id is null then
    raise exception 'Selecione a unidade antes de selecionar o setor.';
  end if;
  if not exists (
    select 1 from public.organizations
    where id = p_organization_id and status = 'active'
  ) then raise exception 'Selecione uma organização ativa.'; end if;
  if p_unit_id is not null and not exists (
    select 1 from public.units
    where id = p_unit_id and organization_id = p_organization_id and status = 'active'
  ) then raise exception 'A unidade não pertence à organização ativa.'; end if;
  if p_sector_id is not null and not exists (
    select 1 from public.sectors
    where id = p_sector_id and unit_id = p_unit_id
      and organization_id = p_organization_id and status = 'active'
  ) then raise exception 'O setor não pertence à unidade selecionada.'; end if;

  perform set_config('app.organizational_migration', 'on', true);
  update public.app_records
     set organization_id = p_organization_id,
         unit_id = p_unit_id,
         sector_id = p_sector_id,
         created_by = coalesce(created_by, auth.uid()),
         updated_at = now()
   where id = p_record_id and organization_id is null;
  if not found then raise exception 'Registro antigo não encontrado ou já classificado.'; end if;
end;
$$;
revoke all on function public.associate_legacy_app_record(bigint, uuid, uuid, uuid) from public, anon;
grant execute on function public.associate_legacy_app_record(bigint, uuid, uuid, uuid) to authenticated;

create or replace function public.is_in_active_organizational_context(
  p_organization_id uuid,
  p_unit_id uuid,
  p_sector_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_platform_admin()
    or exists (
      select 1 from public.user_organizational_contexts c
      where c.user_id = auth.uid()
        and c.organization_id = p_organization_id
        and (c.unit_id is null or p_unit_id is null or c.unit_id = p_unit_id)
        and (c.sector_id is null or p_sector_id is null or c.sector_id = p_sector_id)
    );
$$;
revoke all on function public.is_in_active_organizational_context(uuid, uuid, uuid) from public, anon;
grant execute on function public.is_in_active_organizational_context(uuid, uuid, uuid) to authenticated;

create or replace function public.has_course_enrollment(p_course_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.app_records enrollment
    join public.app_records course
      on course.collection = 'courses'
     and course.record_id = p_course_id
     and course.organization_id = enrollment.organization_id
     and course.unit_id is not distinct from enrollment.unit_id
     and (course.sector_id is null or course.sector_id = enrollment.sector_id)
    where enrollment.collection = 'enrollments'
      and enrollment.owner_id = auth.uid()
      and enrollment.payload ->> 'courseId' = p_course_id
      and public.can_access_organization_scope(
        enrollment.organization_id, enrollment.unit_id, enrollment.sector_id
      )
      and public.is_in_active_organizational_context(
        course.organization_id, course.unit_id, course.sector_id
      )
  );
$$;
revoke all on function public.has_course_enrollment(text) from public, anon;
grant execute on function public.has_course_enrollment(text) to authenticated;

create or replace function public.can_read_app_record(
  p_owner_id uuid,
  p_organization_id uuid,
  p_unit_id uuid,
  p_sector_id uuid,
  p_collection text,
  p_record_id text,
  p_payload jsonb
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when auth.uid() is null then
      p_owner_id is null and p_organization_id is null
      and p_collection in ('settings', 'departments')
    when public.is_platform_admin() then true
    when p_organization_id is null and p_owner_id is null
      and p_collection in ('settings', 'departments') then true
    when p_organization_id is null then false
    when not exists (
      select 1 from public.user_organizational_contexts c
      where c.user_id = auth.uid()
        and c.organization_id = p_organization_id
        and (c.unit_id is null or p_unit_id is null or c.unit_id = p_unit_id)
        and (c.sector_id is null or p_sector_id is null or c.sector_id = p_sector_id)
    ) then false
    when not public.can_access_organization_scope(p_organization_id, p_unit_id, p_sector_id) then false
    when p_owner_id = auth.uid() then true
    when p_owner_id is not null then public.is_platform_staff()
    when p_collection in ('settings', 'departments') then true
    when p_collection = 'courses' then
      (p_payload ->> 'status' = 'publicado')
      or public.is_platform_staff()
      or public.has_course_enrollment(p_record_id)
    when p_collection = 'lessons' then
      public.is_platform_staff()
      or public.has_course_enrollment(p_payload ->> 'courseId')
      or exists (
        select 1 from public.app_records c
        where c.collection = 'courses' and c.organization_id = p_organization_id
          and c.record_id = p_payload ->> 'courseId'
          and (c.unit_id is null or c.unit_id is not distinct from p_unit_id)
          and (c.sector_id is null or c.sector_id is not distinct from p_sector_id)
          and public.can_access_organization_scope(c.organization_id, c.unit_id, c.sector_id)
          and public.is_in_active_organizational_context(
            c.organization_id, c.unit_id, c.sector_id
          )
          and c.payload ->> 'status' = 'publicado'
      )
    when p_collection = 'quizzes' then public.is_platform_staff()
    when p_collection = 'products' then public.is_platform_staff() or p_payload ->> 'active' = 'true'
    when p_collection = 'announcements' then
      public.is_platform_staff() or public.is_visible_announcement(p_payload)
    when p_collection = 'audit' then public.is_platform_staff()
    else public.is_platform_staff()
  end;
$$;
revoke all on function public.can_read_app_record(uuid, uuid, uuid, uuid, text, text, jsonb) from public, anon;
grant execute on function public.can_read_app_record(uuid, uuid, uuid, uuid, text, text, jsonb) to anon, authenticated;

create or replace function public.can_view_course(p_course_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.app_records course
    where course.collection = 'courses'
      and course.record_id = p_course_id
      and course.organization_id is not null
      and public.can_access_organization_scope(
        course.organization_id, course.unit_id, course.sector_id
      )
      and public.is_in_active_organizational_context(
        course.organization_id, course.unit_id, course.sector_id
      )
      and (
        public.is_platform_staff()
        or public.has_course_enrollment(p_course_id)
        or course.payload ->> 'status' = 'publicado'
      )
  );
$$;
revoke all on function public.can_view_course(text) from public, anon;
grant execute on function public.can_view_course(text) to authenticated;

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
           'questionCount', jsonb_array_length(coalesce(q.payload -> 'questions', '[]'::jsonb))
         )), '[]'::jsonb)
  from public.app_records q
  where q.collection = 'quizzes' and q.owner_id is null
    and public.can_access_organization_scope(q.organization_id, q.unit_id, q.sector_id)
    and public.is_in_active_organizational_context(q.organization_id, q.unit_id, q.sector_id)
    and (public.is_platform_staff() or public.has_course_enrollment(q.record_id));
$$;
revoke all on function public.my_quiz_overview() from public, anon;
grant execute on function public.my_quiz_overview() to authenticated;

create or replace function public.ranking_xp()
returns table (user_id bigint, weekly_xp bigint, monthly_xp bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with selected_scope as (
    select organization_id, unit_id, sector_id
    from public.user_organizational_contexts
    where user_id = auth.uid()
  ),
  period_start as (
    select
      date_trunc('week', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' as week_start,
      date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' as month_start
  )
  select profile.internal_id,
    coalesce(sum(greatest(coalesce((entry.payload ->> 'delta')::integer, 0), 0))
      filter (where to_timestamp((entry.payload ->> 'at')::double precision / 1000) >= period_start.week_start), 0)::bigint,
    coalesce(sum(greatest(coalesce((entry.payload ->> 'delta')::integer, 0), 0))
      filter (where to_timestamp((entry.payload ->> 'at')::double precision / 1000) >= period_start.month_start), 0)::bigint
  from public.profiles profile
  cross join period_start
  left join public.app_records entry
    on entry.collection = 'log'
   and entry.owner_id = profile.id
   and entry.organization_id = (select organization_id from selected_scope)
   and ((select unit_id from selected_scope) is null
        or entry.unit_id is null or entry.unit_id = (select unit_id from selected_scope))
   and ((select sector_id from selected_scope) is null
        or entry.sector_id is null or entry.sector_id = (select sector_id from selected_scope))
   and entry.payload ? 'at'
   and to_timestamp((entry.payload ->> 'at')::double precision / 1000) <= now()
   and coalesce(entry.payload ->> 'reason', '') not like 'Estorno:%'
  where profile.role = 'aluno' and profile.active and not profile.pending
    and exists (
      select 1 from public.memberships m
      where m.user_id = profile.id and m.active
        and m.organization_id = (select organization_id from selected_scope)
        and ((select unit_id from selected_scope) is null
             or m.unit_id is null or m.unit_id = (select unit_id from selected_scope))
        and ((select sector_id from selected_scope) is null
             or m.sector_id is null or m.sector_id = (select sector_id from selected_scope))
    )
    and auth.uid() is not null
  group by profile.internal_id;
$$;
revoke all on function public.ranking_xp() from public, anon;
grant execute on function public.ranking_xp() to authenticated;

create or replace function public.redeem_product(p_product_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me public.profiles := public.current_member(true);
  product_row public.app_records;
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
  select * into product_row
  from public.app_records
  where collection = 'products' and owner_id is null and record_id = p_product_id
  for update;
  if product_row.id is null
     or product_row.payload ->> 'active' is distinct from 'true'
     or product_row.organization_id is null
     or not public.can_access_organization_scope(
       product_row.organization_id, product_row.unit_id, product_row.sector_id
     )
     or not public.is_in_active_organizational_context(
       product_row.organization_id, product_row.unit_id, product_row.sector_id
     ) then
    raise exception 'Produto indisponível neste escopo.';
  end if;

  cost := coalesce((product_row.payload ->> 'cost')::integer, 0);
  stock := coalesce((product_row.payload ->> 'stock')::integer, 0);
  unlimited := coalesce((product_row.payload ->> 'unlimited')::boolean, false);
  per_person := coalesce((product_row.payload ->> 'limit')::integer, 0);
  if cost < 0 then raise exception 'Produto com preço inválido.'; end if;
  if not unlimited and stock <= 0 then raise exception 'Produto sem estoque.'; end if;
  if me.points < cost then raise exception 'Pontos insuficientes.'; end if;

  select count(*) into already
  from public.app_records
  where collection = 'redemptions' and owner_id = me.id
    and payload ->> 'productId' = p_product_id
    and organization_id = product_row.organization_id
    and payload ->> 'status' <> 'cancelado';
  if per_person > 0 and already >= per_person then
    raise exception 'Você atingiu o limite deste produto.';
  end if;

  if not unlimited then
    update public.app_records
       set payload = jsonb_set(payload, '{stock}', to_jsonb(stock - 1)), updated_at = now()
     where id = product_row.id;
  end if;
  perform public.grant_points(me.id, -cost, 'Troca: ' || (product_row.payload ->> 'name'));

  insert into public.app_records (collection, record_id, owner_id, payload)
  values ('redemptions', redemption_id::text, me.id,
    jsonb_build_object('id', redemption_id, 'userId', me.internal_id,
      'productId', p_product_id::numeric, 'productName', product_row.payload ->> 'name',
      'cost', cost, 'status', 'pendente', 'code', code, 'at', now_ms, 'note', ''));

  for admin_row in
    select distinct p.id, p.internal_id
    from public.memberships m
    join public.profiles p on p.id = m.user_id
    where m.organization_id = product_row.organization_id and m.active
      and m.role in ('organization_admin', 'unit_admin')
      and p.active and not p.pending
  loop
    perform public.push_notification(admin_row.id, admin_row.internal_id,
      'Nova troca: ' || (product_row.payload ->> 'name') || ' (' || me.name || ')',
      '#/admin/redemptions');
  end loop;

  perform public.check_badges(me.id);
  return jsonb_build_object('code', code, 'id', redemption_id);
end;
$$;
revoke all on function public.redeem_product(text) from public, anon;
grant execute on function public.redeem_product(text) to authenticated;

create or replace function public.cancel_redemption(p_redemption_id text, p_note text default '')
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me public.profiles := public.current_member();
  redemption public.app_records;
  redemption_status text;
begin
  select * into redemption
  from public.app_records
  where collection = 'redemptions' and record_id = p_redemption_id
  for update;
  if redemption.id is null then raise exception 'Pedido não encontrado.'; end if;
  if redemption.organization_id is null
     or not public.can_access_organization_scope(
       redemption.organization_id, redemption.unit_id, redemption.sector_id
     )
     or not public.is_in_active_organizational_context(
       redemption.organization_id, redemption.unit_id, redemption.sector_id
     ) then raise exception 'Sem acesso a este pedido.'; end if;
  redemption_status := redemption.payload ->> 'status';

  if redemption.owner_id <> me.id and not public.is_platform_staff() then
    raise exception 'Sem permissão para cancelar este pedido.';
  end if;
  if redemption.owner_id = me.id and not public.is_platform_staff()
     and redemption_status <> 'pendente' then
    raise exception 'Só dá para cancelar pedidos pendentes.';
  end if;
  if redemption_status in ('entregue', 'cancelado') then
    raise exception 'Este pedido não pode ser cancelado.';
  end if;

  update public.app_records
     set payload = payload || jsonb_build_object(
       'status', 'cancelado', 'note', left(coalesce(p_note, ''), 500)
     ),
         updated_at = now()
   where id = redemption.id;
  perform public.grant_points(
    redemption.owner_id, (redemption.payload ->> 'cost')::integer,
    'Estorno: ' || (redemption.payload ->> 'productName'), false
  );

  update public.app_records
     set payload = jsonb_set(payload, '{stock}', to_jsonb((payload ->> 'stock')::integer + 1)),
         updated_at = now()
   where collection = 'products'
     and record_id = redemption.payload ->> 'productId'
     and organization_id = redemption.organization_id
     and unit_id is not distinct from redemption.unit_id
     and (sector_id is null or sector_id = redemption.sector_id)
     and coalesce((payload ->> 'unlimited')::boolean, false) = false;
end;
$$;
revoke all on function public.cancel_redemption(text, text) from public, anon;
grant execute on function public.cancel_redemption(text, text) to authenticated;

create or replace function public.can_manage_member_profile(p_target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_platform_admin()
    or exists (
      select 1 from public.memberships mine
      join public.memberships target
        on target.organization_id = mine.organization_id and target.user_id = p_target_user_id
        and target.active
        and (mine.unit_id is null or target.unit_id = mine.unit_id)
        and (mine.sector_id is null or target.sector_id = mine.sector_id)
      where mine.user_id = auth.uid() and mine.active
        and mine.role in ('organization_admin', 'unit_admin', 'sector_manager')
        and exists (
          select 1 from public.user_organizational_contexts c
          where c.user_id = auth.uid()
            and c.organization_id = mine.organization_id
            and (c.unit_id is null or target.unit_id is null or c.unit_id = target.unit_id)
            and (c.sector_id is null or target.sector_id is null or c.sector_id = target.sector_id)
            and public.can_access_organization_scope(
              mine.organization_id, c.unit_id, c.sector_id
            )
        )
    );
$$;
revoke all on function public.can_manage_member_profile(uuid) from public, anon;
grant execute on function public.can_manage_member_profile(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.units enable row level security;
alter table public.sectors enable row level security;
alter table public.memberships enable row level security;
alter table public.user_organizational_contexts enable row level security;
alter table public.organization_audit_logs enable row level security;

drop policy if exists "Organizations readable by members" on public.organizations;
create policy "Organizations readable by members"
on public.organizations for select to authenticated
using (
  public.is_platform_admin()
  or exists (select 1 from public.memberships m
             where m.user_id = auth.uid() and m.organization_id = id and m.active)
);

drop policy if exists "Units readable by authorized members" on public.units;
create policy "Units readable by authorized members"
on public.units for select to authenticated
using (
  public.is_platform_admin()
  or exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid() and m.active
      and m.organization_id = units.organization_id
      and (m.unit_id is null or m.unit_id = units.id)
  )
);

drop policy if exists "Sectors readable by authorized members" on public.sectors;
create policy "Sectors readable by authorized members"
on public.sectors for select to authenticated
using (public.can_access_organization_scope(organization_id, unit_id, id));

drop policy if exists "Memberships readable by self or managers" on public.memberships;
create policy "Memberships readable by self or managers"
on public.memberships for select to authenticated
using (
  user_id = auth.uid()
  or public.is_platform_admin()
  or public.can_manage_organization_scope(organization_id, unit_id, sector_id)
);

drop policy if exists "Audit logs readable by scoped managers" on public.organization_audit_logs;
create policy "Audit logs readable by scoped managers"
on public.organization_audit_logs for select to authenticated
using (
  public.is_platform_admin()
  or public.can_manage_organization_scope(organization_id, unit_id, sector_id)
);

drop policy if exists "Profiles readable by owner and staff" on public.profiles;
create policy "Profiles readable by owner and staff"
on public.profiles for select to authenticated
using (id = auth.uid() or public.is_platform_admin());
drop policy if exists "Profiles editable by owner and staff" on public.profiles;
create policy "Profiles editable by owner and staff"
on public.profiles for update to authenticated
using (id = auth.uid() or public.is_platform_admin())
with check (id = auth.uid() or public.is_platform_admin());

create or replace view public.member_directory
with (security_invoker = false)
as
select p.id, p.internal_id, p.name, p.role, p.dept, p.job_title,
       case when p.id = auth.uid() or public.is_platform_admin() then p.points else 0 end as points,
       case when p.id = auth.uid() or public.is_platform_admin() then p.xp else 0 end as xp,
       case when p.id = auth.uid() or public.is_platform_admin() then p.badges else '[]'::jsonb end as badges,
       p.theme, p.created_at, p.last_login,
       case when p.id = auth.uid() or public.is_platform_admin() then p.streak else 0 end as streak,
       case when p.id = auth.uid() or public.is_platform_admin() then p.last_checkin else null end as last_checkin,
       p.avatar, p.email
from public.profiles p
where public.can_view_organizational_member(p.id);
grant select on public.member_directory to authenticated;

drop policy if exists "Read platform records" on public.app_records;
create policy "Read platform records"
on public.app_records for select to anon, authenticated
using (public.can_read_app_record(
  owner_id, organization_id, unit_id, sector_id, collection, record_id, payload
));

drop policy if exists "Insert owned or staff records" on public.app_records;
create policy "Insert owned or staff records"
on public.app_records for insert to authenticated
with check (
  (
    organization_id is not null
    and public.can_write_organization_scope(organization_id, unit_id, sector_id)
  )
  or (
    organization_id is null and public.is_platform_admin()
    and collection in ('settings', 'departments')
  )
  or (
    owner_id = auth.uid()
    and collection in ('watch', 'notes', 'ratings', 'comments', 'favorites', 'notifications')
    and organization_id is not null
    and public.can_access_organization_scope(organization_id, unit_id, sector_id)
  )
);

drop policy if exists "Update owned or staff records" on public.app_records;
create policy "Update owned or staff records"
on public.app_records for update to authenticated
using (
  (
    organization_id is not null
    and public.can_write_organization_scope(organization_id, unit_id, sector_id)
  )
  or (owner_id = auth.uid() and organization_id is not null
      and public.can_access_organization_scope(organization_id, unit_id, sector_id))
  or (organization_id is null and public.is_platform_admin()
      and collection in ('settings', 'departments'))
)
with check (
  (
    organization_id is not null
    and public.can_write_organization_scope(organization_id, unit_id, sector_id)
  )
  or (owner_id = auth.uid() and organization_id is not null
      and public.can_access_organization_scope(organization_id, unit_id, sector_id)
      and collection in ('watch', 'notes', 'ratings', 'comments', 'favorites', 'notifications'))
  or (organization_id is null and public.is_platform_admin()
      and collection in ('settings', 'departments'))
);

drop policy if exists "Delete owned or staff records" on public.app_records;
create policy "Delete owned or staff records"
on public.app_records for delete to authenticated
using (
  (
    organization_id is not null
    and public.can_write_organization_scope(organization_id, unit_id, sector_id)
  )
  or (owner_id = auth.uid() and organization_id is not null
      and public.can_access_organization_scope(organization_id, unit_id, sector_id)
      and collection in ('watch', 'notes', 'ratings', 'comments', 'favorites', 'notifications'))
  or (organization_id is null and public.is_platform_admin()
      and collection in ('settings', 'departments'))
);

grant select on public.organizations, public.units, public.sectors,
  public.memberships, public.organization_audit_logs to authenticated;
grant select on public.app_records to anon;
grant select, insert, update, delete on public.app_records to authenticated;
revoke insert, update, delete on public.organizations, public.units, public.sectors,
  public.memberships, public.user_organizational_contexts, public.organization_audit_logs
  from anon, authenticated;
revoke all on public.user_organizational_contexts from public, anon, authenticated;

drop policy if exists "Read course files" on storage.objects;
create policy "Read course files"
on storage.objects for select to authenticated
using (
  bucket_id in ('course-videos', 'course-materials')
  and public.can_view_course((storage.foldername(name))[1])
);

drop policy if exists "Staff upload course files" on storage.objects;
create policy "Staff upload course files"
on storage.objects for insert to authenticated
with check (
  bucket_id in ('course-videos', 'course-materials')
  and exists (
    select 1 from public.app_records course
    where course.collection = 'courses'
      and course.record_id = (storage.foldername(name))[1]
      and public.can_write_organization_scope(
        course.organization_id, course.unit_id, course.sector_id
      )
  )
);

drop policy if exists "Staff delete course files" on storage.objects;
create policy "Staff delete course files"
on storage.objects for delete to authenticated
using (
  bucket_id in ('course-videos', 'course-materials')
  and exists (
    select 1 from public.app_records course
    where course.collection = 'courses'
      and course.record_id = (storage.foldername(name))[1]
      and public.can_write_organization_scope(
        course.organization_id, course.unit_id, course.sector_id
      )
  )
);

drop policy if exists "Read published announcement images" on storage.objects;
create policy "Read published announcement images"
on storage.objects for select to authenticated
using (
  bucket_id = 'announcement-images'
  and (
    public.is_platform_admin()
    or exists (
      select 1 from public.app_records announcement
      where announcement.collection = 'announcements'
        and announcement.owner_id is null
        and announcement.payload ->> 'imagePath' = name
        and public.can_access_organization_scope(
          announcement.organization_id, announcement.unit_id, announcement.sector_id
        )
        and public.is_in_active_organizational_context(
          announcement.organization_id, announcement.unit_id, announcement.sector_id
        )
        and (public.is_platform_staff()
             or public.is_visible_announcement(announcement.payload))
    )
  )
);

drop policy if exists "Staff upload announcement images" on storage.objects;
create policy "Staff upload announcement images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'announcement-images'
  and exists (
    select 1 from public.user_organizational_contexts context
    where context.user_id = auth.uid()
      and context.organization_id = nullif((storage.foldername(name))[1], '_')::uuid
      and coalesce(context.unit_id::text, '_') = (storage.foldername(name))[2]
      and coalesce(context.sector_id::text, '_') = (storage.foldername(name))[3]
      and public.can_write_organization_scope(
        context.organization_id, context.unit_id, context.sector_id
      )
  )
);

drop policy if exists "Staff delete announcement images" on storage.objects;
create policy "Staff delete announcement images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'announcement-images'
  and (
    public.is_platform_admin()
    or exists (
      select 1 from public.user_organizational_contexts context
      where context.user_id = auth.uid()
        and context.organization_id = nullif((storage.foldername(name))[1], '_')::uuid
        and coalesce(context.unit_id::text, '_') = (storage.foldername(name))[2]
        and coalesce(context.sector_id::text, '_') = (storage.foldername(name))[3]
        and public.can_write_organization_scope(
          context.organization_id, context.unit_id, context.sector_id
        )
    )
  )
);

commit;
