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
- **SETUP.md Part 6 is implemented locally:** `appDay.ts` owns the DST-correct 4am ET boundary; `streak.ts` validates all three schedule shapes with zod and computes current/best runs in app code; the real Home server component calls `resolve_stale()`, loads the signed-in user's habit/corner/proof state and pending reviews, and mints one-hour private proof-photo URLs through a server-only admin client; `components/Hero.tsx` renders the Home states and locked copy.
- Part 6's TDD suite has 21 passing tests covering the 4am boundary (including both DST transitions), daily/fixed streak breaks and rest days, same-day re-post after a broken proof, floating quota edges/Monday rollover/current-week exclusion, and schedule validation. Typecheck, lint, and the production webpack build pass.
- The Home screen has not yet been exercised against a seeded pilot account, because the four real users/habits/corners are still intentionally unseeded. Its `/capture` and `/run` links and disabled Back/Call controls are Part 7 boundaries, not completed interactions yet.
- Supabase project + Vercel account created; `.mcp.json` configured and authenticated in this session.
- Claude Code workspace configured and committed: typecheck/lint hook, three audit subagents (`rls-auditor`, `spec-auditor`, `ui-verifier`), path-scoped rules.
- No dev server was started during Part 6. Check port 3000 before starting one anyway, in case an older Part 5 process survived outside this session.

## Next concrete steps, in order

1. SETUP.md Part 7 — capture/downscale/send, `postProof`/`castVote`, functional `ProofCard`, and History. Replace Part 6's deliberately disabled Back/Call controls and make the existing `/capture` and `/run` links real.
2. Continue through Parts 8–9 in order.
3. Separately, not blocking the build: recruit the 4 real squad members and fill in `seed.sql`'s placeholder IDs (see "Still open" below). A seeded account is also needed for the first real-data Home/UI verification.

## Things a fresh agent/session won't know unless told

- **`.env.local` is gitignored, not committed.** Recreate from `.env.example` with this project's own credentials on a new machine.
- **MCP OAuth is per-machine/session** — re-run `/mcp` on a new one.
- **`next lint` no longer exists (Next.js 16).** Scripts are wired as `npm run lint`/`typecheck`/`test`/`build`; the hook and any docs should call those, not `npx next lint`.
- **`proxy.ts`'s matcher must exclude `/auth/callback`.** Running the session-refresh logic on that route corrupted the PKCE flow state and broke magic-link sign-in — found by reading real Supabase auth logs, not by guessing. See `docs/BUILD.md` §7 for the full story before touching `proxy.ts`.
- **`vitest` needed `vite` installed explicitly** (missing peer dependency under `--legacy-peer-deps`). Part 6 now has real tests, so the temporary `passWithNoTests: true` setting has been removed. New npm installs on this dependency tree may still need `--legacy-peer-deps` because Vitest 5's optional `@types/node` peer range conflicts with the scaffold's Node 20 types.
- **A `supabase` *plugin* MCP exists alongside the read-only `.mcp.json` one**, with real write access (`apply_migration`, `execute_sql`, `create_project`). It was used *read-only* this session (`get_advisors`, `query_logs`, `list_projects`) — deliberately never for writes, to preserve the "Claude never applies schema changes itself" rule. Don't reach for its write tools without the user explicitly asking.
- **`best_run()` is deliberately not a SQL function** — computed in app code (`streak.ts`) instead. See the closing comment in `supabase/schema.sql`.
- The Part 6 security pass was manual because the configured `security-review` skill was not available in the Codex environment: the secret-key client is guarded by `server-only`, only signs proof paths first selected through the user's RLS-scoped client, and no secret-key reference appeared in `.next/static`.
- Two known, accepted (not fixed) SQL edge cases — see `docs/BUILD.md`'s "Known limitations" section.
- Supabase key naming: use `sb_publishable_...`/`sb_secret_...`, not legacy `anon`/`service_role`.
- Next.js 16 renamed `middleware.ts` to `proxy.ts`.
- No `src/` directory in this project (a deliberate Part 5 choice, see `docs/BUILD.md` §4).

## Still open — needs a human decision, not a fresh agent's judgment call

- `pilot-scope.md` §B1's numeric pilot-success thresholds are proposed, not confirmed.
- The 4 real squad members aren't recruited yet — needed before `seed.sql` can be filled in. Constraints: in-person overlap with witnesses; a subject's two witnesses shouldn't both be away the same pilot week (`pilot-scope.md` §B2).
- `docs/BUILD.md` §11's design tokens (colors/fonts) are directional, chosen during Part 5's scaffold, not confirmed against the actual PDF mockup art.
- The `engineering`/`design`/`qodo` plugins named in SETUP.md's original Part 1 don't exist under those names — confirmed by the user running `/plugin`. A large, unrelated set of other plugins/skills is available in this environment (Vercel, Supabase, Postman, `superpowers`, etc.); see the session that ran Part 5 for which ones are actually relevant to this project and which aren't.
