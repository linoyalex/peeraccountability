# PM Review — Chalkline Implementation Plan vs. Original Spec

**Date:** 2026-09-14
**Reviewer persona:** Senior product manager
**Reviewed:** `docs/implementation-plan.md` cross-referenced against `docs/Chalkline-walkthrough.pdf` (source spec)
**Scope:** Usability, scope, and pilot-goal validity — not tech stack, data model, or build sequence, except where a decision there creates a usability/scope risk.

**Question being answered:** Will this plan, as written, produce a valid, useful signal about the core hypothesis — that fixed peer witnesses ("Back it"/"Call it") meaningfully improve habit adherence — without app friction contaminating that signal?

Findings are ordered by risk to pilot validity, most severe first.

---

## Findings

### 1. The spec's core bet — in-person overlap with witnesses — isn't a confirmed input for this pilot
- **Targets:** Spec p.1 ("Two people from the gym you actually attend... They will see you on Tuesday either way") vs. plan's §Confirmed decisions, which just says "a squad of ~4 people."
- **How it shows up:** The entire differentiation from StickK/Forfeit rests on witnesses having real-world overlap with the subject. If the actual 4 recruited people are app-only contacts rather than people who see each other regularly, the pilot tests a materially weaker hypothesis than the one the spec argues for — a null result wouldn't tell you "peer accountability doesn't work," it'd tell you "peer accountability without social overlap doesn't work," which the spec already predicted.
- **Recommendation:** Zero-cost, no build impact — when recruiting the squad (spec p.7-8, "What I need from you"), explicitly confirm the corner pairs have regular in-person contact with their subject. If that can't be arranged for all 4, say so up front in how week-4 results get interpreted.

### 2. `votes` has no per-vote timestamp — the spec's own named "early warning" signal can't be measured
- **Targets:** §Data model, `votes` table (`proof_id`, `voter_id`, `vote`, no timestamp listed) vs. spec p.6, "Do the watchers stay watching? Nobody measures this and it is what kills these products. Response times drifting later, week over week, is the early warning."
- **How it shows up:** At week 4 you'll be able to say a proof got 2 votes or auto-cleared, but not whether a witness's response time went from 20 minutes in week 1 to 30 hours in week 4. The exact signal the spec ranks as the make-or-break early indicator is invisible in this schema.
- **Recommendation:** Add `voted_at timestamptz default now()` to `votes` in `0001_init.sql`. One line, no shape change, no new screen — the only way this metric exists at all.

### 3. No stated success threshold for the pilot itself
- **Targets:** Whole plan — §Verification only checks build correctness (tests pass, manual QA), never defines what a successful *pilot* looks like.
- **How it shows up:** At week 4, "70% of days resolved by real votes, average response time 4 hours" is uninterpretable without a bar set in advance — risk of post-hoc rationalization in either direction.
- **Recommendation:** No code needed — before day 1, write down 2-3 numeric thresholds using the spec's own four questions (p.5-7) as the frame, e.g. "≥80% of days resolved by vote, not no_response, by week 4," "no witness's median response time triples week-1 to week-4," "≥2 of 3 non-founder users still posting daily in week 4."

### 4. Fixed 2-witness pairs have no slack — the spec's own stated reason for needing 4 people (not 3) isn't backed by the data model
- **Targets:** Spec p.8, "Four gives everyone three possible backers and slack for holidays" vs. plan's §Data model `corner_members` (hand-seeded, fixed pairs) and §Confirmed decisions ("two fixed corner witnesses").
- **How it shows up:** Over a real 4 weeks, one of two fixed witnesses going on a trip or getting busy for a few days is likely, not an edge case. During that stretch the quorum rule is effectively down to one active witness — which the spec explicitly says "is just StickK" — and nothing in the data distinguishes "the mechanic failed" from "one witness was unreachable for a week."
- **Recommendation:** No rotation feature needed. At seed time, pick pairs from people not expecting travel during the exact 4-week window (zero-cost coordination step). The addition in #2 also lets you cross-reference which voter is dragging a proof toward `no_response`.

