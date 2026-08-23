begin;

alter table public.sdda_profiles
  add column if not exists is_administrator boolean not null default false;

comment on column public.sdda_profiles.is_administrator is
  'Database-appointed SDDA TrialDesk administrator. This value cannot be changed through the authenticated application.';

create or replace function public.sdda_is_administrator()
returns boolean
language sql
stable
security definer
set search_path=public
set row_security=off
as $administrator$
  select coalesce((select p.is_administrator from public.sdda_profiles p where p.user_id=auth.uid()),false);
$administrator$;

revoke all on function public.sdda_is_administrator() from public,anon;
grant execute on function public.sdda_is_administrator() to authenticated;

create or replace function public.sdda_protect_administrator_appointment()
returns trigger
language plpgsql
security definer
set search_path=public
as $protect_administrator$
begin
  if new.is_administrator is distinct from old.is_administrator and auth.uid() is not null then
    raise exception 'Administrators must be appointed directly in the database';
  end if;
  return new;
end;
$protect_administrator$;

drop trigger if exists sdda_profiles_protect_administrator on public.sdda_profiles;
create trigger sdda_profiles_protect_administrator
before update of is_administrator on public.sdda_profiles
for each row execute function public.sdda_protect_administrator_appointment();

create or replace function public.sdda_can_access_trial(target_trial_id uuid)
returns boolean language sql stable security definer set search_path=public set row_security=off
as $access$
  select public.sdda_is_administrator() or exists(
    select 1 from public.sdda_trials t where t.id=target_trial_id and
      (t.owner_id=auth.uid() or exists(select 1 from public.sdda_trial_members m where m.trial_id=t.id and m.user_id=auth.uid()))
  );
$access$;

create or replace function public.sdda_can_manage_trial(target_trial_id uuid)
returns boolean language sql stable security definer set search_path=public set row_security=off
as $manage$
  select public.sdda_is_administrator() or exists(
    select 1 from public.sdda_trials t where t.id=target_trial_id and
      (t.owner_id=auth.uid() or exists(select 1 from public.sdda_trial_members m where m.trial_id=t.id and m.user_id=auth.uid() and m.role in ('owner','secretary','assistant')))
  );
$manage$;

create or replace function public.sdda_can_manage_finances(target_trial_id uuid)
returns boolean language sql stable security definer set search_path=public set row_security=off
as $finances$
  select public.sdda_is_administrator() or exists(
    select 1 from public.sdda_trials t where t.id=target_trial_id and
      (t.owner_id=auth.uid() or exists(select 1 from public.sdda_trial_members m where m.trial_id=t.id and m.user_id=auth.uid() and m.role in ('owner','secretary')))
  );
$finances$;

drop policy if exists sdda_profiles_administrator_read on public.sdda_profiles;
create policy sdda_profiles_administrator_read on public.sdda_profiles
for select to authenticated using(public.sdda_is_administrator());

drop policy if exists sdda_trial_members_write on public.sdda_trial_members;
create policy sdda_trial_members_write on public.sdda_trial_members
for all to authenticated using(
  public.sdda_is_administrator() or exists(select 1 from public.sdda_trials t where t.id=trial_id and t.owner_id=auth.uid())
) with check(
  public.sdda_is_administrator() or exists(select 1 from public.sdda_trials t where t.id=trial_id and t.owner_id=auth.uid())
);

create or replace function public.sdda_delete_draft_trial(target_trial_id uuid)
returns void language plpgsql security definer set search_path=public
as $delete_trial$
declare target_name text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select name into target_name from public.sdda_trials
    where id=target_trial_id and (owner_id=auth.uid() or public.sdda_is_administrator()) and status='draft' for update;
  if target_name is null then raise exception 'Only the owner or an administrator can delete a draft SDDA trial'; end if;
  insert into public.sdda_audit_records(trial_id,actor_id,action,entity_type,entity_id,before_state)
    values(null,auth.uid(),'trial.deleted','sdda_trial',target_trial_id::text,jsonb_build_object('id',target_trial_id,'name',target_name,'status','draft'));
  perform set_config('sdda.deleting_trial',target_trial_id::text,true);
  delete from public.sdda_trials where id=target_trial_id;
end;
$delete_trial$;

revoke all on function public.sdda_delete_draft_trial(uuid) from public,anon;
grant execute on function public.sdda_delete_draft_trial(uuid) to authenticated;

commit;
