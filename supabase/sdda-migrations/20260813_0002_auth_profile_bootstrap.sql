begin;

create or replace function public.sdda_handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.sdda_profiles (user_id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), '')
    )
  )
  on conflict (user_id) do update
    set email = excluded.email,
        display_name = coalesce(public.sdda_profiles.display_name, excluded.display_name),
        updated_at = now();

  return new;
end;
$$;

revoke all on function public.sdda_handle_new_auth_user() from public;

drop trigger if exists sdda_auth_user_profile on auth.users;
create trigger sdda_auth_user_profile
  after insert or update of email, raw_user_meta_data on auth.users
  for each row execute function public.sdda_handle_new_auth_user();

insert into public.sdda_profiles (user_id, email, display_name)
select
  u.id,
  u.email,
  coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), '')
  )
from auth.users u
on conflict (user_id) do update
  set email = excluded.email,
      display_name = coalesce(public.sdda_profiles.display_name, excluded.display_name),
      updated_at = now();

commit;
