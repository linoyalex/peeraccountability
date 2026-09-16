# CLAUDE.md — Peer Accountability (Chalkline)

Project-specific instructions for Claude Code working in this repo. These apply regardless of which machine or account is used.

## Project context

- `docs/Chalkline-walkthrough.pdf` — original product spec and rationale. Source of truth for product intent.
- `docs/pilot-implementation-plan.md` — confirmed build plan for the v1 pilot.
- `docs/pilot-scope.md` — scope additions from PM review. The functionality/process items (A1, A2, B2, B3, B4) are adopted; the B1 numeric success thresholds are proposed and still need explicit confirmation before the pilot starts.
- `docs/BUILD.md` — **the canonical build reference.** Consolidates the three docs above into one
  numbered structure (§1-§16: locked decisions, schema, mechanics, screens, copy deck, design
  tokens, acceptance criteria, out-of-scope). Build prompts cite it by section number; the other
  docs are its sources and fuller rationale where it's terse.
- `reviews/` — point-in-time reviews (PM, security, etc.). Historical record — add new dated reviews rather than editing old ones.
- `HANDOFF.md` — current build status and anything a fresh session needs to know that isn't obvious from the other docs (uncommitted local state, per-machine setup steps, deliberate deviations from the plan). Overwritten, not versioned. Check it at the start of a session; update it before ending one.

Treat the "Confirmed decisions" in `pilot-implementation-plan.md`, and `pilot-scope.md`'s adopted items above, as settled. If a request would reopen one of those — or would lock in the still-open B1 thresholds — say so explicitly and confirm before proceeding. Don't silently comply or silently refuse.

## Working mode (defaults for this repo)

- **Default to Plan Mode** for anything beyond a trivial, fully-reversible local edit. Present the plan and get explicit go-ahead before writing code.
- **Ask before proceeding** whenever missing information would materially change the result, a change touches a "Confirmed decision," or it affects schema/security/scope. Don't guess silently on anything that's genuinely the user's call — but don't manufacture questions on routine, reversible work either.
- **Get explicit buy-in before**: applying a schema migration to a real database (drafting one locally is fine), changing RLS policies or `SECURITY DEFINER` functions, touching the 4 pilot users' real data, force-pushes/rebases/resets, or merging to `main`.
- Silence is not approval on anything irreversible — wait for a clear yes.

## Coding standards

- TypeScript strict mode. No `any`.
- Next.js App Router: server-side code (Route Handlers/Server Actions) validates and computes everything security- or correctness-sensitive itself — never trust a client-supplied `user_id` or timestamp (matches the planned `POST /api/proofs` / `cast_vote()` pattern in `pilot-implementation-plan.md`).
- One source of truth per piece of shared logic — e.g. `appDay.ts` is the only place "what day is it" gets computed; new code imports it, never reimplements it.
- Use zod for runtime validation of anything JSON-shaped (`schedule_config`, request bodies) — DB constraints alone aren't enough given the deliberately flexible schema.
- This is a ~1-week pilot build: prefer the direct solution the plan already specifies over introducing new abstractions, layers, or config for hypothetical future needs.

## Architecture guidelines

- Derived state (streaks) is computed on read, not stored — don't introduce cached/denormalized counters without a stated reason.
- Operations needing atomicity (vote resolution, stale-proof clearing) go through a SQL function with row locking (`FOR UPDATE`) — never an ad hoc client-side update. Default functions to `SECURITY INVOKER`; use `SECURITY DEFINER` only when an intentional RLS bypass is required, and then set `search_path = ''`, schema-qualify every object, check `auth.uid()` explicitly, `REVOKE EXECUTE FROM PUBLIC` and grant only the required role, and test both the allowed and denied case.
- New schedule types must be additive — a new allowed value in the `schedule_type` check constraint + new `schedule_config` shape + new streak-eval branch — never a breaking migration to the existing three (`daily`, `weekdays_fixed`, `days_per_week_floating`).
- Supabase Storage stays private. All reads go through server-issued signed URLs — never public bucket access.

## Product/PM guidelines

- The "deliberately missing" list from the original spec (money/stakes, notifications, multi-habit, setup screen, dispute flow, stats, tab bar) stays out of v1 unless the user explicitly reopens it.
- Check any new feature request against the pilot's actual hypothesis — does fixed peer witnessing improve habit adherence? Flag additions that don't serve that test rather than building them by default.
- Keep `pilot-scope.md`'s success criteria in view when reporting progress or pilot results — "done" means passing tests and a clean build, "successful" is a separate, higher bar defined there.
- UI copy comes from `docs/BUILD.md` §10 verbatim — don't invent or rephrase strings while implementing. Copy is locked for this build, not locked forever: it's expected to evolve after real pilot feedback, but changes go through the user, not ad-hoc mid-build rewrites.
- Visual styling follows `docs/BUILD.md` §11 (near-black hero, off-white content sections, crimson accent, green backed-state, bold condensed headline type, card-based mobile-first). Its exact hex/font values are directional, not confirmed against the actual mockup art — flag rather than silently firm them up if precision starts to matter.

## Testing standards

- TDD for core mechanics: `appDay.ts`, `streak.ts`, and vote-quorum/`cast_vote()` logic get tests written first (RED), then the implementation (GREEN). These are the pieces where a silent bug corrupts the core product mechanic.
- `vitest run` and `tsc --noEmit` must pass, and lint must be clean, before any commit that touches app code — pin the exact package-manager scripts (e.g. `npm run lint`/`typecheck`/`test`/`build`) once the app is scaffolded in Build step 1. Cover RLS policies and function grants with `supabase test db` (pgTAP) once functions exist, not just Vitest or manual checks.
- Manual edge cases from `pilot-implementation-plan.md` §Verification (split vote, the 4am boundary, re-post after a broken day, floating-week edges) get walked by hand before merge — don't assume unit tests alone cover them.
- Prefer a concurrent-vote race integration test when local Supabase/Docker is available; otherwise document the manual two-tab check that was performed instead.

## Security guidelines

- Server authorization defaults to `supabase.auth.getClaims()` (verifies the JWT locally on every call, no network round-trip) — use `getUser()` instead only where a fresh, server-verified record is specifically needed. Never authorize from `getSession()` alone; its data isn't revalidated server-side.
- RLS is reviewed table-by-table on any schema change — self-or-corner visibility only; no client `UPDATE`/`DELETE` on `proofs` or `votes`.
- Never commit secrets. `NEXT_PUBLIC_*` values are public by design — only the Supabase project URL and publishable key (`sb_publishable_...`, formerly the anon key) belong there. The Supabase secret key (`sb_secret_...`, formerly service_role), and any other secret, stays server-only and never appears in client bundles, logs, or source control.
- Run the `security-review` skill against any diff touching auth, RLS, storage policies, or the vote/proof state machine before it merges. If that skill isn't available in a given environment, work through the same checklist by hand: auth verified on every route, no client write path to `votes`/`proofs.status`, RLS reviewed table-by-table, storage private + signed-URL-only, zod validation on inputs, no secrets in source.

## Git workflow

- Work happens on a feature branch, never directly on `main` — verify the current branch before starting work; create or reuse a task branch as needed.
- Merges to `main` need a passing test run and a security review of the diff first.
- Commit messages explain why, not just what. Never force-push or amend a commit already pushed to a shared branch.
- This file is advisory, not enforcement — back the gates that must always hold (tests/typecheck/lint passing before merge) with branch protection / required CI checks, not just this document.