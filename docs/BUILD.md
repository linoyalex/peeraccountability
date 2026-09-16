# Chalkline — BUILD.md

Single reference document for build prompts. Consolidates `Chalkline-walkthrough.pdf` (source spec),
`pilot-implementation-plan.md` (confirmed build plan), and `pilot-scope.md` (PM-review-driven
additions) into one numbered structure, plus two pieces that didn't exist anywhere yet: a verbatim
copy deck (§10) and design tokens (§11). Section numbers below are referenced by file name and
number from `SETUP.md` — don't renumber without updating both.

Where this document and `pilot-implementation-plan.md` overlap, this one is authoritative for build
prompts; `pilot-implementation-plan.md` remains the fuller narrative/rationale version.

---

## §1 — Overview

Chalkline is a peer-accountability habit PWA: one user commits to one photographable daily habit,
photographs proof after doing it, and two fixed "corner" witnesses each one-tap **Back it** or
**Call it**. Two backs clears the day and extends a streak ("run"); two calls breaks it; no proof by
the day boundary resets the run to zero.

Goal of v1: a working, installable PWA for a squad of ~4 real people to run a 4-week pilot, in
roughly a week of solo build time. The pilot exists to test one hypothesis — that fixed peer
witnesses meaningfully improve habit adherence versus tracking alone — see
`../reviews/PM/2026-09-14-peeraccountability-pm-review.md` and `pilot-scope.md` for how that's
measured.

Full product rationale and mockups: `Chalkline-walkthrough.pdf`.

## §2 — Locked decisions

| Decision | Value |
|---|---|
| Platform | Next.js (App Router, TypeScript), installable PWA — add-to-home-screen, no app store |
| Backend | Supabase — magic-link email auth, Postgres, private Storage bucket |
| Hosting | Vercel, Hobby (free) tier |
| Day boundary | Fixed **4am America/New_York**, hardcoded for all users — single squad, one timezone, no per-user timezone in v1 |
| 36h auto-clear | Vercel Cron (daily granularity on Hobby) + opportunistic in-app backstop on Home load |
| Visual design | Close match to PDF mockups — near-black hero/streak card, bold condensed sans headline type, crimson/red accent, green "backed" state, card-based mobile-first layout |
| Screens in scope | Sign-in, Home (streak + Prove It + Your call), Camera capture, Note/send, History |
| Screens out of scope | Setup/habit-picker — habits and corners inserted directly into the DB by hand |
| Schedule types offered | Daily, N days/week (unspecified days, "floating"), fixed recurring weekdays |
| Squad size | 4 people |
| Corner pairing | Two **fixed** witnesses per subject, hand-seeded — not rotating |
| Copy (§10) | Exact for this build — Claude does not invent UI strings while implementing. Expected to evolve after real pilot feedback, but changes go through the user, not ad-hoc mid-build rewrites |
| Pilot success criteria | See §15 and `pilot-scope.md` §B1 — proposed thresholds, confirm/adjust before day 1 |
| Seeding constraints | Corner witnesses should have regular in-person contact with their subject, and the two witnesses for one subject shouldn't both be away during the same pilot week — see `pilot-scope.md` §B2 |

Nothing in this table gets re-litigated during execution without checking back in with the user.

## §3 — Stack

- Next.js App Router, TypeScript strict, Tailwind.
- Supabase: Postgres, Auth (magic link), Storage (private bucket), via `@supabase/ssr` — not the
  deprecated `auth-helpers`.
- Vercel Hobby hosting + Vercel Cron for the daily stale-proof sweep.
- No realtime/websockets, no push notifications — poll-on-load only, per spec.
- No app store — installed via a shared link, Add to Home Screen.

## §4 — Project structure & conventions

```
proxy.ts                 # Next.js 16's middleware.ts — excludes /auth/callback, see §7
lib/supabase/{client,server,admin}.ts
lib/appDay.ts            # single source of truth for "what day is it"
lib/streak.ts            # streak/run computation, both schedule-type variants
app/login/page.tsx
app/auth/callback/route.ts
app/page.tsx             # Home
app/capture/page.tsx
app/run/page.tsx         # History ("Your run")
app/api/cron/resolve-proofs/route.ts
app/actions.ts           # postProof, castVote server actions
components/Hero.tsx
components/ProofCard.tsx
lib/image.ts             # client-side photo downscale before upload
supabase/schema.sql
supabase/policies.sql
supabase/seed.sql
```

