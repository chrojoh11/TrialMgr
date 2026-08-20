begin;

alter function public.sdda_create_trial(text,text,text,date[],text)
  security definer;

alter function public.sdda_create_trial(text,text,text,date[],text)
  set search_path = public;

revoke all on function public.sdda_create_trial(text,text,text,date[],text)
  from public, anon;

grant execute on function public.sdda_create_trial(text,text,text,date[],text)
  to authenticated;

commit;
