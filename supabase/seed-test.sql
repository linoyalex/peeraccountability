-- Chalkline — THROWAWAY TEST SEED (development only)
--
-- This is NOT the pilot seed. `seed.sql` is the real one, for the 4 recruited members.
-- This file exists so the app can be exercised end to end before recruiting finishes.
-- Run the teardown at the bottom before the real pilot starts.
--
-- Prerequisite: all three addresses below must have signed in via magic link at least once,
-- so `handle_new_user()` has created their profiles row. This script only reads auth.users;
-- it never creates accounts.
--
-- Why three accounts and not two: corner_members has `check (subject_id <> witness_id)` and the
-- Home screen requires exactly two witnesses per subject (app/page.tsx). Three people is the
-- smallest squad where everyone can be witnessed by the two others — a clean triangle.

begin;

-- ---------------------------------------------------------------------------
-- 1. Replace these three addresses, then run. Gmail +aliases work fine.
-- ---------------------------------------------------------------------------

create temporary table test_squad (slot int primary key, email text not null) on commit drop;

-- This repo is public — keep real addresses out of it. Substitute at run time
-- and don't commit the filled-in version.
insert into test_squad (slot, email) values
  (1, '<YOUR_EMAIL>'),        -- the account you'll mostly drive
  (2, '<WITNESS_1_EMAIL>'),   -- throwaway witness 1 (a +alias of your own inbox works)
  (3, '<WITNESS_2_EMAIL>');   -- throwaway witness 2

-- ---------------------------------------------------------------------------
-- 2. Resolve to user ids, and fail loudly rather than half-seeding.
-- ---------------------------------------------------------------------------

create temporary table squad (slot int primary key, id uuid not null) on commit drop;

insert into squad (slot, id)
select s.slot, u.id
from test_squad s
join auth.users u on lower(u.email) = lower(s.email);

do $$
declare
  missing text;
begin
  select string_agg(s.email, ', ')
  into missing
  from test_squad s
  where not exists (select 1 from squad q where q.slot = s.slot);

  if missing is not null then
    raise exception
      'These addresses have not signed in yet (no auth.users row): %. Send each a magic link, complete sign-in once, then re-run.',
      missing;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Readable display names (the trigger defaults to the email local-part,
--    which for a "+alias" address renders as e.g. "you+w1" and gives
--    useless avatar initials).
-- ---------------------------------------------------------------------------

update public.profiles p
set display_name = v.name
from (values (1, 'Linoy Alex'), (2, 'Wit One'), (3, 'Wit Two')) as v(slot, name)
join squad q on q.slot = v.slot
where p.id = q.id;

-- ---------------------------------------------------------------------------
-- 4. One habit each. Three different schedule types, so all three streak
--    branches in lib/streak.ts get exercised by real data.
--    weekdays uses JS getDay() numbering: 0=Sunday .. 6=Saturday.
--
--    start_date deliberately does NOT use current_date: that is UTC-based on
--    Supabase, so between 8pm ET and midnight ET it is already "tomorrow" and
--    would sit ahead of the app day, silently excluding today's proofs from
--    the Home query's `.gte("app_day", start_date)` filter. This mirrors the
--    4am-ET expression set_proof_submission_fields() already uses, which is
--    the SQL counterpart of lib/appDay.ts.
--
--    Slot 2 gets all seven weekdays so a tester always has an actionable day.
--    Rest-day behaviour is already covered by lib/streak.test.ts; what this
--    seed is for is having something postable on whatever day you run it.
-- ---------------------------------------------------------------------------

insert into public.habits (user_id, name, start_date, schedule_type, schedule_config)
select
  q.id,
  v.name,
  date_trunc('day', (now() at time zone 'America/New_York') - interval '4 hours')::date,
  v.schedule_type,
  v.schedule_config::jsonb
from (values
  (1, 'Train before work',  'daily',                  '{}'),
  (2, 'Read 20 pages',      'weekdays_fixed',         '{"weekdays":[0,1,2,3,4,5,6]}'),
  (3, 'Run 5k',             'days_per_week_floating', '{"days_per_week":4}')
) as v(slot, name, schedule_type, schedule_config)
join squad q on q.slot = v.slot
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- 5. Corner triangle: each person is witnessed by the other two.
-- ---------------------------------------------------------------------------

insert into public.corner_members (subject_id, witness_id)
select subj.id, wit.id
from squad subj
join squad wit on wit.slot <> subj.slot
on conflict (subject_id, witness_id) do nothing;

-- ---------------------------------------------------------------------------
-- 6. Verify before committing. Every row must read ok.
-- ---------------------------------------------------------------------------

select
  p.display_name,
  h.name        as habit,
  h.schedule_type,
  count(cm.witness_id) as witnesses,
  case when count(cm.witness_id) = 2 and h.id is not null then 'ok' else 'BROKEN' end as status
from squad q
join public.profiles p on p.id = q.id
left join public.habits h on h.user_id = q.id
left join public.corner_members cm on cm.subject_id = q.id
group by p.display_name, h.name, h.schedule_type, h.id
order by p.display_name;

commit;

-- ===========================================================================
-- TEARDOWN — run before the real pilot. Deleting the two throwaway auth users
-- cascades to profiles -> habits / corner_members / proofs / votes.
-- Note slot 1 is deliberately NOT deleted; it is your own real account.
-- ===========================================================================
--
-- delete from auth.users
-- where lower(email) in (lower('<WITNESS_1_EMAIL>'), lower('<WITNESS_2_EMAIL>'));
--
-- -- Your own habit and corner rows are not cascaded by the above; clear them too:
-- delete from public.corner_members where subject_id in (
--   select id from auth.users where lower(email) = lower('<YOUR_EMAIL>'));
-- delete from public.habits where user_id in (
--   select id from auth.users where lower(email) = lower('<YOUR_EMAIL>'));
