# Chalkline — Handoff

**Last updated:** 2026-09-15. This file is overwritten, not versioned — it reflects current state only. Git history has every past version if you need it.

## Doc map — read in this order if you're new here

1. **`CLAUDE.md`** — standing rules for this repo (working mode, coding/architecture/testing/security). Read this first, always.
2. **`docs/BUILD.md`** — the canonical, numbered build reference (§1–§16). What build prompts cite by section.
3. **`SETUP.md`** — the step-by-step Claude Code configuration + build runbook (Parts 0–9).
4. **This file** — where things actually stand right now.
5. `docs/pilot-implementation-plan.md`, `docs/pilot-scope.md`, `docs/Chalkline-walkthrough.pdf` — source material `BUILD.md` consolidates; read for fuller rationale where `BUILD.md` is terse.
6. `reviews/` — historical point-in-time reviews (PM, security). Don't edit old ones; add new dated ones.

## Where things actually stand

- **No application code yet.** No `package.json`. This is still 100% pre-scaffold — SETUP.md Parts 0–4 are done, Part 5 (Next.js scaffold + auth) hasn't started.
- Supabase project created; Vercel account created (both confirmed by the user).
- `.mcp.json` configured (Supabase hosted OAuth read-only, Vercel hosted OAuth, Playwright local) and authenticated in the session that did this work. **Not authenticated on a new machine/session until `/mcp` is re-run there.**
- Claude Code workspace configured and committed: a `PostToolUse` typecheck/lint hook, three audit subagents (`rls-auditor`, `spec-auditor`, `ui-verifier`), path-scoped rules for `supabase/**` and UI code.
- `supabase/schema.sql`, `supabase/policies.sql`, `supabase/seed.sql` are **drafted**, went through three rounds of `rls-auditor` review, and are verdict-ready to paste into the Supabase SQL editor. **Not yet run against the real project.** The audit caught and fixed a real self-backing/streak-forging exploit and a cross-corner vote-visibility leak — see the SQL files' own comments for what each policy/trigger is defending against, not just what it does.

## Next concrete steps, in order

1. Paste `schema.sql` then `policies.sql` into the Supabase SQL editor (a YOU step — Claude's Supabase MCP access is read-only by design, won't run this itself).
2. Create the `proofs` storage bucket (private) in the Supabase dashboard.
3. Scaffold the Next.js app and build the auth path (SETUP.md Part 5).
4. Continue through SETUP.md Parts 6–9 in order.
5. Separately, not blocking the build: recruit the 4 real squad members and fill in `seed.sql`'s placeholder IDs (see "Still open" below).

## Things a fresh agent/session won't know unless told

- **`.env.local` is gitignored, not committed.** On a new machine, recreate it from `.env.example` with *this project's own* real Supabase credentials — never copy credentials from another project.
- **MCP OAuth is per-machine/session.** Re-run `/mcp` and authenticate Supabase + Vercel again on a new machine.
- **The `.claude/settings.json` hook needs `/hooks` run once** (or the window restarted) before it activates, if `.claude/` didn't exist yet when the session started — a Claude Code file-watcher quirk, not a bug in the hook.
- **`best_run()` is deliberately not a SQL function**, despite `BUILD.md`/`SETUP.md` originally asking for one. It's computed in app code (`streak.ts`) instead, to avoid a second implementation of streak-walking logic that could silently diverge from the real one. See the closing comment in `supabase/schema.sql`.
- **Two known, accepted (not fixed) edge cases in the SQL** — see `docs/BUILD.md`'s "Known limitations" section (and the SQL comments it points at) for what they are and why they're accepted rather than fixed.
- **Supabase key naming changed mid-project**: use `sb_publishable_...`/`sb_secret_...`, not the legacy `anon`/`service_role` names, in anything new.
- **Next.js 16 renamed `middleware.ts` to `proxy.ts`** — same job, use the new name in anything scaffolded from here on.

## Still open — needs a human decision, not a fresh agent's judgment call

- `pilot-scope.md` §B1's numeric pilot-success thresholds are proposed, not confirmed.
- The 4 real squad members aren't recruited yet — needed before `seed.sql` can be filled in with real habits/corner pairings. Constraints: witnesses need regular in-person contact with their subject; a subject's two witnesses shouldn't both be away the same pilot week (`pilot-scope.md` §B2).
- `docs/BUILD.md` §11's design tokens (colors/fonts) are directional, not confirmed against the actual PDF mockup art.
- SETUP.md Part 1's plugin check (`engineering`/`design`/`qodo` via `/plugin`) was never explicitly confirmed done.
