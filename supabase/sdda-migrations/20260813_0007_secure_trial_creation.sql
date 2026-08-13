begin;

-- Trial creation is an authenticated, validated transaction spanning the trial,
-- its days, and its first audit record. The function owns those writes so the
-- individual table policies cannot leave a partially created trial.
alter function public.sdda_create_trial(text, text, text, date[]) security definer;
alter function public.sdda_create_trial(text, text, text, date[]) set search_path = public;

revoke all on function public.sdda_create_trial(text, text, text, date[]) from public;
revoke all on function public.sdda_create_trial(text, text, text, date[]) from anon;
grant execute on function public.sdda_create_trial(text, text, text, date[]) to authenticated;

commit;
