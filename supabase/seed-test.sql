-- Chalkline — THROWAWAY TEST SEED (development only)
--
-- This is NOT the pilot seed. `seed.sql` is the real one, for the 4 recruited members.
-- This file exists so the app can be exercised end to end before recruiting finishes.
-- Run the teardown at the bottom before the real pilot starts.
--
-- Prerequisite: all three addresses below must already exist in auth.users, so that
-- `handle_new_user()` has created their profiles row. This script only reads auth.users;
-- it never creates accounts.
--
-- They do NOT need to have signed in. That trigger is `after insert on auth.users`, not
-- anything to do with logging in, so the fastest way to create a witness is:
--   Supabase -> Authentication -> Users -> Add user, with "Auto Confirm User" ticked.
--
-- Prefer that over magic links here. Supabase's built-in email service is capped at two
-- sends per hour and the cap cannot be raised without configuring custom SMTP, so seeding
-- via sign-in emails runs out of sends before a three-person squad is complete. Save the
-- sign-in emails for when you actually need to *be* one of these users in the browser.
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
from (values (1, '<YOUR_NAME>'), (2, 'Wit One'), (3, 'Wit Two')) as v(slot, name)
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

-- Held in a table rather than inlined into the INSERT so step 6 can check what
-- actually landed against what was intended, instead of trusting the insert.
create temporary table habit_plan (
  slot int primary key,
  name text not null,
  schedule_type text not null,
  schedule_config jsonb not null
) on commit drop;

insert into habit_plan (slot, name, schedule_type, schedule_config) values
  (1, 'Train before work',  'daily',                  '{}'),
  (2, 'Read 20 pages',      'weekdays_fixed',         '{"weekdays":[0,1,2,3,4,5,6]}'),
  (3, 'Run 5k',             'days_per_week_floating', '{"days_per_week":4}');

insert into public.habits (user_id, name, start_date, schedule_type, schedule_config)
select
  q.id,
  hp.name,
  date_trunc('day', (now() at time zone 'America/New_York') - interval '4 hours')::date,
  hp.schedule_type,
  hp.schedule_config
from habit_plan hp
join squad q on q.slot = hp.slot
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
-- 6. Verify, then abort if anything is off.
--
--    Both inserts above are ON CONFLICT DO NOTHING, so they are silent about
--    pre-existing state rather than authoritative. Two ways that bites:
--      - a user who already had a habit keeps it, schedule and all, so the
--        wrong schedule_type can survive a "successful" run;
--      - re-running with a different alias adds corner rows without removing
--        the old ones, leaving a subject with three witnesses. Home throws on
--        `corners.length !== 2`, so that surfaces as a crash, not a warning.
--
--    A SELECT that merely prints "BROKEN" does not prevent any of this: the
--    editor moves straight on to COMMIT. The DO block is what makes the
--    transaction wrapper mean something. The SELECT is kept purely as
--    human-readable output.
--
--    "Exactly one habit" needs no check: habits.user_id is UNIQUE, so the only
--    failure mode the schema permits is zero.
-- ---------------------------------------------------------------------------

select
  p.display_name,
  h.name                                      as habit,
  h.schedule_type                             as actual_schedule,
  hp.schedule_type                            as expected_schedule,
  (select count(*) from public.corner_members cm where cm.subject_id = q.id) as witnesses
from squad q
join habit_plan hp on hp.slot = q.slot
join public.profiles p on p.id = q.id
left join public.habits h on h.user_id = q.id
order by p.display_name;

do $$
declare
  problems text;
begin
  select string_agg(format('  - %s: %s', display_name, issue), E'\n' order by display_name)
  into problems
  from (
    select
      p.display_name,
      case
        when h.id is null then
          'no habit row was created'
        when h.schedule_type is distinct from hp.schedule_type then
          format(
            'schedule is %L but should be %L — a pre-existing habit was kept by ON CONFLICT DO NOTHING',
            h.schedule_type, hp.schedule_type)
        when h.schedule_config is distinct from hp.schedule_config then
          format(
            'schedule_config is %s but should be %s — a pre-existing habit was kept',
            h.schedule_config::text, hp.schedule_config::text)
        when w.n <> 2 then
          format(
            '%s witnesses, expected exactly 2 — Home throws on anything but 2; clear stale corner_members rows and re-run',
            w.n)
      end as issue
    from squad q
    join habit_plan hp on hp.slot = q.slot
    join public.profiles p on p.id = q.id
    left join public.habits h on h.user_id = q.id
    left join lateral (
      select count(*) as n from public.corner_members cm where cm.subject_id = q.id
    ) w on true
  ) checked
  where issue is not null;

  if problems is not null then
    raise exception E'Seed verification failed — nothing was committed:\n%', problems;
  end if;
end;
$$;

commit;

-- ===========================================================================
-- TEARDOWN — run before the real pilot.
--
-- Slot 1 is deliberately NOT deleted; it is your own real account. That is the
-- only reason step 2 below is needed at all.
--
-- What step 1 cascades (verified against the live database — every FK in this
-- chain is ON DELETE CASCADE): profiles.id -> auth.users, and corner_members
-- .subject_id / .witness_id, habits.user_id, proofs.user_id, votes.voter_id
-- -> profiles, plus proofs.habit_id -> habits and votes.proof_id -> proofs.
--
-- So deleting the two throwaway users removes ALL SIX seeded corner rows, not
-- just their own: the triangle means every row names slot 2 or slot 3 in at
-- least one column, including the (slot 1 -> witness) pairs. No separate
-- corner_members cleanup is needed, which is why none appears below.
--
-- CLAUDE.md requires explicit buy-in before touching real user data. This
-- block deletes auth.users rows, so it stays commented out — read it, confirm
-- the addresses are the throwaway ones, then run it deliberately.
-- ===========================================================================
--
-- -- 1. Remove the throwaway witnesses. Cascades as described above.
-- delete from auth.users
-- where lower(email) in (lower('<WITNESS_1_EMAIL>'), lower('<WITNESS_2_EMAIL>'));
--
-- -- 2. Your own account survives step 1, so its habit does too. Deleting the
-- --    habit cascades your test proofs and any votes on them.
-- delete from public.habits where user_id in (
--   select id from auth.users where lower(email) = lower('<YOUR_EMAIL>'));
--
-- NOT covered by any of the above:
--   - Storage. Proof photos live in storage.objects under a per-user folder
--     (see policies.sql) and have no FK to auth.users, so they are NOT
--     cascaded. Empty the `proofs` bucket by hand, or the throwaway accounts'
--     photos outlive the accounts.
--   - Slot 1's profiles.display_name keeps whatever step 3 set it to. Cosmetic
--     only, but reset it if you want your real name back.
