# AGENTS.md

This file exists so Codex (which auto-loads `AGENTS.md`, not `CLAUDE.md`) gets the same starting
context a Claude Code session already gets automatically. Don't duplicate rules here — duplicated
instructions drift when one copy gets edited and the other doesn't. Read the real sources instead:

1. **`CLAUDE.md`** — working-mode, coding, architecture, testing, and security rules for this
   repo. Read this first. Its rules apply regardless of which agent or tool is reading them.
2. **`HANDOFF.md`** — current build status: what's actually done, what's next, and anything
   environment/session-specific a fresh agent wouldn't otherwise know (uncommitted local state,
   per-machine setup steps, deliberate deviations from the plan). Overwritten, not versioned —
   always reflects the current state, not a historical snapshot.
3. **`docs/BUILD.md`** — the canonical, numbered build/spec reference (§1–§16). What build
   prompts and this project's own docs cite by section number.

If you're picking up work in this repo, read those three, in that order, before doing anything
else.

## What you don't automatically get, that Claude Code sessions did

These are Claude-Code-specific mechanisms with no Codex equivalent — the guidance behind each is
still written down in plain text above, just not automated for you the same way. Apply it by hand:

- **No typecheck/lint gate runs automatically after your edits.** `.claude/settings.json` wires
  `npm run typecheck && npm run lint` after every write in Claude Code; here, run those yourself
  before considering anything done.
- **No `rls-auditor`/`spec-auditor`/`ui-verifier` subagents.** `.claude/agents/*.md` describes what
  each one checks — before touching `supabase/**`, RLS, or `SECURITY DEFINER` functions, read
  `.claude/agents/rls-auditor.md` and do that same bypass-attempt exercise yourself. Same idea for
  the other two before merging or shipping.
- **No path-scoped rules auto-load.** `.claude/rules/supabase.md` and `.claude/rules/ui.md` have
  real, specific constraints (RLS mandatory, no secret key in the browser, tap targets ≥44px, copy
  verbatim from `docs/BUILD.md` §10) — read them directly when working in those paths.
- **No MCP servers.** `.mcp.json` configures hosted, read-only Supabase/Vercel access plus
  Playwright for Claude Code specifically; it won't carry over. If you need to inspect the live
  database, use the Supabase dashboard/CLI directly — and if you ever gain write access to it by
  any means, the same rule applies as in `CLAUDE.md`: schema changes need the user's explicit
  buy-in before they're applied to the real project, drafting locally is fine.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
