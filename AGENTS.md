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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
