# Chalkline v1 — Implementation Plan

## Context

Chalkline is a peer-accountability habit app: one user commits to one photographable daily habit, photographs proof after doing it, and two fixed "corner" witnesses each one-tap Back it / Call it. Two backs clears the day and extends a streak; two calls breaks it; no proof by the day boundary resets the streak to zero. The full product spec (rules, screens, rationale) came from `Chalkline-walkthrough.pdf`. The local project directory started completely empty (no git, no code); the user has since provided an existing remote — `https://github.com/linoyalex/peeraccountability.git` — which already has one commit on `main` (a LICENSE and a minimal README). This plan document itself is being committed to that repo now, ahead of any code, so it's available when picked up from another machine/session.

The goal of this first iteration is a working, installable PWA for a squad of ~4 people to run a real four-week test, in roughly a week of build time. Scope is deliberately narrow: no money, no notifications, no multi-habit, no in-app setup UI (habits/corners are seeded by hand). The plan below reflects decisions already confirmed with the user (stack, screen scope, visual fidelity, timezone, cron approach) — nothing here should be re-litigated during execution without checking back in.

## Confirmed decisions

- **Platform**: Next.js (App Router, TypeScript), built as an installable PWA — add-to-home-screen, no app store.
- **Backend**: Supabase — magic-link email auth, Postgres, private Storage bucket for proof photos.
- **Hosting**: Vercel, Hobby (free) tier. The 36h auto-clear uses Vercel Cron (daily granularity on Hobby) **plus an opportunistic in-app backstop** — see §Mechanics. No Pro-tier upgrade for v1.
- **Visual design**: close match to the PDF mockups — near-black hero/streak card, bold condensed sans headline type, crimson/red accent, green "backed" state, card-based mobile-first layout.
- **Day boundary**: fixed 4am US/Eastern for all users (single squad, one timezone, hardcoded — no per-user timezone in v1).
- **Screens in scope**: Sign-in (magic link), Home (streak + Prove It + "Your call" pending reviews), Camera capture (open camera → shoot → optional note → send/sent), Corner review (Back it / Call it), History ("Your run"). **Out of scope**: the Setup/habit-picker screen — habits and corners are inserted directly into the DB.
- **Commitment schedules**: the schema must not assume "fixed weekdays" is the only shape a commitment can take — it needs to accommodate future schedule types (biweekly, monthly, custom intervals) without a breaking migration. For the pilot itself, only three schedule types are actually offered/seeded: **Daily**, **N days/week on unspecified days** (1–6, "floating"), and **fixed recurring weekdays** (the original model, e.g. Mon/Wed/Fri). See §Data model and §Key mechanics for how this is represented and evaluated.

## Data model (Supabase/Postgres)

- **profiles** — mirrors `auth.users` via trigger. `id uuid PK`, `display_name text`. Deliberately no phone/contact-method columns yet — email already lives in `auth.users` (used for magic-link auth), and there's no notification feature in v1 to need anything else. Adding a `phone` column or a separate `contact_methods` table is a trivial future migration once email/SMS notifications are actually scoped — not reserved now.
- **habits** — one per user (`user_id uuid unique`). `name text`, `start_date date`, plus a generic schedule representation instead of a single weekdays column:
  - `schedule_type text check in ('daily','weekdays_fixed','days_per_week_floating')` — an enum deliberately scoped to only the pilot's three types; adding a future type (e.g. `'biweekly'`, `'monthly'`) later is a new enum value + new `schedule_config` shape + new streak-eval branch, not a schema rewrite.
  - `schedule_config jsonb not null` — shape depends on `schedule_type`, validated in app code via a zod discriminated union (not DB constraints, which is the tradeoff for staying flexible): `{}` for `daily`; `{"weekdays": int[]}` for `weekdays_fixed` (JS `Date.getDay()` convention, 0=Sunday — pinned everywhere `appDay.ts` is used); `{"days_per_week": int}` (1–6) for `days_per_week_floating`.
