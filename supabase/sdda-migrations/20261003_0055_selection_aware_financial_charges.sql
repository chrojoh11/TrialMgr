-- SDDA only. Align the database waiver safeguard with the accepted-selection
-- calculations displayed by the application. Existing ledger rows are unchanged.
begin;

create or replace function public.sdda_entry_charge_cents(target_entry_id uuid)
returns bigint language sql stable security definer set search_path=public
as $charges$
  select case when e.confirmation_status <> 'accepted' then 0 else
    coalesce((select sum(case when grouped.level='Elite' then t.elite_fee_cents
      when grouped.n=3 and t.scent_three_component_fee_cents>0 then t.scent_three_component_fee_cents
      else grouped.n*t.scent_component_fee_cents end)
      from (select r.trial_day_id,r.level,count(*) n from public.sdda_runs r
        where r.entry_id=e.id and coalesce(r.selection_status,'accepted')='accepted'
        group by r.trial_day_id,r.level) grouped),0)
    +coalesce((select sum(case when r.entry_type='FEO' then o.feo_fee_cents else o.entry_fee_cents end)
      from public.sdda_game_runs r join public.sdda_game_offerings o on o.id=r.offering_id
      where r.entry_id=e.id and coalesce(r.selection_status,'accepted')='accepted'),0) end
  from public.sdda_entries e join public.sdda_trials t on t.id=e.trial_id where e.id=target_entry_id;
$charges$;

revoke all on function public.sdda_entry_charge_cents(uuid) from public,anon,authenticated;

commit;
