begin;

create table if not exists public.sdda_judges (
  sdda_contact_id bigint primary key,
  display_name text not null,
  active boolean not null default true,
  source_url text not null default 'https://www.sdda.ca/sporting-detection-dogs-association-judges/',
  source_checked_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sdda_judges_display_name_not_blank check (btrim(display_name) <> '')
);

create unique index if not exists sdda_judges_display_name_unique
  on public.sdda_judges (lower(btrim(display_name)));

alter table public.sdda_judges enable row level security;

drop policy if exists sdda_judges_authenticated_read on public.sdda_judges;
create policy sdda_judges_authenticated_read
  on public.sdda_judges for select
  to authenticated
  using (true);

drop policy if exists sdda_judges_administrator_insert on public.sdda_judges;
create policy sdda_judges_administrator_insert
  on public.sdda_judges for insert
  to authenticated
  with check ((select public.sdda_is_administrator()));

drop policy if exists sdda_judges_administrator_update on public.sdda_judges;
create policy sdda_judges_administrator_update
  on public.sdda_judges for update
  to authenticated
  using ((select public.sdda_is_administrator()))
  with check ((select public.sdda_is_administrator()));

drop policy if exists sdda_judges_administrator_delete on public.sdda_judges;
create policy sdda_judges_administrator_delete
  on public.sdda_judges for delete
  to authenticated
  using ((select public.sdda_is_administrator()));

grant select, insert, update, delete on public.sdda_judges to authenticated;
revoke all on public.sdda_judges from anon;

insert into public.sdda_judges (sdda_contact_id, display_name, active, source_checked_on)
values
  (8498, 'Stephanie Bacon', true, date '2026-09-21'),
  (392, 'Jane Book', true, date '2026-09-21'),
  (783, 'Marie-Noelle Cote', true, date '2026-09-21'),
  (310, 'Norm Dressler', true, date '2026-09-21'),
  (311, 'Jean-Marc Dugas', true, date '2026-09-21'),
  (1057, 'Chelsea Dujardin', true, date '2026-09-21'),
  (287, 'Paul Dyer', true, date '2026-09-21'),
  (531, 'Yvonne Ferguson', true, date '2026-09-21'),
  (288, 'Russell Fox', true, date '2026-09-21'),
  (2014, 'Julie Gaboury', true, date '2026-09-21'),
  (1114, 'Leslie Gardiner', true, date '2026-09-21'),
  (16761, 'Danielle Getzie', true, date '2026-09-21'),
  (388, 'Richard Greenall', true, date '2026-09-21'),
  (1252, 'Christine Guay', true, date '2026-09-21'),
  (701, 'Chris Hansen', true, date '2026-09-21'),
  (743, 'Michelle Hasselbach', true, date '2026-09-21'),
  (1137, 'Richard Hatchman', true, date '2026-09-21'),
  (761, 'Sandra Hebert', true, date '2026-09-21'),
  (1855, 'Ashley Horan', true, date '2026-09-21'),
  (4740, 'Cathy Jenkins', true, date '2026-09-21'),
  (441, 'Ryan-Ann King', true, date '2026-09-21'),
  (1530, 'Pam Koiner', true, date '2026-09-21'),
  (324, 'Kelly Ladouceur', true, date '2026-09-21'),
  (50377, 'Guy LaHaye', true, date '2026-09-21'),
  (1889, 'Lou-Anne Lambert', true, date '2026-09-21'),
  (1411, 'Christina Legien', true, date '2026-09-21'),
  (328, 'Sheri Luzzi', true, date '2026-09-21'),
  (434, 'John Mairs', true, date '2026-09-21'),
  (1058, 'Carrie McAunaul', true, date '2026-09-21'),
  (6258, 'Lane Michie', true, date '2026-09-21'),
  (652, 'Patricia Noble', true, date '2026-09-21'),
  (2112, 'Beverley Owocki', true, date '2026-09-21'),
  (819, 'Monique Pouliot', true, date '2026-09-21'),
  (3916, 'Annick Samson', true, date '2026-09-21'),
  (1082, 'Marina Skoreiko', true, date '2026-09-21'),
  (291, 'Pando Stepanis', true, date '2026-09-21'),
  (4341, 'Cathy Teeft', true, date '2026-09-21'),
  (463, 'Doug Teeft', true, date '2026-09-21'),
  (1590, 'Doug Wilson', true, date '2026-09-21'),
  (383, 'Heather Wilson', true, date '2026-09-21'),
  (1591, 'Debbie Wixalbrown', true, date '2026-09-21'),
  (37710, 'Alli Yerxa', true, date '2026-09-21'),
  (405, 'Shanna Zook', true, date '2026-09-21')
on conflict (sdda_contact_id) do update
set display_name = excluded.display_name,
    active = excluded.active,
    source_url = excluded.source_url,
    source_checked_on = excluded.source_checked_on,
    updated_at = now();

commit;