- **corner_members** — hand-seeded witness pairs. `subject_id`, `witness_id` (both → profiles), `unique(subject_id, witness_id)`, `check(subject_id <> witness_id)`.
- **proofs** — `user_id`, `habit_id`, `app_day date` (server-computed at insert, not a generated column — timezone math isn't IMMUTABLE), `submitted_at timestamptz`, `photo_path text`, `note text`, `status text check in ('waiting','backed','broken')`, `resolution text check in ('votes','no_response')`, `resolved_at`. Partial unique index on `(user_id, app_day)` where status in `('waiting','backed')` — allows re-posts after a `broken` day, blocks duplicates otherwise.
- **votes** — `proof_id`, `voter_id`, `vote text check in ('back','call')`, `unique(proof_id, voter_id)`. No client `INSERT`/`UPDATE` grant at all — writes only via the `cast_vote()` SQL function.
- **Storage**: `proof-photos` bucket, private. Insert policy restricts each user to their own folder path; reads go through server-issued signed URLs.
- **RLS**: self-or-corner-related `SELECT` on profiles/habits/proofs/votes (a witness can see their subject's data and vice versa); `proofs` insert restricted to `user_id = auth.uid()`; no client-side `UPDATE`/`DELETE` on proofs or votes — status changes only via `SECURITY DEFINER` functions.

## Key mechanics

1. **Day-boundary function** (`src/lib/appDay.ts`): single exported `getAppDay(utcTimestamp: Date): string`, built on `Intl.DateTimeFormat` with `timeZone: 'America/New_York'` (DST-correct, no extra dependency). Every place that needs "what day is this" — proof stamping, streak walk, rest-day check, history grouping — imports this one function, never reimplements it.
2. **Streak** (`src/lib/streak.ts`): computed on read, not stored, over a bounded lookback (~60 days for daily/fixed, ~16 weeks for floating). Dispatches on `habit.schedule_type` into one of two algorithms — kept separate rather than unified, since a floating quota genuinely can't be judged one day at a time:
   - **`daily` and `weekdays_fixed`** — the original day-by-day walk: walks backward from today's app-day, skips non-required weekdays without breaking the streak, excludes an unresolved current-day proof without breaking the streak, stops on the first `broken` or missing required day. Hero number: "N days in a row."
   - **`days_per_week_floating`** — a week-by-week walk instead: weeks run Monday–Sunday (calendar week, fixed convention — not a rolling 7-day window). For each fully-elapsed past week, count `backed` proofs in that week; if count ≥ `days_per_week`, the week counts and the walk continues to the prior week, else it stops. The current, still-in-progress week is never evaluated (can't fail a week that isn't over) and doesn't break the streak. Hero number: "N weeks in a row" — deliberately different phrasing from the day-based habits, since that's honestly what's being measured.

   Both variants take "today" as an explicit parameter — never call `new Date()` internally — so edge cases are pinned in tests.
3. **Vote quorum** (`cast_vote()` SQL function): `SELECT ... FOR UPDATE` locks the proof row for the transaction, so two near-simultaneous votes can't both resolve it. Handles the split-vote case (1 back + 1 call stays `waiting`) correctly, not just "any 2 votes = resolved."
4. **36h auto-clear**: `resolve_stale_proof()` SQL function (same locking pattern as `cast_vote`) + `/api/cron/resolve-proofs` route, scheduled via `vercel.json` (daily on Hobby tier). **Backstop**: when a user loads Home, opportunistically resolve any of their own witnessed proofs that are already stale, so the visible experience stays close to 36h even though the cron itself only guarantees daily.
5. **No realtime/push**: reviews and results simply appear next time the app is opened — poll-on-load only, no websockets/notifications needed, per spec.

## Build sequence (~1 week, solo)

1. **Scaffold**: on `feat/v1-mvp`. `create-next-app` (TS/App Router/Tailwind), ESLint strict flat config (`no-explicit-any: error`), Supabase project + `supabase init`, `lib/supabase/{client,server,admin}.ts`.
2. **Schema, RLS, auth**: committed SQL migrations (`0001_init.sql`, `0002_rls.sql`, `0003_functions.sql` — not dashboard-only edits, so the security review has something concrete to review). Generate `database.types.ts`. `scripts/seed-squad.ts` for repeatable hand-seeding (needs real squad emails/habit/weekdays from the user before this step — see §Before you seed). Sign-in + magic-link callback + session middleware.
3. **appDay.ts + streak.ts with tests first**, then Home screen (streak card, Prove It button, inline "Your call" review list) wired to them.
4. **Camera capture**: single client component/state machine (`idle → preview → sending → sent`) — deliberately not split across routes, since a captured photo can't survive a route transition unuploaded. `POST /api/proofs` verifies the session server-side, computes `app_day`/`submitted_at` itself (never trusts a client timestamp).
5. **Corner review**: `cast_vote()` RPC wired to Back it / Call it, optimistic removal from the reviewer's list.
6. **36h auto-clear + backstop + History screen**.
7. **PWA installability** (manifest, minimal hand-rolled service worker, iOS meta tags) **+ visual polish** to match the mockups (dark card, crimson/green states, condensed bold type).
8. **Test/security pass, merge**: `tsc --noEmit`, ESLint (zero errors), `next build`, `vitest run` (day-boundary, streak, vote-quorum unit tests; a concurrent vote-race integration test if local Supabase/Docker is available, otherwise a documented manual two-tab race check). Run the `code-review` and `security-review` skills against the full diff — checklist: auth on every API route, no client write path to `votes`/`proofs.status`, RLS reviewed table-by-table, storage private + signed-URL-only, zod validation on inputs, no secrets in source/`NEXT_PUBLIC_*`. Write a release note under `release-notes/`, then merge `feat/v1-mvp` → `main`.

## Before you seed (need from you, not a build blocker)

The squad's real email addresses, each person's chosen habit + schedule (daily, N days/week floating, or fixed weekdays — and which), and corner pairings — needed to run `scripts/seed-squad.ts` in step 2, not needed to start building.

## Verification

- Automated: `vitest run` for `appDay`, `streak`, and vote-quorum resolution logic — these are the pieces where a silent bug would corrupt the core mechanic.
- Manual end-to-end, on real phones: sign in via magic link → Prove It → camera → send → confirm it shows up as "Your call" on a witness's phone → back/call it → confirm streak/history update correctly → verify install-from-link (Add to Home Screen) works on iOS.
- Manual edge cases: rest day adjacent to a broken day, split vote (1 back + 1 call), the 4am boundary itself (post at 3:59am vs 4:01am ET), a re-post after a `broken` day, a floating-schedule week that hits quota exactly on the last day, a floating-schedule week that falls one short, and the Monday-boundary rollover for a floating habit mid-streak.
