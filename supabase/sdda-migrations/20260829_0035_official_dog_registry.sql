begin;

create table if not exists public.sdda_registry_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  source_url text,
  source_refreshed_at text,
  imported_by uuid not null references auth.users(id),
  imported_at timestamptz not null default now(),
  completed_at timestamptz,
  row_count integer not null default 0,
  is_active boolean not null default false
);

create unique index if not exists sdda_registry_one_active_snapshot
  on public.sdda_registry_snapshots(is_active) where is_active;

create table if not exists public.sdda_registry_dogs (
  snapshot_id uuid not null references public.sdda_registry_snapshots(id) on delete cascade,
  registration_number text not null,
  call_name text not null,
  breed text,
  sex text,
  owner_number text,
  owner_name text,
  qualifying_counts jsonb not null default '{}'::jsonb,
  primary key(snapshot_id,registration_number)
);

create index if not exists sdda_registry_dogs_number_lookup
  on public.sdda_registry_dogs(lower(trim(registration_number)));

alter table public.sdda_registry_snapshots enable row level security;
alter table public.sdda_registry_dogs enable row level security;

drop policy if exists sdda_registry_snapshots_administrator_read on public.sdda_registry_snapshots;
create policy sdda_registry_snapshots_administrator_read on public.sdda_registry_snapshots
  for select to authenticated using(public.sdda_is_administrator());

drop policy if exists sdda_registry_dogs_administrator_read on public.sdda_registry_dogs;
create policy sdda_registry_dogs_administrator_read on public.sdda_registry_dogs
  for select to authenticated using(public.sdda_is_administrator());

create or replace function public.sdda_begin_registry_import(
  source_name text,
  source_url text default null,
  source_refreshed_at text default null
) returns uuid
language plpgsql security definer set search_path=public set row_security=off
as $begin_import$
declare snapshot_id uuid;
begin
  if not public.sdda_is_administrator() then raise exception 'Administrator access is required'; end if;
  if length(trim(coalesce(source_name,'')))<1 then raise exception 'The workbook source name is required'; end if;
  insert into public.sdda_registry_snapshots(source_name,source_url,source_refreshed_at,imported_by)
  values(trim(source_name),nullif(trim(source_url),''),nullif(trim(source_refreshed_at),''),auth.uid())
  returning id into snapshot_id;
  return snapshot_id;
end;
$begin_import$;

create or replace function public.sdda_import_registry_chunk(target_snapshot_id uuid,rows jsonb)
returns integer language plpgsql security definer set search_path=public set row_security=off
as $import_chunk$
declare imported integer;
begin
  if not public.sdda_is_administrator() then raise exception 'Administrator access is required'; end if;
  if not exists(select 1 from public.sdda_registry_snapshots where id=target_snapshot_id and imported_by=auth.uid() and completed_at is null)
    then raise exception 'Registry import is unavailable'; end if;
  if jsonb_typeof(rows)<>'array' then raise exception 'Registry rows must be an array'; end if;
  insert into public.sdda_registry_dogs(snapshot_id,registration_number,call_name,breed,sex,owner_number,owner_name,qualifying_counts)
  select target_snapshot_id,trim(item->>'registration_number'),trim(item->>'call_name'),nullif(trim(item->>'breed'),''),
    nullif(trim(item->>'sex'),''),nullif(trim(item->>'owner_number'),''),nullif(trim(item->>'owner_name'),''),
    coalesce(item->'qualifying_counts','{}'::jsonb)
  from jsonb_array_elements(rows) item
  where length(trim(coalesce(item->>'registration_number','')))>0 and length(trim(coalesce(item->>'call_name','')))>0
  on conflict(snapshot_id,registration_number) do update set call_name=excluded.call_name,breed=excluded.breed,sex=excluded.sex,
    owner_number=excluded.owner_number,owner_name=excluded.owner_name,qualifying_counts=excluded.qualifying_counts;
  get diagnostics imported=row_count;
  return imported;
end;
$import_chunk$;

create or replace function public.sdda_finish_registry_import(target_snapshot_id uuid)
returns integer language plpgsql security definer set search_path=public set row_security=off
as $finish_import$
declare imported integer;
begin
  if not public.sdda_is_administrator() then raise exception 'Administrator access is required'; end if;
  if not exists(select 1 from public.sdda_registry_snapshots where id=target_snapshot_id and imported_by=auth.uid() and completed_at is null)
    then raise exception 'Registry import is unavailable'; end if;
  select count(*) into imported from public.sdda_registry_dogs where snapshot_id=target_snapshot_id;
  if imported<1 then raise exception 'The registry import contained no dogs'; end if;
  update public.sdda_registry_snapshots set is_active=false where is_active;
  update public.sdda_registry_snapshots set is_active=true,completed_at=now(),row_count=imported where id=target_snapshot_id;
  return imported;
end;
$finish_import$;

create or replace function public.sdda_active_registry_status()
returns jsonb language sql stable security definer set search_path=public set row_security=off
as $status$
  select coalesce((select jsonb_build_object('available',true,'source_name',source_name,'source_url',source_url,
    'source_refreshed_at',source_refreshed_at,'imported_at',imported_at,'row_count',row_count)
    from public.sdda_registry_snapshots where is_active limit 1),jsonb_build_object('available',false));