No `src/` directory — chosen when scaffolding in Part 5 to match the majority of this tree already
having no `src/` prefix.

ESLint strict flat config, `no-explicit-any: error`. `database.types.ts` generated from the live
schema, not hand-written.

## §5 — Schema (SQL)

- **profiles** — mirrors `auth.users` via trigger. `id uuid PK`, `display_name text`. No
  phone/contact-method columns — no notification feature in v1 to need them.
- **habits** — one per user (`user_id uuid unique`). `name text`, `start_date date`,
  `schedule_type text check in ('daily','weekdays_fixed','days_per_week_floating')`,
  `schedule_config jsonb not null` — shape depends on `schedule_type`, validated via a zod
  discriminated union, not DB constraints: `{}` for `daily`; `{"weekdays": int[]}` for
  `weekdays_fixed` (JS `Date.getDay()` convention, 0=Sunday); `{"days_per_week": int}` (1–6) for
  `days_per_week_floating`. New schedule types are additive — a new allowed value + new
  `schedule_config` shape + new streak-eval branch, never a breaking migration.
- **corner_members** — hand-seeded witness pairs. `subject_id`, `witness_id` (both → profiles),
  `unique(subject_id, witness_id)`, `check(subject_id <> witness_id)`.
- **proofs** — `user_id`, `habit_id`, `app_day date` (server-computed at insert, not a generated
  column — timezone math isn't IMMUTABLE), `submitted_at timestamptz`, `photo_path text`,
  `note text`, `status text check in ('waiting','backed','broken')`,
  `resolution text check in ('votes','no_response')`, `resolved_at`. Partial unique index on
  `(user_id, app_day)` where status in `('waiting','backed')` — allows re-posts after a `broken`
  day, blocks duplicates otherwise.
- **votes** — `proof_id`, `voter_id`, `vote text check in ('back','call')`,
  **`voted_at timestamptz not null default now()`** (added per `pilot-scope.md` §A1 — the only way
  to measure witness response-time drift over the 4 weeks), `unique(proof_id, voter_id)`. No client
  `INSERT`/`UPDATE` grant — writes only via `cast_vote()`.
- **Storage**: `proofs` bucket, private. Insert policy restricts each user to their own folder path;
  reads go through server-issued signed URLs.
- **`best_run(p_commitment uuid) returns int`** — SQL function returning the longest run ever
  achieved for a habit, used to drive the "New best run" / "N off your best run" nudge copy (§10,
  §9 Home). Computed from `proofs` history, not stored.

## §6 — Security & RLS

- RLS enabled on every table. Self-or-corner-related `SELECT` on profiles/habits/proofs/votes (a
  witness can see their subject's data and vice versa). `proofs` insert restricted to
  `user_id = auth.uid()`. No client `UPDATE`/`DELETE` on `proofs` or `votes` — status changes only
  via SQL functions.
- Default functions to `SECURITY INVOKER`. Use `SECURITY DEFINER` only where an intentional RLS
  bypass is required (`cast_vote()`, the stale-proof resolver) — and then: `search_path = ''`,
  fully-qualified object names, explicit `auth.uid()` authorization check inside the function,
  `REVOKE EXECUTE FROM PUBLIC` + grant only to `authenticated`, row locking (`FOR UPDATE`) for
  atomicity, and a test for both the allowed and the denied case.
- Storage bucket is private; every read is a signed URL. Never a public bucket.
- Never the secret key (`sb_secret_...`, or a legacy `service_role` key) in anything that reaches
  the browser or a `NEXT_PUBLIC_*` variable. Note that secret keys now 401 automatically if used
  from a browser (matched on the User-Agent header) — a real guardrail the old service_role JWT
  didn't have, but not a substitute for keeping it server-only.

## §7 — Auth flow

Magic-link email auth via Supabase, no passwords. `proxy.ts` (Next.js 16 renamed `middleware.ts` to
`proxy.ts` — same file convention and job, refreshing the session on every request; use `proxy.ts`
for anything scaffolded from here on) refreshes the session on every request.

**`proxy.ts`'s matcher must exclude `/auth/callback`.** Confirmed live, from actual auth logs, not
speculation: `proxy.ts` calling `getClaims()` on the callback request interfered with the PKCE
`code_verifier` cookie the callback route needs to redeem the magic-link code, causing a
same-second `"invalid flow state, flow state has expired"` failure on the *first and only*
exchange attempt (not a real timeout — the whole thing failed one second after the link was
clicked). Fix is at the matcher level, not by treating `/auth/callback` as a "public path" inside
`proxy.ts`'s own logic — the route needs proxy.ts not to run against it at all.

Server code defaults
to `supabase.auth.getClaims()` for protecting routes/data — it verifies the JWT signature locally
against the project's JWKS on every call, no network round-trip. Use `getUser()` instead only where
a fresh, server-verified record is specifically needed (it costs a call to the Auth server). Never
`getSession()` alone for authorization — its data isn't revalidated server-side.

Files: `proxy.ts`, `lib/supabase/server.ts`, `lib/supabase/client.ts`, `app/login/page.tsx`,
`app/auth/callback/route.ts`.

## §8 — Mechanics (server actions & business logic)

1. **Day-boundary function** (`appDay.ts`) — `getAppDay(utcTimestamp: Date): string`, built on
   `Intl.DateTimeFormat` with `timeZone: 'America/New_York'`. Every place that needs "what day is
   this" imports this function, never reimplements it.
2. **Streak** (`streak.ts`) — computed on read, dispatched on `habit.schedule_type`:
   - `daily`/`weekdays_fixed`: day-by-day backward walk, skips non-required weekdays, excludes an
     unresolved current-day proof without breaking the run, stops on first `broken`/missing
     required day.
   - `days_per_week_floating`: week-by-week walk, Monday–Sunday calendar weeks. A fully-elapsed
     week counts if `backed` proofs ≥ `days_per_week`; the current in-progress week is never
     evaluated. Both variants take "today" as an explicit parameter, never call `new Date()`
     internally.
3. **`postProof`** server action — verifies session server-side, computes `app_day`/`submitted_at`
   itself (never trusts a client timestamp). **Updates the existing row in place** if a `waiting`/
   `backed` proof already exists for today — never inserts a second row for the same app-day.
4. **`castVote`** → `cast_vote()` SQL function — `SELECT ... FOR UPDATE` locks the proof row, so two
   near-simultaneous votes can't both resolve it independently. Handles the split-vote case (1 back
   + 1 call stays `waiting`) correctly.
5. **36h auto-clear** — `resolve_stale_proof()` SQL function (same locking pattern) +
   `/api/cron/resolve-proofs` route on `vercel.json` (daily on Hobby — Vercel may run it any time
   within the scheduled hour, not exactly on the minute, to spread load across accounts; don't
   assume it fires at precisely e.g. `05:00`). **Backstop**: on Home load,
   opportunistically resolve any of the user's own witnessed proofs already stale, via
   `resolve_stale()`, so the visible experience stays close to 36h.
6. **`best_run()`** — see §5.

## §9 — Screens

1. **Sign-in** — email + magic link.
2. **Home** (`app/page.tsx`) — the hero (run/streak card), Prove It action, "Your call" pending
   review list. States: idle/Prove-It-available, waiting (sent, out with corner), backed, broken.
   See §10 for nudge copy per state.
3. **Camera capture** (`app/capture/page.tsx`) — opens camera directly on tap, no form/category.
4. **Note/send** — optional note, Retake / Send it.
5. **History** (`app/run/page.tsx`, "Your run") — chronological list of resolved proofs, each
   showing resolution type (see §10's "Cleared" vs "Backed" distinction — `pilot-scope.md` §A2), End
   this commitment.
6. **Setup** — designed in the PDF, **not built in v1**. Habits/corners are hand-seeded (§14).

"Corner review" (Back it / Call it) is not a separate route — it's the "Your call" list embedded on
Home.

## §10 — Copy deck

Exact strings for this build (see §2's note on copy being locked-for-build, not locked-forever).
Bracketed values are template placeholders; the PDF's example values are shown for tone reference.

**Sign-in**
- Headline: "Prove it to the people who'd know."
- Sub-line: "One habit. Two mates who back it or call it. Four weeks."
- Email placeholder: "you@email.com"
- Button: "Send me a link"
- Helper text: "No password. We email you a link that signs you in."

**Home — hero**
- Eyebrow: `[Weekday] · Week [N] of 4`
- Run number, large, with unit label "DAYS IN A ROW" (or "WEEKS IN A ROW" for a
  `days_per_week_floating` habit — see `pilot-implementation-plan.md` §Key mechanics)
- Nudge line, one of:
  - New best: "New best run." / "New best run. Nobody has done better this month."
  - Within 3 of best: "[N] off your best run." (e.g. "Two off your best run.")
  - Run of zero: "[Weekday] broke a run of [N]. Start the next one now."
  - Otherwise: "Keep it going."
  - Nothing submitted yet today, still due: "Today is in their hands." (shown once sent, waiting on
    corner)
- Habit name, e.g. "Train before work"
- Corner line: "[Name] and [Name] are in your corner"
- Primary action button: "Prove it" (📷) — or "Start again" (📷) on a broken run

**Home — "Your call" section**
- Section label: "Your call"
- Empty state: "Nobody needs you right now."
- Pending review row: photo thumbnail, name, timestamp, two buttons: **"Back it"** / **"Call it"**

**Camera capture**
- Header: "Proof for [Habit name]"
- Cancel link
- (shutter button, no label)

**Note/send**
- Helper text: "[Name] and [Name] will see this"
- Note placeholder: "Add a note — optional"
- Buttons: "Retake" / "Send it"

**Resolution states** (History and Home, once a proof resolves — `pilot-scope.md` §A2)
- Real consensus back: "[Name] and [Name] backed it." / "[N] in a row."
- Auto-cleared, no votes in time: "Cleared — nobody got to it in time." (new copy, not in the PDF —
  written to match the spec's own honest, non-scolding tone per PDF p.4's "we count those tags —
  they are the honest measure of whether this works"; distinct from the "backed" string so a subject
  can tell the safety net from real peer engagement)

**History ("Your run")**
- Header: "[Habit name]" with back chevron, "[N] in a row"
- Row per day: date, thumbnail, "Backed" or "Cleared" + avatar initials of who voted (if any)
- Footer: "Week [N] of 4 · [schedule description] · [Name] & [Name]"
- Button: "End this commitment"

## §11 — Design tokens

**These are directional, read off the PDF's descriptions and `pilot-implementation-plan.md`'s
"Visual design" decision — not exact hex/spacing values sampled from the mockup art. Confirm against
the actual PDF pages (zoomed) before treating any specific value below as final.**

- Background (hero/streak card): near-black, e.g. `#0B0B0C`–`#111113`
- Background (content sections): off-white, e.g. `#FAF9F7`
- Accent (CTA, "Call it", broken state, key headline word): crimson/red, e.g. `#B5283C`–`#C22E3E`
- Positive/"backed" state: green, e.g. `#3E8E5A`–`#4CAF6D`
- Highlight box (e.g. "What I need from you" callouts): pale pink/crimson tint background with
  crimson left border
- Type: bold, condensed sans for headlines/hero numerals (visually similar to Archivo Black,
  Oswald, or Anton — pick one and confirm it reads correctly at the hero's large size); regular
  sans (system stack or Inter) for body/UI text
- Layout: card-based, mobile-first, generous corner radius on cards, single-column

Implementation note: Tailwind v4 (current default with `create-next-app --tailwind`) is CSS-first
— there's no `tailwind.config.ts` by default. Define these as custom properties in an `@theme`
block in `globals.css` (alongside `@import "tailwindcss";`), not in a config file.

## §12 — PWA & meta

- `manifest.json`, minimal hand-rolled service worker (no offline-first requirement — see §13),
  iOS meta tags (`apple-mobile-web-app-capable`, `apple-touch-icon`, viewport meta).
- Headline/body fonts loaded per §11.
- No app store — install via Add to Home Screen from a shared link. iOS install path is not
  discoverable; walk each pilot user through it in person (see `SETUP.md` Part 9).

## §13 — Non-functional requirements

- Photo capture: client-side downscale before upload — longest edge 1280px, JPEG quality 0.72,
  target under 300KB (`lib/image.ts`).
- Cold-open-to-proof-sent target: **under 10 seconds** — the product's own design premise
  ("One habit. Two mates. Ten seconds."). Time this by hand after deploy; if it's over ten seconds,
  that's the first bug, not a nice-to-have.
- No offline-first requirement — the app assumes connectivity; a failed upload should fail visibly
  and let the user retry, not silently queue.
- Hosting stays within Vercel Hobby limits (see §2) — no Pro-tier upgrade for v1.

## §14 — Seed data

`supabase/seed.sql` template with four placeholder user IDs (filled in after all four pilot members
sign in once via magic link — real `auth.users` IDs, not invented). For each: one habit
(name, `schedule_type`, `schedule_config`), two corner witnesses.

Seeding constraints (`pilot-scope.md` §B2), confirmed before running this:
- Each witness should have regular in-person contact with their subject.
- The two witnesses for a given subject shouldn't both have known unavailability (travel, etc.)
  during the same pilot week.

## §15 — Acceptance criteria

Automated (Vitest — `appDay`, `streak`, vote-quorum resolution):
- [ ] `getAppDay` is correct across the 4am ET boundary, including DST transitions.
- [ ] `daily`/`weekdays_fixed` streak walk: skips non-required days, excludes unresolved current
      day, stops on first broken/missing required day.
- [ ] `days_per_week_floating` streak walk: correct on a week that hits quota exactly on the last
      day, a week that falls one short, and the current in-progress week never breaking the run.
- [ ] `cast_vote()`: one back is not enough; two backs flips to `backed` and increments the run; two
      calls flips to `broken`; a split vote (1 back + 1 call) stays `waiting`.

Automated (Playwright, per `SETUP.md` Part 7 — testable without a real phone):
- [ ] Posting twice in one app-day updates the existing proof, never inserts a second row.
- [ ] A non-corner member cannot vote — tested by calling the server action directly, not through
      the UI.

Manual, on real phones:
- [ ] Sign in via magic link → Prove It → camera → send → shows up as "Your call" on a witness's
      phone → Back/Call it → streak/history update correctly.
- [ ] Install-from-link (Add to Home Screen) works on iOS.
- [ ] Rest day adjacent to a broken day.
- [ ] The 4am boundary itself (post at 3:59am vs 4:01am ET).
- [ ] A re-post after a `broken` day.
- [ ] The Monday-boundary rollover for a floating habit mid-streak.
- [ ] "Backed" vs "Cleared — nobody got to it in time" render as visibly distinct states (§10/§A2).
- [ ] Cold open to proof sent: under 10 seconds (§13).

Pilot-level (measured over the 4 weeks, not pre-merge — `pilot-scope.md` §B1):
- [ ] ≥80% of days resolved by real vote (`resolution = 'votes'`), not auto-clear, by week 4.
- [ ] No corner member's median vote response time (via `votes.voted_at`) more than triples between
      week 1 and week 4.
- [ ] At least 2 of the 3 non-founder participants still posting daily in week 4.

## §16 — Out of scope

Deliberately cut from v1, per the original spec (`Chalkline-walkthrough.pdf` p.5) — do not build
any of these without the user explicitly reopening it:

Money & stakes, the ledger, settling up, gym leaderboard, notifications, multiple habits, text-only
proof, badges & points, setup screen, dispute flow, tab bar, stats.

Money is the one with the most obvious pull to add — it was in the original plan and is the obvious
way to give the mechanic teeth. It's cut specifically because testing two new ideas (peer
accountability *and* stakes) at once would tell you nothing about either; the schema is built so it
can come back in v2.

## Known limitations (accepted for v1)

Found during the `rls-auditor` review of `supabase/schema.sql`/`policies.sql`, judged low-risk
enough not to fix rather than overlooked. Documented here so a future schema change doesn't
silently "fix" one without it being a deliberate choice. Full detail lives in the SQL comments at
the cited locations.

- **`app_day` self-drift on a directly-`PATCH`ed stale proof** (`proofs_set_submission_fields`
  trigger, `schema.sql`). A still-`waiting` proof from a previous day, if updated directly via the
  REST API rather than through the app, can have its `app_day` recomputed to today — trading one
  day for another (blocked from duplicating by the unique index). Self-harm only; the app's own
  code never triggers this since `postProof` only ever touches today's row.
- **Opaque RLS rejection before seeding** (`proofs_insert_own` policy, `policies.sql`). If a pilot
  user signs in before `seed.sql` has been run for them, tapping "Prove It" fails with a generic
  RLS error rather than a friendly message, since `habit_id` can't match any row in `habits` yet.
  Acceptable because seeding happens before real phones are in use (§14), but worth a friendlier
  error message if this ever stops being true.
