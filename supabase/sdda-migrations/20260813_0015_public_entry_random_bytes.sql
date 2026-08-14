begin;

alter function public.sdda_submit_public_entry(uuid,jsonb)
  set search_path to public, extensions;

commit;
