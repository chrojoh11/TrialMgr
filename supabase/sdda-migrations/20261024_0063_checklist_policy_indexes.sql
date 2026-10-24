-- Keep checklist RLS efficient and index its profile reference.
drop policy if exists sdda_trial_checklist_write on public.sdda_trial_checklist_items;
create policy sdda_trial_checklist_insert on public.sdda_trial_checklist_items
  for insert to authenticated with check (public.sdda_can_manage_trial(trial_id));
create policy sdda_trial_checklist_update on public.sdda_trial_checklist_items
  for update to authenticated using (public.sdda_can_manage_trial(trial_id))
  with check (public.sdda_can_manage_trial(trial_id));
create policy sdda_trial_checklist_delete on public.sdda_trial_checklist_items
  for delete to authenticated using (public.sdda_can_manage_trial(trial_id));

create index if not exists sdda_trial_checklist_completed_by_idx
  on public.sdda_trial_checklist_items(completed_by)
  where completed_by is not null;
create index if not exists sdda_trials_workbook_proofed_by_idx
  on public.sdda_trials(workbook_proofed_by)
  where workbook_proofed_by is not null;

