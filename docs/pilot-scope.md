# Chalkline v1 — Pilot Scope Update

## Context

This document defines a set of additions to the pilot scope described in `implementation-plan.md`, raised by a PM review (`reviews/PM/2026-09-14-peeraccountability-pm-review.md`) that checked the plan against the original spec (`Chalkline-walkthrough.pdf`) for pilot-goal validity, usability, and scope fit — not technical correctness.

The review's premise: the plan is sound, but a few gaps could make the 4-week pilot's result ambiguous — unable to tell "peer accountability doesn't work" apart from "the pilot had a measurement gap" or "the pilot's setup didn't match the spec's own bet." Each item below closes one such gap. Nothing here reopens anything the spec deliberately cut (PDF p.5) — see §Unchanged.

This document is meant to be folded into `implementation-plan.md`; it is not a replacement for it.

## A. Functionality additions (touch the build)

### A1 — Add `voted_at` to `votes`

- **Change:** `votes.voted_at timestamptz not null default now()`.
- **Why:** The spec names a specific pilot signal — "Do the watchers stay watching? ... Response times drifting later, week over week, is the early warning" (PDF p.6) — that the current schema cannot compute. `proofs.resolved_at` tells you when a proof closed, not each witness's individual response latency.
- **Scope guard:** one column, no new screen, no new mechanic. Written via `cast_vote()` same as today.
- **Plan section affected:** §Data model.

### A2 — Distinguish "Backed by [names]" from "Cleared — no response" as separate visible states

- **Change:** Home's "Your call"-resolved state and the History list must render two distinct copy/visual treatments for `resolution = 'votes'` vs `resolution = 'no_response'`, instead of collapsing both into one "backed-looking" card.
- **Why:** The spec treats a no-response auto-clear as meaningfully different from a real back — "we count those tags — they are the honest measure of whether this works" (PDF p.4) — and treats naming real backers as core to the mechanic ("It names them... Never an anonymous tick," PDF p.3). If both render identically, the subject can't tell the safety net from real peer engagement, and neither can anyone reading the pilot data by eye.
- **Scope guard:** copy/UI only. `proofs.resolution` already distinguishes the two cases; this is a rendering change, not new logic.
- **Plan section affected:** §Key mechanics (screens), §Verification (add this to the manual edge-case checklist).

## B. Plan/process additions (no code impact)

### B1 — Pilot success criteria

Add a definition of a successful pilot, framed on the spec's own four questions (PDF p.5-7), with numeric thresholds fixed *before* day one:

- ≥80% of days resolved by real vote (`resolution = 'votes'`), not auto-clear, by week 4.
- No corner member's median vote response time (enabled by A1) more than triples between week 1 and week 4.
- At least 2 of the 3 non-founder participants are still posting daily in week 4.

These are proposed starting numbers — confirm or adjust before the pilot starts, since the point is having *any* pre-committed bar, not these specific ones.

**Plan section affected:** new subsection under §Verification, or a standalone section — "Pilot success criteria."

### B2 — Seeding constraints

Add to the requirements for choosing corner pairs during hand-seeding:

- Each witness should have regular in-person contact with their subject — the spec's actual differentiator from StickK/Forfeit is "they will see you on Tuesday either way" (PDF p.1), not just being reachable by app.
- Avoid pairing a subject with two witnesses who both have known travel/unavailability inside the 4-week window — the spec's own reason for recruiting 4 people instead of 3 is "slack for holidays" (PDF p.8), but the fixed 2-witness pairing in the data model doesn't provide that slack on its own; it has to come from who gets paired with whom.

**Plan section affected:** §Before you seed.

### B3 — Sequencing change

Start the squad-recruiting ask (the spec's "five things," PDF p.7-8: commit to 4 weeks, recruit to 4 people, confirm the name, confirm the city/timezone, confirm each person's habit) **in parallel with Build step 1 (scaffold)**, not after schema/auth is done. Recruiting three other humans is not a solo-dev task and shouldn't become the critical path after the code is otherwise ready.

**Plan section affected:** §Build sequence (step 1) and §Before you seed.

### B4 — Known-confound note for interpreting results

Document, as an explicit caveat for reading the pilot's outcome, that the no-notification design (PDF p.2 — a deliberate bet, not an oversight) assumes a witness has their own daily reason to open the app. On a witness's own rest day (or an off-day under a fixed-weekday/floating schedule), no such pull exists — only the "Your call" section would, and there's no other reason to check it. Slow or missed votes concentrated on a witness's own off-days are evidence of this gap, not necessarily of disengagement with the mechanic itself.

**Plan section affected:** §Verification or a closing "Known limitations" note.

## Unchanged — explicitly still out of scope

Everything the spec deliberately cut (PDF p.5) stays cut for this pilot: money & stakes, ledger, settling up, gym leaderboard, notifications, multiple habits, text-only proof, badges & points, setup screen, dispute flow, tab bar, stats. None of the review findings argued any of these are load-bearing for testing the core hypothesis — if anything, B4 reinforces the spec's own reasoning for leaving notifications out.

Camera capture flow, RLS/security posture, the three schedule types, the 36h auto-clear + backstop, and build sequence steps 2-8 are unaffected by this update.

## Traceability

| Item | Spec reference | PM review finding |
|---|---|---|
| A1 — `voted_at` | PDF p.6 | #2 |
| A2 — resolution-state UI | PDF p.3-4 | #7 |
| B1 — success criteria | PDF p.5-7 | #3 |
| B2 — seeding constraints | PDF p.1, p.8 | #1, #4 |
| B3 — sequencing | PDF p.7-8 | #6 |
| B4 — known-confound note | PDF p.2 | #5 |

## Next step

Fold A1/A2 into `implementation-plan.md`'s §Data model and §Key mechanics, and B1-B4 into §Before you seed, §Build sequence, and §Verification, once confirmed.
