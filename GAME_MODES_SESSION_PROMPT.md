# Session Prompt — Game Modes, Scoring Rewrite & Presenter Host

Paste the block below into a fresh Claude Code session to start the next body of
work. It is self-contained; the authoritative spec is `GAME_MODES_PLAN.md`.

---

```
You are implementing the next milestone of "Whose Flag Is It Anyway?" — a
Jackbox-style party game. Monorepo: apps/server (Node + Express + socket.io,
in-memory rooms), apps/web (React + Vite + zustand + react-router), packages/
shared (types, events, Zod schemas, pure scoring + redaction). Server deploys to
Railway, web to Vercel.

PRIMARY SPEC — read it fully before writing any code:
  GAME_MODES_PLAN.md
It defines, on top of a shared foundation:
  1. A scoring rewrite (locked decisions: correct = core/highest, rare kept,
     fooling rewards the flag AUTHOR and is < correct, self-flag stealth vs
     call-out author-fooling distinguished, bonuses become tunable settings, and
     the per-misattributed-player award is DELETED).
  2. A second game mode — "Quickdraw" (speed/ordering): first correct guess scores
     most, points step down the order, and changing/re-selecting a vote sends you
     to the back of the line. No clocks — server arrival order is the ranking.
  3. A presenter / shared-screen host role — a non-competing controller
     (isHost && spectator) that runs the game, never votes, isn't a subject, and
     isn't counted toward MIN_PLAYERS.
  4. Auto-advance presentation — optional kiosk flow (REVEAL→SCOREBOARD dwell
     ~10s each, skippable), honored server-side via a unified round-bound phase
     timer.

SUPPORTING CONTEXT:
  IMPROVEMENT_PLAN_V2.md — background for the host-migration grace (A.5) and the
  round-bound timer pattern this plan generalizes. The A/B work it describes
  (rejoin/host-migration hardening, room:close, capability-aware disconnect) is
  ALREADY COMMITTED locally on main (origin/main is behind by 3 commits — do not
  push or deploy).

KEY FILES YOU WILL TOUCH:
  packages/shared/src/{scoring.ts,types.ts,events.ts,schemas.ts,constants.ts,redact.ts}
  apps/server/src/socket/handlers.ts
  apps/server/src/game/{GameRoom.ts,GameEngine.ts}
  apps/server/src/config.ts
  apps/web/src/components/{RoundResults.tsx,VotingPanel.tsx}
  apps/web/src/routes/{Lobby.tsx,Game.tsx,SubmitFlags.tsx,Home.tsx}
  apps/web/src/stores/gameStore.ts
  apps/server/src/__tests__/socket.integration.test.ts
  apps/server/src/__tests__/GameEngine.test.ts  (+ a scoring unit test file)

FIRST ACTION — create the todo list:
  Use TaskCreate to turn GAME_MODES_PLAN.md's Phase 1→7 into tracked tasks (one
  per phase, with the acceptance criteria as sub-bullets). Mark each in_progress
  when you start it and completed when its acceptance criteria + test gates pass.
  Keep the list current as you go.

THEN EXECUTE, phase by phase, in order (1 is load-bearing — do not skip ahead):
  Phase 1 scoring foundation / single source of truth → 2 classic rewrite →
  3 speed server → 4 presenter & capability model → 5 phase timer + auto-advance →
  6 client UX → 7 docs.

WORKING AGREEMENT:
  - Follow the plan's Design Principles: one source of truth for scoring (server
    computes, client renders the breakdown — no client recompute); capabilities
    not special-cases (use a `competitors(game)` selector, never branch on names
    or indices); server owns state & timing (round-bound timers, stale-timer
    guard); additive protocol changes; redaction stays correct (never leak
    subjectId/authorId/votes or new server-only fields like voteOrder before
    REVEAL).
  - For anything ambiguous, follow the chosen DEFAULT in the plan's "Open
    decisions" table (M1–M8) — do not invent a new path or stop to ask.
  - After EACH phase, all of these must be green before moving on:
        pnpm --filter @whose-flag/shared build
        pnpm --filter @whose-flag/server build
        pnpm --filter @whose-flag/server test
        pnpm --filter @whose-flag/web build
  - Commit after each phase with a conventional message (feat:/refactor:/test:/
    docs:) ending with the line:
        Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
    DO NOT push and DO NOT deploy to prod under any circumstances — local commits
    only. Stay on main (it already carries unpushed local commits).
  - Prefer extending existing abstractions (the round-bound timer, redactGameFor,
    GameSettings/schemas) over adding parallel ones.

AUTONOMY:
  Work continuously and autonomously — do not pause for approval between phases or
  sub-tasks. Keep going until you have either completed Phase 7 or exhausted your
  token budget. Only stop early if you hit a genuine blocker not covered by the
  plan or its defaults; if so, make the most reasonable call per the Design
  Principles, leave a clear note in the relevant task, and continue. When you do
  stop (done or out of budget), end with a concise summary: phases completed,
  tests/build status, commits made, and the exact next step to resume.
```