$status$;

create or replace function public.sdda_lookup_registry_dog(registration_number text)
returns jsonb language plpgsql stable security definer set search_path=public set row_security=off
as $lookup$
declare result jsonb;
begin
  if length(trim(coalesce(registration_number,'')))<1 then raise exception 'Enter an SDDA registration number'; end if;
  select jsonb_build_object('found',true,'registration_number',d.registration_number,'call_name',d.call_name,'breed',d.breed,
    'snapshot_source',s.source_name,'snapshot_refreshed_at',s.source_refreshed_at)
  into result from public.sdda_registry_snapshots s join public.sdda_registry_dogs d on d.snapshot_id=s.id
  where s.is_active and lower(trim(d.registration_number))=lower(trim(registration_number)) limit 1;
  return coalesce(result,jsonb_build_object('found',false));
end;
$lookup$;

alter table public.sdda_dogs add column if not exists registry_snapshot_id uuid references public.sdda_registry_snapshots(id);
alter table public.sdda_dogs add column if not exists registry_verified_at timestamptz;

create or replace function public.sdda_validate_dog_against_registry()
returns trigger language plpgsql security definer set search_path=public set row_security=off
as $validate_dog$
declare registry_name text; active_snapshot_id uuid;
begin
  if new.registration_pending or nullif(trim(new.sdda_registration_number),'') is null then
    new.registry_snapshot_id:=null; new.registry_verified_at:=null; return new;
  end if;
  select d.call_name,s.id into registry_name,active_snapshot_id
  from public.sdda_registry_snapshots s join public.sdda_registry_dogs d on d.snapshot_id=s.id
  where s.is_active and lower(trim(d.registration_number))=lower(trim(new.sdda_registration_number)) limit 1;
  if registry_name is not null and regexp_replace(lower(registry_name),'[^a-z0-9]','','g')<>regexp_replace(lower(trim(new.call_name)),'[^a-z0-9]','','g') then
    raise exception 'That SDDA registration number belongs to %. Check the number and dog call name, or contact the trial secretary.',registry_name;
  end if;
  if registry_name is not null then new.call_name:=registry_name; new.registry_snapshot_id:=active_snapshot_id; new.registry_verified_at:=now();
  else new.registry_snapshot_id:=null; new.registry_verified_at:=null; end if;
  return new;
end;
$validate_dog$;

drop trigger if exists sdda_dogs_validate_official_registry on public.sdda_dogs;
create trigger sdda_dogs_validate_official_registry before insert or update of sdda_registration_number,call_name,registration_pending
on public.sdda_dogs for each row execute function public.sdda_validate_dog_against_registry();

create or replace function public.sdda_submit_public_entry_v4(target_trial_id uuid,submission jsonb)
returns jsonb language plpgsql security definer set search_path=public set row_security=off
as $submit$
declare
  requested_number text:=nullif(trim(submission->>'dog_registration_number'),'');
  requested_name text:=trim(coalesce(submission->>'dog_call_name',''));
  registry_name text;
  active_snapshot_id uuid;
  result jsonb;
begin
  if requested_number is not null then
    select d.call_name,s.id into registry_name,active_snapshot_id
    from public.sdda_registry_snapshots s join public.sdda_registry_dogs d on d.snapshot_id=s.id
    where s.is_active and lower(trim(d.registration_number))=lower(requested_number) limit 1;
    if registry_name is not null and regexp_replace(lower(registry_name),'[^a-z0-9]','','g')<>regexp_replace(lower(requested_name),'[^a-z0-9]','','g') then
      raise exception 'That SDDA registration number belongs to %. Check the number and dog call name, or contact the trial secretary.',registry_name;
    end if;
    if registry_name is not null then
      update public.sdda_dogs set call_name=registry_name,registry_snapshot_id=active_snapshot_id,registry_verified_at=now()
      where lower(trim(sdda_registration_number))=lower(requested_number);
    end if;
  end if;
  result:=public.sdda_submit_public_entry_v3(target_trial_id,submission);
  if requested_number is not null and registry_name is not null then
    update public.sdda_dogs set registry_snapshot_id=active_snapshot_id,registry_verified_at=now()
    where lower(trim(sdda_registration_number))=lower(requested_number);
  end if;
  return result||jsonb_build_object('registry_verified',registry_name is not null);
end;
$submit$;

revoke all on function public.sdda_begin_registry_import(text,text,text) from public,anon,authenticated;
revoke all on function public.sdda_import_registry_chunk(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.sdda_finish_registry_import(uuid) from public,anon,authenticated;
revoke all on function public.sdda_active_registry_status() from public,anon,authenticated;
revoke all on function public.sdda_lookup_registry_dog(text) from public,anon,authenticated;
revoke all on function public.sdda_submit_public_entry_v4(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.sdda_begin_registry_import(text,text,text) to authenticated;
grant execute on function public.sdda_import_registry_chunk(uuid,jsonb) to authenticated;
grant execute on function public.sdda_finish_registry_import(uuid) to authenticated;
grant execute on function public.sdda_active_registry_status() to anon,authenticated;
grant execute on function public.sdda_lookup_registry_dog(text) to anon,authenticated;
grant execute on function public.sdda_submit_public_entry_v4(uuid,jsonb) to anon,authenticated;

commit;
