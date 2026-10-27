begin;

-- Trigger-only routines must not be callable through the Data API.
revoke execute on function public.sdda_guard_completed_trial_mutation() from public, anon, authenticated;
revoke execute on function public.sdda_handle_new_auth_user() from public, anon, authenticated;
revoke execute on function public.sdda_protect_administrator_appointment() from public, anon, authenticated;
revoke execute on function public.sdda_validate_dog_against_registry() from public, anon, authenticated;

-- Auth creates profiles through this trigger; it is never a Data API RPC.
grant execute on function public.sdda_handle_new_auth_user() to supabase_auth_admin;

-- Internal helpers are invoked only by guarded wrapper functions.
revoke execute on function public.sdda_apply_entry_update(uuid,jsonb,uuid,text) from public, anon, authenticated;

-- Retired public-entry versions remain available to their current wrappers as
-- owner calls, but are no longer standalone RPC endpoints.
revoke execute on function public.sdda_submit_public_entry(uuid,jsonb) from public, anon, authenticated;
revoke execute on function public.sdda_submit_public_entry_v2(uuid,jsonb) from public, anon, authenticated;
revoke execute on function public.sdda_submit_public_entry_v3(uuid,jsonb) from public, anon, authenticated;

-- Reported Gold entry was removed from TrialDesk and must not remain callable.
revoke execute on function public.sdda_set_reported_gold_snapshot(uuid,text,text,integer,integer,integer,boolean)
  from public, anon, authenticated;

-- Remove anonymous access from signed-in helper and secretary endpoints. The
-- authenticated grants are restored explicitly below with the other app RPCs.
revoke execute on function public.sdda_active_registry_status() from public, anon, authenticated;
revoke execute on function public.sdda_can_access_trial(uuid) from public, anon, authenticated;
revoke execute on function public.sdda_can_manage_finances(uuid) from public, anon, authenticated;
revoke execute on function public.sdda_can_manage_trial(uuid) from public, anon, authenticated;
revoke execute on function public.sdda_secretary_entry_for_edit(uuid) from public, anon, authenticated;
revoke execute on function public.sdda_update_entry_as_secretary(uuid,jsonb) from public, anon, authenticated;

-- Public competitor entry and receipt endpoints. Each validates a receipt
-- token, registration/email identity, trial window, or requested submission.
grant execute on function public.sdda_lookup_registry_dog(text) to anon, authenticated;
grant execute on function public.sdda_public_entry_by_registration(uuid,text,text) to anon, authenticated;
grant execute on function public.sdda_public_entry_for_edit(text,text) to anon, authenticated;
grant execute on function public.sdda_public_entry_receipt(text,text) to anon, authenticated;
grant execute on function public.sdda_public_trial_entry_setup(uuid) to anon, authenticated;
grant execute on function public.sdda_public_trial_entry_timing(uuid) to anon, authenticated;
grant execute on function public.sdda_submit_public_entry_v6(uuid,jsonb) to anon, authenticated;
grant execute on function public.sdda_update_public_entry(text,text,jsonb) to anon, authenticated;
grant execute on function public.sdda_update_public_entry_by_registration(uuid,text,text,jsonb) to anon, authenticated;

-- Signed-in application endpoints. These routines perform their own
-- administrator, trial-management, finance, or ownership checks.
grant execute on function public.sdda_active_registry_status() to authenticated;
grant execute on function public.sdda_add_trial_team_member(uuid,text,text) to authenticated;
grant execute on function public.sdda_begin_registry_import(text,text,text) to authenticated;
grant execute on function public.sdda_can_access_trial(uuid) to authenticated;
grant execute on function public.sdda_can_manage_finances(uuid) to authenticated;
grant execute on function public.sdda_can_manage_trial(uuid) to authenticated;
grant execute on function public.sdda_clear_game_score(uuid) to authenticated;
grant execute on function public.sdda_clear_scent_score(uuid) to authenticated;
grant execute on function public.sdda_create_trial(text,text,text,date[],text) to authenticated;
grant execute on function public.sdda_delete_draft_trial(uuid) to authenticated;
grant execute on function public.sdda_delete_financial_transaction(uuid) to authenticated;
grant execute on function public.sdda_finish_registry_import(uuid) to authenticated;
grant execute on function public.sdda_import_registry_chunk(uuid,jsonb) to authenticated;
grant execute on function public.sdda_is_administrator() to authenticated;
grant execute on function public.sdda_list_trial_team(uuid) to authenticated;
grant execute on function public.sdda_mark_secretary_entry(text,text) to authenticated;
grant execute on function public.sdda_pin_workbook(uuid,text,text,text,boolean) to authenticated;
grant execute on function public.sdda_promote_waitlisted_selection(text,uuid,boolean) to authenticated;
grant execute on function public.sdda_record_financial_transaction(uuid,uuid,text,integer,text,text,text,date) to authenticated;
grant execute on function public.sdda_record_game_score(uuid,text,numeric,text) to authenticated;
grant execute on function public.sdda_record_payment_batch(uuid,jsonb,text,text,text,date) to authenticated;
grant execute on function public.sdda_record_scent_score(uuid,text,numeric,numeric,integer,text) to authenticated;
grant execute on function public.sdda_remove_trial_team_member(uuid,uuid) to authenticated;
grant execute on function public.sdda_save_financial_transaction_v2(uuid,uuid,text,integer,text,text,text,date,uuid,text,uuid) to authenticated;
grant execute on function public.sdda_save_game_running_order(uuid,uuid,uuid[]) to authenticated;
grant execute on function public.sdda_save_running_order(uuid,uuid,text,text,uuid[]) to authenticated;
grant execute on function public.sdda_save_score_class(uuid,jsonb,jsonb,text) to authenticated;
grant execute on function public.sdda_search_registry_dogs(text) to authenticated;
grant execute on function public.sdda_secretary_entry_for_edit(uuid) to authenticated;
grant execute on function public.sdda_set_checklist_item(uuid,text,text,boolean,text) to authenticated;
grant execute on function public.sdda_set_entry_confirmation_status(uuid,text) to authenticated;
grant execute on function public.sdda_set_entry_schedule(uuid,text,text,text) to authenticated;
grant execute on function public.sdda_set_selection_day_of_status(text,uuid,text,text) to authenticated;
grant execute on function public.sdda_set_trial_completion(uuid,boolean) to authenticated;
grant execute on function public.sdda_set_trial_day_entries_open(uuid,boolean) to authenticated;
grant execute on function public.sdda_submit_secretary_entry(uuid,jsonb) to authenticated;
grant execute on function public.sdda_trial_roster_dogs(uuid) to authenticated;
grant execute on function public.sdda_update_entry_as_secretary(uuid,jsonb) to authenticated;

commit;
