# Chalkline — Claude Code setup and build runbook

Everything you need to go from where this repo already is to a working app. Two kinds of step:

- **YOU** — things Claude cannot do (create accounts, hold credentials, click Deploy).
- **PASTE** — literal prompts to paste into Claude Code in VS Code, in order.

Do them in sequence. Don't skip ahead to the build prompts; the configuration steps are what
make the build prompts reliable.

This repo (`peeraccountability`) already has `docs/Chalkline-walkthrough.pdf` (source spec),
`docs/pilot-implementation-plan.md`, `docs/pilot-scope.md`, a PM review under `reviews/`, and a
project `CLAUDE.md`. **`docs/BUILD.md` is the consolidated reference every PASTE prompt below
points at** — it folds the other docs into the exact numbered sections these prompts cite. Locked
decisions, including the pilot timezone (`America/New_York`, hardcoded — not a fill-in), are in
`docs/BUILD.md` §2. Nothing here should be re-litigated during execution without checking back in.

---

# Part 0 — YOU: before opening Claude (about 10 minutes)

**1. Tooling**
- Node 20 or newer (`node -v`).
- VS Code, with the **Claude Code** extension installed and signed in.

**2. The repo** — already done. This is the existing `peeraccountability` repo, currently on branch
`feat/v1-mvp`, already connected to `origin`. Just open the folder in VS Code; no new repo needed.

