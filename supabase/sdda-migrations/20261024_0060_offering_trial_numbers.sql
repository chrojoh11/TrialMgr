-- SDDA assigns more than one trial number on the same calendar date. Keep the
-- day-level number as a compatibility/default value, but let every Scent
-- level/component and each Game carry the number assigned by SDDA.
alter table public.sdda_trial_offerings
  add column if not exists sdda_trial_number text;

alter table public.sdda_game_offerings
  add column if not exists sdda_trial_number text;

update public.sdda_trial_offerings o
set sdda_trial_number = d.sdda_trial_number
from public.sdda_trial_days d
where d.id = o.trial_day_id
  and nullif(btrim(o.sdda_trial_number), '') is null
  and nullif(btrim(d.sdda_trial_number), '') is not null;

update public.sdda_game_offerings g
set sdda_trial_number = d.sdda_trial_number
from public.sdda_trial_days d
where d.id = g.trial_day_id
  and nullif(btrim(g.sdda_trial_number), '') is null
  and nullif(btrim(d.sdda_trial_number), '') is not null;

comment on column public.sdda_trial_offerings.sdda_trial_number is
  'SDDA trial number assigned to this Scent level/component; both streams share it.';
comment on column public.sdda_game_offerings.sdda_trial_number is
  'SDDA trial number assigned to this Game offering.';
