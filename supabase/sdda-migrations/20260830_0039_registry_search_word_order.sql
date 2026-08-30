begin;

create or replace function public.sdda_search_registry_dogs(search_text text)
returns table(registration_number text,call_name text,breed text,sex text,owner_number text,owner_name text,source_name text,source_refreshed_at text)
language plpgsql security definer set search_path=public
as $$
declare
  query_text text := trim(coalesce(search_text, ''));
  query_terms text[];
begin
  if not public.sdda_is_administrator() then raise exception 'Administrator access is required'; end if;
  if char_length(query_text) < 2 then raise exception 'Enter at least two characters'; end if;

  query_terms := regexp_split_to_array(lower(query_text), '[^[:alnum:]]+');

  return query
  select d.registration_number,d.call_name,d.breed,d.sex,d.owner_number,d.owner_name,s.source_name,s.source_refreshed_at
  from public.sdda_registry_snapshots s join public.sdda_registry_dogs d on d.snapshot_id=s.id
  where s.is_active
    and not exists (
      select 1 from unnest(query_terms) term
      where term <> '' and lower(concat_ws(' ',d.registration_number,d.call_name,d.owner_name,d.owner_number)) not like '%' || term || '%'
    )
  order by case when lower(d.registration_number)=lower(query_text) then 0 when lower(d.call_name)=lower(query_text) then 1
    when lower(coalesce(d.owner_name,''))=lower(query_text) then 2 else 3 end,d.call_name,d.registration_number
  limit 50;
end;
$$;

revoke all on function public.sdda_search_registry_dogs(text) from public,anon,authenticated;
grant execute on function public.sdda_search_registry_dogs(text) to authenticated;

commit;
