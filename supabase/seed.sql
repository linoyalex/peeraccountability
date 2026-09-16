-- Chalkline v1 — seed template
-- DO NOT RUN as-is. Replace every <PERSON_N_ID> below with the real auth.users.id (uuid) for each
-- of your 4 pilot members, once they've each signed in via magic link at least once (their
-- profiles row is created automatically by the handle_new_user() trigger at that point).
--
-- Seeding constraints (pilot-scope.md §B2 — confirm before running, not something SQL can check):
--   - each witness should have regular in-person contact with their subject
--   - a subject's two witnesses shouldn't both be away in the same pilot week
--
-- Get the four IDs from: Supabase dashboard -> Authentication -> Users (or `select id, email from
-- auth.users`).

-- ---- habits: one per person. Replace name/schedule per what they actually commit to. ----

-- daily
insert into public.habits (user_id, name, start_date, schedule_type, schedule_config)
values ('<PERSON_1_ID>', '<habit name>', current_date, 'daily', '{}'::jsonb);

-- fixed weekdays — schedule_config.weekdays uses JS Date.getDay() (0=Sunday); this example is
-- Mon/Wed/Fri
insert into public.habits (user_id, name, start_date, schedule_type, schedule_config)
values ('<PERSON_2_ID>', '<habit name>', current_date, 'weekdays_fixed', '{"weekdays":[1,3,5]}'::jsonb);

-- floating, N days/week (1-6), any days
insert into public.habits (user_id, name, start_date, schedule_type, schedule_config)
values ('<PERSON_3_ID>', '<habit name>', current_date, 'days_per_week_floating', '{"days_per_week":4}'::jsonb);

-- daily
insert into public.habits (user_id, name, start_date, schedule_type, schedule_config)
values ('<PERSON_4_ID>', '<habit name>', current_date, 'daily', '{}'::jsonb);

-- ---- corner pairs: each person needs exactly two witnesses, from the other three. ----
-- Example below pairs everyone in a simple cycle — replace with the real pairing decisions,
-- respecting the seeding constraints above.

insert into public.corner_members (subject_id, witness_id) values
  ('<PERSON_1_ID>', '<PERSON_2_ID>'),
  ('<PERSON_1_ID>', '<PERSON_3_ID>'),
  ('<PERSON_2_ID>', '<PERSON_1_ID>'),
  ('<PERSON_2_ID>', '<PERSON_4_ID>'),
  ('<PERSON_3_ID>', '<PERSON_1_ID>'),
  ('<PERSON_3_ID>', '<PERSON_4_ID>'),
  ('<PERSON_4_ID>', '<PERSON_2_ID>'),
  ('<PERSON_4_ID>', '<PERSON_3_ID>');