### 5. No-notification design assumes a witness has their own reason to open the app daily — their rest days break that assumption
- **Targets:** Spec p.2 ("no inbox, no badge, nothing to remember to visit — the whole reason I think peer verification can actually work here") vs. plan §Key mechanics point 5 ("No realtime/push... per spec") and §Confirmed decisions (three schedule types, including rest days).
- **How it shows up:** The spec's bet piggybacks review-checking on the witness opening the app for their *own* habit. On a witness's own rest day (or a fixed-weekday/floating day they're not due), there's no pull bringing them into the app at all — only "Your call" would, and there's no reason to check that if there's no other reason to open the app. This concentrates slow/missed votes on exactly the days the design didn't account for, contaminating the "do watchers stay watching" signal with app-friction rather than genuine disengagement.
- **Recommendation:** This is a deliberate, already-reasoned bet in the spec, so don't add notifications. Cheapest mitigation: nothing code-side is needed for v1 — just flag it as a known confound in the pilot write-up, and if #2/#4's data shows response-time drift concentrated on specific weekdays, that's evidence of which cause it is.

### 6. Squad recruiting/seeding isn't sequenced to start on day 0
- **Targets:** §Before you seed ("needed to run `scripts/seed-squad.ts` in step 2, not needed to start building") vs. spec p.7-8's "five things, and then I build it" — a coordination task involving 3 other real humans (commit to 4 weeks, pick a photographable habit, confirm pairing), not a solo dev task.
- **How it shows up:** If code is ready in ~1 week but recruiting/habit-picking slips even a few days, the pilot start silently drifts and effective test time shrinks.
- **Recommendation:** No code change — start the "five things" ask (spec p.7-8) in parallel with build step 1 (scaffold), not after schema/auth, so seeding-readiness and code-readiness land the same day.

### 7. "Cleared, nobody responded" isn't visually distinguished from "actually backed" — masks the pilot's own honesty signal from the user
- **Targets:** §Verification edge cases vs. spec p.4 rules table ("we count those [no-response] tags — they are the honest measure of whether this works") and p.3 ("Backed. It names them... Never an anonymous tick").
- **How it shows up:** If a subject's streak continues via 36h auto-clear, and the Home/History card doesn't say anything different from a real 2-vote back, the subject reads it as "my mates backed me" when actually nobody looked — undermining their own incentive to chase real votes, and hiding from the user (not just from the analysis) how often the safety net is carrying the mechanic.
- **Recommendation:** Copy-only, no new mechanic: on History/Home, differentiate "Backed by [names]" from a softer "Cleared — nobody got to it in time," matching the spec's existing honest, non-scolding tone.

### 8. Camera-flow interruption — tolerable, not a blocker
- **Targets:** Spec p.2 ("Thirty seconds after a session, sweaty, one hand") vs. plan §Build sequence step 4 (single-component state machine, "a captured photo can't survive a route transition unuploaded").
- **How it shows up:** A call or backgrounding mid-capture loses the shot and forces a reshoot — mildly annoying in a sweaty, one-take context, but no data is corrupted (nothing commits until send completes) and it doesn't cost a day.
- **Recommendation:** None needed for v1; already handled about as well as a 1-week build should.

---

## Verdict: Conditional go

The plan is sound enough to build against — most of the confirmed decisions correctly match what the spec deliberately cut. But as written, it can silently produce a result that can't be fully trusted, because the spec names a specific make-or-break signal ("do the watchers stay watching," tracked via response-time drift) that the current schema cannot compute at all.

**Highest-leverage single change:** add `voted_at` to `votes` (finding #2). It's one line, changes nothing about scope or UX, and is the only thing standing between building this and being able to answer the exact question the spec's author flagged as the one nobody else measures. Pair it with the zero-cost check in finding #1 (confirm in-person overlap with the actual squad) before seeding — that one's free and closes the biggest hypothesis-validity gap without touching the build at all.