**3. Supabase** — [supabase.com](https://supabase.com), free tier.
- Create a project. Region: closest to your pilot group.
- From **Project Settings → API**: copy the **Project URL** and the **publishable** key
  (`sb_publishable_...` — a new project shows this name; older projects may still say
  **anon public**. Same purpose either way).
- From the same page: copy the **secret** key (`sb_secret_...`; older projects: **service_role**).
  Treat it like a password.
- The **project ref** is the subdomain of your project URL (`https://<ref>.supabase.co`). Not a
  secret — it's already visible in the URL — but you'll need it for `.mcp.json` in Part 2.
- No personal access token needed. The Supabase MCP server is hosted and authenticates via OAuth
  from inside Claude Code (Part 3) — skip creating one unless something later specifically asks
  for it. If you ever do need one (e.g. CI), it lives under your **account** avatar → **Account
  Preferences → Access Tokens** (not the project sidebar), and Supabase's own guidance is to use a
  **scoped** token — read-only, one project — rather than a classic full-account one.

**4. Vercel** — [vercel.com](https://vercel.com), free tier. Sign in with GitHub.

**5. GitHub** — already done (`origin` already points at
`https://github.com/linoyalex/peeraccountability.git`). Nothing to create.

**6. Environment variables.** Create `.env.local` in the repo (Claude will add it to `.gitignore`
in the next step, but create it now so nothing is ever committed):

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>
SUPABASE_SECRET_KEY=<secret key>
SUPABASE_PROJECT_REF=<ref>
```

`SUPABASE_PROJECT_REF` isn't read by the app — it's kept here only as a convenience reference for
writing `.mcp.json` in Part 2. No `SUPABASE_ACCESS_TOKEN`: the hosted MCP server authenticates via
OAuth, not a token in this file.

The pilot timezone is hardcoded in `src/lib/appDay.ts` (`docs/BUILD.md` §8), not an env var — no
`PILOT_TZ` needed.

---

# Part 1 — YOU: install the plugins

In Claude Code, run `/plugin`, then check what's actually available in your marketplace before
assuming these exist under these exact names:

| Plugin | Why |
|---|---|
| **engineering** | `code-review`, `testing-strategy`, `debug`, `deploy-checklist` |
| **design** | `accessibility-review`, `ux-copy` — the app is copy-driven |
| **qodo** *(optional)* | A second, independent review pass on every diff |

`code-review` and `security-review` are already available to you directly as skills, independent of
any plugin (confirmed in this environment) — don't install a plugin that just duplicates them. Skip
everything else; each installed plugin costs context in every session.

---

# Part 2 — PASTE: configure the workspace

> Read `docs/BUILD.md` in this repo in full before doing anything else — it's the consolidated
> reference for every prompt that follows. Where it's terse, `docs/pilot-implementation-plan.md`
> and `docs/pilot-scope.md` have the fuller rationale.
>
> This step is **configuration only — do not write any application code.**
>
> Create or update these files:
>
> **1. Extend the existing `CLAUDE.md` at the repo root — do not replace it.** Keep everything
> already in it (working-mode/ask policy, coding/architecture/testing/security guidelines, git
> workflow). Add: a pointer to `docs/BUILD.md` as the canonical build reference; a statement that
> the copy strings in BUILD.md §10 are exact and non-negotiable for this build; a condensed summary
> of the design tokens in §11; and any additional "never do this" items from §16 that aren't
> already covered. Stay under roughly 150 lines total — point at `docs/BUILD.md` rather than
> duplicating its schema or acceptance criteria into `CLAUDE.md`.
>
> **2. `.mcp.json`** at the repo root, exactly this — replace `<YOUR REF>` with the real
> `SUPABASE_PROJECT_REF` value from `.env.local` (it's not a secret, safe to commit literally):
> ```json
> {
>   "mcpServers": {
>     "supabase": {
>       "type": "http",
>       "url": "https://mcp.supabase.com/mcp?project_ref=<YOUR REF>&read_only=true&features=database,docs"
>     },
>     "vercel": { "type": "http", "url": "https://mcp.vercel.com" },
>     "playwright": { "type": "stdio", "command": "npx", "args": ["-y", "@playwright/mcp@latest"] }
>   }
> }
> ```
> Both `supabase` and `vercel` are hosted, OAuth-authenticated servers now — no local process, no
> token in this file. `read_only=true` keeps every query the MCP runs against Postgres read-only at
> the database-role level, on top of it being scoped to one project.
>
> **3. `.claude/settings.json`** with a `PostToolUse` hook matching `Write|Edit` that runs
> `npm run typecheck && npm run lint` (`next lint` no longer exists as of Next.js 16 — current
> scaffolds wire `eslint` directly; before `package.json` exists, run the equivalent via `npx tsc
> --noEmit`, deferring real lint until scripts exist). This is a gate, not a suggestion — if it fails, the edit is
> wrong.
>
> **4. `.claude/agents/rls-auditor.md`** — subagent, `tools: Read, Grep, Glob, Bash`, `model: opus`.
> Its job: verify every table has RLS enabled and that each policy matches the intent in
> `docs/BUILD.md` §6. For each policy it must construct the request that would bypass it and state
> whether that request succeeds. Instruct it explicitly: test by calling the API directly as a
> second user — never conclude a policy is safe because the UI hides the button.
>
> **5. `.claude/agents/spec-auditor.md`** — subagent, read-only tools. Its job: read a diff against
> `docs/BUILD.md` and flag anything built that appears in §16 (out of scope), anything that
> contradicts §2 (locked decisions), and any user-facing string that departs from the §10 copy deck.
>
> **6. `.claude/agents/ui-verifier.md`** — subagent with the Playwright MCP tools and `Bash`. Its
> job: drive the running app, screenshot each state, and compare against the acceptance criteria in
> `docs/BUILD.md` §15. It reports what it saw; it does not fix things.
>
> **7. `.claude/rules/supabase.md`** with frontmatter `paths: ["supabase/**", "app/**/actions.ts",
> "lib/supabase/**"]` — RLS is mandatory on every table; never use the secret key (or a legacy
> service_role key) in anything that reaches the browser; every storage URL handed to a client is a
> signed URL.
>
> **8. `.claude/rules/ui.md`** with frontmatter `paths: ["app/**/*.tsx", "components/**"]` — tap
> targets ≥44px, primary controls in the lower half of the screen, no fake status bar, copy comes
> from the `docs/BUILD.md` §10 deck verbatim.
>
> **9. `.gitignore`** — Node/Next defaults plus `.env*.local`, `.claude/settings.local.json`,
> `.claude/worktrees/`, `test-results/`, `playwright-report/`.
>
> **10. `.env.example`** — the same keys as `.env.local` with the values blanked.
>
> When you are done, print a table of every file you created or updated and one line on what each
> does. Then stop.

---

# Part 3 — YOU: restart and confirm

Reload the VS Code window so the MCP servers start. Then run `/mcp` — **playwright** should show
connected immediately (it's local). **supabase** and **vercel** will show as needing
authentication: select each one, choose **Authenticate**, and finish the OAuth flow in the
browser that opens. If Supabase fails after that, the project ref in `.mcp.json` is wrong.

---

# Part 4 — PASTE: schema and policies

> Using `docs/BUILD.md` §5 and §6, create `supabase/schema.sql` and `supabase/policies.sql` exactly
> as specified, including `votes.voted_at`. Do not implement `best_run()` as a SQL function — see
> §5's closing note on why that's computed in app code instead.
>
> Then write `supabase/seed.sql` as a template with four placeholder user IDs, following §14.
>
> Do not run anything against the database — I will paste the SQL into the Supabase editor myself.
> When the files are written, walk me through what each function does in plain language, then use
> the **rls-auditor** agent to review the policies before I run them.

**YOU:** paste `schema.sql` then `policies.sql` into the Supabase SQL editor and run them. Then
Storage → New bucket → `proofs`, **private**, and add the two policies from §6.

**Then verify the grants actually landed, not just the policies.** Supabase auto-grants `EXECUTE`
on every new function to `anon`/`authenticated`/`service_role` regardless of what the SQL's
`revoke`/`grant` lines say — this bit us for real on this exact project (see `HANDOFF.md`/git
history if you want the story). Ask Claude to check with `has_function_privilege()` for every
`SECURITY DEFINER` function, for every client-facing role, against what §6 says each one should
be. Do this again any time a new function gets added later, not just once now.

---

# Part 5 — PASTE: the app skeleton and auth

> Scaffold the Next.js app per `docs/BUILD.md` §3 and §4: App Router, TypeScript, Tailwind,
> `@supabase/ssr` (not the deprecated auth-helpers).
>
> Build only the auth path in this step, per §7: `proxy.ts` (Next.js 16's replacement for
> `middleware.ts` — same job, refreshing the session on every request), `lib/supabase/server.ts`,
> `lib/supabase/client.ts`, `app/login/page.tsx`, `app/auth/callback/route.ts`, and the root layout
> with the fonts and PWA meta from §12. Server authorization defaults to `getClaims()`
> (fast, local JWT verification on every call); use `getUser()` only where you specifically need a
> fresh, server-verified record. Never `getSession()` alone for authorization.
>
> The login screen must match the Sign in artboard: wordmark, the headline "Prove it to the people
> who'd know.", the sub-line, an email field, and a "Send me a link" button. Copy verbatim from §10.
>
> Add `lint`, `typecheck`, `test`, and `build` scripts to `package.json` if `create-next-app` didn't
> already, matching CLAUDE.md's testing standards — the hook uses `npx` directly so it doesn't
> need these, but later verification steps assume `npm run <script>` works.
>
> Use plan mode first — show me the approach before you write files.
>
> When it runs, stop and tell me how to test the magic link locally.

**YOU:** in Supabase → Authentication → URL Configuration, set the Site URL to
`http://localhost:3000` for now and add `http://localhost:3000/**` to redirect URLs. Sign in once.

---

# Part 6 — PASTE: the home screen

> Build `app/page.tsx` and `components/Hero.tsx` per `docs/BUILD.md` §8 and §9 (screen 2).
>
> The server component calls `resolve_stale()` first, then fetches my commitment, current run, best
> run (via `best_run()`), today's proof, and my "Your call" feed with signed photo URLs.
>
> The hero is the dark block from the artboard: eyebrow, the run number at roughly 108px,
> "DAYS IN A ROW" (or "WEEKS IN A ROW" for a floating-schedule habit), the nudge line, a rule, the
> habit name, the corner avatars, the action button. Nudge logic exactly per §10's four states: new
> best, within three of best, run of zero, otherwise "Keep it going."
>
> Tapping the hero's top row routes to `/run`. Tapping the action routes to `/capture`.
>
> Copy comes from §10 verbatim. Tokens from §11. Nothing else goes on this screen.

---

# Part 7 — PASTE: capture and verification

**YOU, first:** Playwright's npm package resolves via `npx` already, but its actual browser
binaries aren't installed on this machine yet. Run `npx playwright install chromium` once before
this step — without it, the Playwright suite below and the `ui-verifier` agent in Part 8 will fail
on first launch, not silently skip.

> Build the rest of the loop, per `docs/BUILD.md` §8, §9, §13:
>
> - `lib/image.ts` — canvas downscale, longest edge 1280, JPEG quality 0.72, under 300KB.
> - `app/capture/page.tsx` — file input with `capture="environment"`, preview, optional note,
>   `Retake` / `Send it`.
> - `app/actions.ts` — `postProof` and `castVote`. `postProof` must **update in place** when a
>   pending proof already exists for today, not insert a second row.
> - `components/ProofCard.tsx` — a peer's pending proof with `Back it` / `Call it`.
> - `app/run/page.tsx` — the history screen, rendering "Backed" and "Cleared — nobody got to it in
>   time" as visibly distinct states (§10).
>
> Then write Playwright tests covering the acceptance criteria in §15 that can be tested without a
> real phone — specifically: one back is not enough, two backs flip it to backed and increment the
> run, two calls flip it to broken, posting twice replaces rather than duplicates, and a non-corner
> member cannot vote (test that one by calling the server action directly, not through the UI).

---

# Part 8 — PASTE: verify before shipping

> Run the full acceptance list in `docs/BUILD.md` §15.
>
> 1. Run the Playwright suite and show me the results.
> 2. Use the **rls-auditor** agent on the final policies.
> 3. Use the **spec-auditor** agent on the whole diff since this branch started.
> 4. Use the **ui-verifier** agent against the running dev server.
>
> Then give me one table: each criterion, verified by test / verified by hand / not verified, and
> what is left. Do not mark anything verified that you did not actually observe.

---

# Part 9 — YOU: deploy

```bash
git add -A
git commit -m "Chalkline v0.1 scaffold"
git push
```

You're already on `feat/v1-mvp` with `origin` set — no new remote needed. Per this repo's own
`CLAUDE.md`, don't merge to `main` yet: open a PR from `feat/v1-mvp` and merge only once the test
run (§15) and a security review of the diff both pass.

Import the repo in Vercel (pointed at `feat/v1-mvp` for a preview deploy, or `main` after merge).
Add the three real env vars — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SECRET_KEY` (**not** `SUPABASE_PROJECT_REF` — that's local-only, for `.mcp.json`). Deploy.

Then in Supabase → Authentication → URL Configuration: set Site URL to the Vercel domain and add
`https://<domain>/auth/callback`.

Send the link to all four people. Each signs in once. Then:

> Here are the four user IDs from `auth.users`: [paste]. Fill in `supabase/seed.sql` with these,
> mapping each person to their habit and two corner members per the seeding constraints in
> `docs/BUILD.md` §14, and show me the SQL to run.

Finally, each person: open the link on their phone → Share → **Add to Home Screen**. Do this in
person the first time — the iOS install path is not discoverable.

**Then time yourself: cold open to proof sent. If it's over ten seconds, that's the first bug.**

---

# Working habits that matter more than the config

- **Plan mode first** on anything non-trivial. Approve the approach, then let it build.
- **One prompt, one concern.** The prompts above are deliberately separated; resist merging them.
- **`/clear` between phases.** A fresh context for the capture flow beats a context full of auth.
- **Never accept "done" without a run.** The hook catches type errors; only you catch "it looks
  right but the camera doesn't open."
- **Commit at every green checkpoint**, so `git diff` stays a useful unit of review.

## When it goes wrong

| Symptom | Cause |
|---|---|
| Supabase MCP won't connect | Project ref wrong in `.mcp.json`, or OAuth session expired — re-run `/mcp` and re-authenticate |
| The hook fails on every edit | Dependencies not installed yet — run `npm install` once first |
| Magic link redirects to a 404 | Redirect URL not added in Supabase Auth settings |
| Photos load in dev, break in prod | Raw storage path used instead of a signed URL |
| Streak off by a day | Something reimplemented the day-boundary math instead of importing `appDay.ts` |
| It builds things you didn't ask for | Point it at `docs/BUILD.md` §16 and run the spec-auditor agent |
| A `SECURITY DEFINER` function is callable by a role it shouldn't be | Supabase's default ACL grants `EXECUTE` to `anon`/`authenticated`/`service_role` on every new function, regardless of what the SQL says — revoke explicitly by role and verify with `has_function_privilege()` |
| Playwright test/agent fails on first run, not before | Browser binaries aren't installed — `npx playwright install chromium` |

## Do not

- Give the Supabase MCP write access, or point it at anything but the pilot project.
- Put `SUPABASE_SECRET_KEY` (or a legacy `SUPABASE_SERVICE_ROLE_KEY`) in any variable starting
  `NEXT_PUBLIC_`.
- Build the setup screen, the ledger, money, notifications, or a leaderboard. They are out of scope
  and every one of them was cut deliberately.
