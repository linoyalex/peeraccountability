# Chalkline — Handoff

**Last updated:** 2026-09-16. This file is overwritten, not versioned — it reflects current state only. Git history has every past version if you need it.

## Doc map — read in this order if you're new here

1. **`CLAUDE.md`** — standing rules for this repo (working mode, coding/architecture/testing/security). Read this first, always.
2. **`docs/BUILD.md`** — the canonical, numbered build reference (§1–§16). What build prompts cite by section.
3. **`SETUP.md`** — the step-by-step Claude Code configuration + build runbook (Parts 0–9).
4. **This file** — where things actually stand right now.
5. `docs/pilot-implementation-plan.md`, `docs/pilot-scope.md`, `docs/Chalkline-walkthrough.pdf` — source material `BUILD.md` consolidates; read for fuller rationale where `BUILD.md` is terse.
6. `reviews/` — historical point-in-time reviews (PM, security). Don't edit old ones; add new dated ones.
7. **`AGENTS.md`** — exists only so Codex (which doesn't read `CLAUDE.md`) gets pointed at the same three files above.

## Where things actually stand

- **The app is scaffolded and auth works, end to end, confirmed by actually signing in** (not just a clean build — see `verification-before-completion` in the git log around SETUP.md Part 5). Next.js 16 (App Router, TypeScript, Tailwind v4), `@supabase/ssr` magic-link sign-in, `proxy.ts` session refresh.
- `supabase/schema.sql`/`policies.sql` are applied to the real project (not just drafted) — three rounds of `rls-auditor` review, plus two more real bugs found only by testing the live database with `has_function_privilege()` and Supabase's own advisor tool (a Supabase default-ACL gotcha, and a couple of RLS performance warnings). All fixed and reflected in the SQL files' comments.
- SETUP.md Parts 0–5 are done. Part 6 (Home screen) hasn't started.
- Supabase project + Vercel account created; `.mcp.json` configured and authenticated in this session.
- Claude Code workspace configured and committed: typecheck/lint hook, three audit subagents (`rls-auditor`, `spec-auditor`, `ui-verifier`), path-scoped rules.
- The dev server may still be running in the background from Part 5's verification (`npm run dev`) — check before starting another one on the same port.

## Next concrete steps, in order

1. SETUP.md Part 6 — Home screen (`app/page.tsx` real version, `components/Hero.tsx`), which needs `streak.ts` — this is where TDD actually starts mattering (see the `superpowers` discussion in the session that did Part 5, if picking this up fresh).
2. Continue through Parts 7–9 in order.
3. Separately, not blocking the build: recruit the 4 real squad members and fill in `seed.sql`'s placeholder IDs (see "Still open" below).

## Things a fresh agent/session won't know unless told

- **`.env.local` is gitignored, not committed.** Recreate from `.env.example` with this project's own credentials on a new machine.
- **MCP OAuth is per-machine/session** — re-run `/mcp` on a new one.
- **`next lint` no longer exists (Next.js 16).** Scripts are wired as `npm run lint`/`typecheck`/`test`/`build`; the hook and any docs should call those, not `npx next lint`.
- **`proxy.ts`'s matcher must exclude `/auth/callback`.** Running the session-refresh logic on that route corrupted the PKCE flow state and broke magic-link sign-in — found by reading real Supabase auth logs, not by guessing. See `docs/BUILD.md` §7 for the full story before touching `proxy.ts`.
- **`vitest` needed `vite` installed explicitly** (missing peer dependency under `--legacy-peer-deps`), and needs `passWithNoTests: true` in `vitest.config.mts` until Part 6 adds real test files — otherwise `npm run test` fails on "no test files found" even though nothing is actually broken.
- **A `supabase` *plugin* MCP exists alongside the read-only `.mcp.json` one**, with real write access (`apply_migration`, `execute_sql`, `create_project`). It was used *read-only* this session (`get_advisors`, `query_logs`, `list_projects`) — deliberately never for writes, to preserve the "Claude never applies schema changes itself" rule. Don't reach for its write tools without the user explicitly asking.
- **`best_run()` is deliberately not a SQL function** — computed in app code (`streak.ts`) instead. See the closing comment in `supabase/schema.sql`.
- Two known, accepted (not fixed) SQL edge cases — see `docs/BUILD.md`'s "Known limitations" section.
- Supabase key naming: use `sb_publishable_...`/`sb_secret_...`, not legacy `anon`/`service_role`.
- Next.js 16 renamed `middleware.ts` to `proxy.ts`.
- No `src/` directory in this project (a deliberate Part 5 choice, see `docs/BUILD.md` §4).

## Still open — needs a human decision, not a fresh agent's judgment call

- `pilot-scope.md` §B1's numeric pilot-success thresholds are proposed, not confirmed.
- The 4 real squad members aren't recruited yet — needed before `seed.sql` can be filled in. Constraints: in-person overlap with witnesses; a subject's two witnesses shouldn't both be away the same pilot week (`pilot-scope.md` §B2).
- `docs/BUILD.md` §11's design tokens (colors/fonts) are directional, chosen during Part 5's scaffold, not confirmed against the actual PDF mockup art.
- The `engineering`/`design`/`qodo` plugins named in SETUP.md's original Part 1 don't exist under those names — confirmed by the user running `/plugin`. A large, unrelated set of other plugins/skills is available in this environment (Vercel, Supabase, Postman, `superpowers`, etc.); see the session that ran Part 5 for which ones are actually relevant to this project and which aren't.
