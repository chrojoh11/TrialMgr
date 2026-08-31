begin;

create or replace function public.sdda_validate_scent_score_rules()
returns trigger language plpgsql set search_path=public
as $$
declare
  run_record record;
  minimum_score numeric;
  maximum_score numeric;
  maximum_seconds numeric;
begin
  select r.level,r.component,r.run_group into run_record from public.sdda_runs r where r.id=new.run_id;
  if not found then raise exception 'Scent run not found.'; end if;
  if lower(run_record.run_group)='feo' then raise exception 'FEO runs cannot receive official scores.'; end if;

  maximum_score := case
    when run_record.level='Started' and run_record.component='Interior' then 40
    when run_record.level='Started' then 30
    when run_record.component='Interior' then 80
    else 60 end;
  minimum_score := maximum_score / 2;
  maximum_seconds := case
    when run_record.level='Excellent' and run_record.component='Interior' then 900
    when run_record.level='Elite' and run_record.component='Interior' then 600
    when run_record.component='Container' then 180
    else 300 end;

  if new.score is not null and new.score > maximum_score then raise exception 'Score exceeds the official maximum of %.',maximum_score; end if;
  if new.result='qualifying' and (new.score is null or new.score < minimum_score or new.time_seconds is null or new.time_seconds > maximum_seconds) then
    raise exception 'A qualifying % % run requires at least % points within % seconds.',run_record.level,run_record.component,minimum_score,maximum_seconds;
  end if;
  if new.result='non_qualifying' and new.score is not null and new.score >= minimum_score and new.time_seconds is not null and new.time_seconds <= maximum_seconds then
    raise exception 'This non-qualifying score and time would calculate as Pass in the official workbook. Enter the judge''s official failed score.';
  end if;
  return new;
end;
$$;

drop trigger if exists sdda_scores_validate_rules on public.sdda_scores;
create trigger sdda_scores_validate_rules before insert or update of run_id,result,score,time_seconds on public.sdda_scores
for each row execute function public.sdda_validate_scent_score_rules();

commit;
