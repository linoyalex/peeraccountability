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
- **SETUP.md Part 6 is implemented and merged to `main`** through PR #1 (merge commit `a34bd61`): `appDay.ts` owns the DST-correct 4am ET boundary; `streak.ts` validates all three schedule shapes with zod and computes current/best runs in app code; the real Home server component calls `resolve_stale()`, loads the signed-in user's habit/corner/proof state and pending reviews, and mints one-hour private proof-photo URLs through a server-only admin client; `components/Hero.tsx` renders the Home states and locked copy.
- Part 6's TDD suite has 21 passing tests covering the 4am boundary (including both DST transitions), daily/fixed streak breaks and rest days, same-day re-post after a broken proof, floating quota edges/Monday rollover/current-week exclusion, and schedule validation. Typecheck, lint, and the production webpack build pass.
- The Home screen has not yet been exercised against a seeded pilot account, because the four real users/habits/corners are still intentionally unseeded. Its `/capture` and `/run` links and disabled Back/Call controls are Part 7 boundaries, not completed interactions yet.
- **Part 7 has NOT been started.** A 2026-09-16 session opened on the premise that it had been; there is no such work in the repo, on any branch, in any stash or worktree, or in any PR. `main` sits exactly at the end of Part 6.
- **The live database is still unseeded and Home therefore throws for every real account.** Confirmed by query: 1 auth user, 1 profile, 0 habits, 0 corner_members. `app/page.tsx` raises "No seeded commitment found for the signed-in user" with no habit, and requires exactly two corner members after that. `supabase/seed-test.sql` (new, on `fix/vercel-framework-preset`) unblocks this without waiting on recruiting — but it needs **three** signed-in accounts, because `corner_members` enforces `subject_id <> witness_id`. Two is not enough for a valid squad.
- Supabase project + Vercel account created; `.mcp.json` configured and authenticated in this session. GitHub's Supabase post-merge check passed. Vercel's PR preview and post-merge production deployment both failed with only the generic deployment-failed status exposed through GitHub; see the session-specific note below before treating that as an application build failure.
- Claude Code workspace configured and committed: typecheck/lint hook, three audit subagents (`rls-auditor`, `spec-auditor`, `ui-verifier`), path-scoped rules.
- A dev server **is** running on port 3000 (PID 51992, started ~2026-09-16 00:16, outside any current session). It is healthy and serving current code: `/` 307s to `/login` when unauthenticated and every §10 sign-in string renders verbatim. Check port 3000 before starting another.

## Next concrete steps, in order

1. Merge `fix/vercel-framework-preset` (two commits: the `vercel.json` framework pin, and `supabase/seed-test.sql`). Its PR preview is the first real proof that the Vercel fix works against Vercel's own builder rather than only locally.
2. Seed a testable squad: sign in two throwaway addresses via magic link, substitute the three placeholders in `supabase/seed-test.sql`, run it, and walk the Home screen by hand. This is the first time Part 6 gets exercised against real data, and it must happen before Part 7 builds on top of it.
3. SETUP.md Part 7 — capture/downscale/send, `postProof`/`castVote`, functional `ProofCard`, and History. Replace Part 6's deliberately disabled Back/Call controls and make the existing `/capture` and `/run` links real.
4. Continue through Parts 8–9 in order.
5. Separately, not blocking the build: recruit the 4 real squad members and fill in `seed.sql`'s placeholder IDs (see "Still open" below). Run `seed-test.sql`'s teardown before the real pilot starts.

## Things a fresh agent/session won't know unless told

- **`.env.local` is gitignored, not committed.** Recreate from `.env.example` with this project's own credentials on a new machine.
- **MCP OAuth is per-machine/session** — re-run `/mcp` on a new one.
- **Vercel: diagnosed and fixed (2026-09-16), pending merge.** Root cause was project-side, exactly as the earlier suspicion held — not app code. Every deployment failed with `No Output Directory named "dist" found after the Build completed`; the Next.js build itself always succeeded (compiled, typechecked, generated all six routes) and Vercel then discarded the output. The project was created while the repo was still empty, so framework detection found nothing and left **Framework Preset = "Other"**. Fixed by committing `vercel.json` with `"framework": "nextjs"` on branch `fix/vercel-framework-preset`; verified locally with `vercel build --prod`, which now reports `Build Completed in .vercel/output` and emits the serverless functions. The dashboard preset is still literally "Other" — `vercel.json` overrides it, so don't be alarmed by the settings page.
- **The old "Vercel CLI credential is invalid" note was stale** — `vercel whoami` returns `linoyalex`, scope `linoys-projects-bebf52d6`. But the globally installed CLI (50.34.2) is too old for `vercel env add`: it rejects every documented invocation with `action_required: git_branch_required`, including the exact command its own hint tells you to run. Use `npx --yes vercel@latest` for env work.
- **Vercel env vars are split by type, and secrets can't be read back.** `vercel env pull` returns empty strings for `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` and `POSTGRES_PASSWORD` while public values (`NEXT_PUBLIC_*`, `SUPABASE_URL`, anon/publishable) come through fine. That is Vercel's "Secret" type being write-only, **not** a missing value — don't "fix" it by overwriting production secrets. Preview previously had no variables at all, so every PR preview would have failed at runtime even after the framework fix; the three the app actually reads are now set for Preview (`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` as type `config`, `SUPABASE_SECRET_KEY` as type `secret`).
- **`next lint` no longer exists (Next.js 16).** Scripts are wired as `npm run lint`/`typecheck`/`test`/`build`; the hook and any docs should call those, not `npx next lint`.
- **`proxy.ts`'s matcher must exclude `/auth/callback`.** Running the session-refresh logic on that route corrupted the PKCE flow state and broke magic-link sign-in — found by reading real Supabase auth logs, not by guessing. See `docs/BUILD.md` §7 for the full story before touching `proxy.ts`.
- **`vitest` needed `vite` installed explicitly** (missing peer dependency under `--legacy-peer-deps`). Part 6 now has real tests, so the temporary `passWithNoTests: true` setting has been removed. The tracked `.npmrc` sets `legacy-peer-deps=true` because Vitest 5's optional `@types/node` peer range conflicts with the scaffold's Node 20 types; without it, a clean `npm ci` (including Vercel's install) fails before the build starts.
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
