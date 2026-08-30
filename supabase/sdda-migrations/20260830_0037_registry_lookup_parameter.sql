begin;

create or replace function public.sdda_lookup_registry_dog(registration_number text)
returns jsonb language plpgsql stable security definer set search_path=public set row_security=off
as $lookup$
declare result jsonb;
begin
  if length(trim(coalesce($1,'')))<1 then raise exception 'Enter an SDDA registration number'; end if;
  select jsonb_build_object('found',true,'registration_number',d.registration_number,'call_name',d.call_name,'breed',d.breed,
    'snapshot_source',s.source_name,'snapshot_refreshed_at',s.source_refreshed_at)
  into result from public.sdda_registry_snapshots s join public.sdda_registry_dogs d on d.snapshot_id=s.id
  where s.is_active and lower(trim(d.registration_number))=lower(trim($1)) limit 1;
  return coalesce(result,jsonb_build_object('found',false));
end;
$lookup$;

revoke all on function public.sdda_lookup_registry_dog(text) from public,anon,authenticated;
grant execute on function public.sdda_lookup_registry_dog(text) to anon,authenticated;

commit;
