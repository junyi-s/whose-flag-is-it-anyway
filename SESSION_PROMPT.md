# Session Prompt — Connections, Exit/Leave & Scoring

Paste the block below into a fresh Claude Code session to start this work.
Full detail lives in `IMPROVEMENT_PLAN_V2.md`.

---

```
We're improving "Whose Flag Is It Anyway?" — a Jackbox-style party game.
Monorepo: apps/server (Node + Express + socket.io, in-memory rooms),
apps/web (React + Vite + zustand + react-router), packages/shared (types,
events, Zod schemas, pure scoring). Server deploys to Railway; web to Vercel.

Read IMPROVEMENT_PLAN_V2.md first — it has the grounded current-state notes,
problems, and approach for all three phases. Then work through them in order.

There is an UNCOMMITTED hotfix in the working tree (apps/web/src/App.tsx and
apps/web/src/routes/Home.tsx) that fixes the immediate rejoin race and the
double-socket connect. Review that diff before touching Phase A — Phase A's job
is to formalize and harden it, not redo it.

PHASE A — Connection & rejoin correctness (do first):
- Lock in single connect ownership (App.tsx only).
- Add server-side per-playerId socket dedup: on room:rejoin, disconnect stale
  sockets for the same playerId.
- Make handleDisconnect reconnection-aware: before marking a player offline,
  check io.in(playerId).fetchSockets() — if another live socket exists for that
  player, return early (fixes multi-tab false-disconnect + host churn).
- A.5 — HOST REFRESH FIX (high priority): today a host refreshing their browser
  permanently hands host to someone else, because the old socket dies before the
  new one connects (no overlapping socket, so the dedup check above doesn't help).
  Fix: don't migrate host synchronously on disconnect — schedule a deferred
  migration (~15–20s grace) on the room and CANCEL it if the same playerId
  rejoins. Only migrate if the host is still gone when it fires. Keep explicit
  leave/close immediate (no grace).
- Add socket.io-client integration tests for: same-player two sockets (closing
  one keeps player online), rejoin after disconnect, buffered-emit ordering, and
  host-refresh (rejoin within grace keeps hostId; past grace migrates once).

PHASE B — Exit, leave & end-game (two distinct host actions):
- game:end (host-only) → FINAL_RESULTS, for PLAYING/GENERATING where scores
  exist. Clear voting timer, broadcast, emit game:ended. Confirm-gated "End Game"
  button in Game.tsx.
- room:close (host-only) → CLOSED + destroy, for LOBBY and SUBMITTING (the
  red-flag entry screen) where a zeroed FINAL_RESULTS would be nonsense. Use the
  existing-but-unused CLOSED GameStatus. Broadcast a final closed signal; clients
  clear persisted identity and route home with a "Host closed the room" notice;
  delete the room immediately. Host-only "Close Room" button on SubmitFlags.tsx
  AND the LOBBY screen, confirm-gated. THIS is the "exit/close during red-flag
  entry" the user asked for.
- Phase-aware leave: in LOBBY and SUBMITTING, room:leave REMOVES the player
  entirely (free slot + name, drop their authored flags, migrate host
  immediately if needed, GC if empty) via a new GameRoom.removePlayer(); in
  PLAYING, keep current mark-offline behavior. Add a per-player "Leave" button to
  SubmitFlags.tsx too.
- Tests: game:end from PLAYING → everyone on FINAL_RESULTS; room:close from
  SUBMITTING → room deleted + clients routed home; non-host rejected for both;
  LOBBY/SUBMITTING leave frees the name and drops the leaver's flags; ended
  round's timer doesn't fire after.

PHASE C — Scoring re-evaluation (DESIGN DECISIONS NEEDED — ASK ME FIRST):
The current model (packages/shared/src/scoring.ts) has issues: "fooled" rewards
the misattributed player rather than the deceiver; rare/stealth bonuses are
hardcoded constants while correct/fooled points are in GameSettings; self-flags
and assigned/call-out flags score identically; and the client RE-COMPUTES
scoring in RoundResults.tsx instead of using server truth (divergence risk).

Before writing any scoring code, ask me to decide D1–D6 in IMPROVEMENT_PLAN_V2.md
(who "fooled" rewards, whether bonuses become tunable, self-vs-assigned scoring,
wrong-vote penalties, score scale, leave-state UI). Then:
- Consolidate scoring knobs into settings (defaults in constants, bounds in
  schemas), rewrite computeRoundScoring as the single shared source of truth, and
  send the authoritative `breakdown` in the round:revealed payload so the client
  stops recomputing. Table-driven unit tests for every reason + flag type.

Constraints: keep the wire protocol changes additive where possible; redaction
(redactGameFor) must stay correct — never leak subjectId/authorId before REVEAL.
Run the existing server test suite (pnpm --filter @whose-flag/server test) after
each phase. Don't commit, push, or redeploy unless I ask.
```

---

### Notes for the operator (not part of the prompt)
- The uncommitted hotfix referenced above is real — `git diff` shows it on
  `App.tsx` (rejoin gated on `connect`, store-code guard) and `Home.tsx`
  (removed redundant `socket.connect()` calls). Decide whether to commit it
  before or as part of Phase A.
- Server was last redeployed via `railway redeploy` on 2026-05-31 (fresh
  in-memory state).
- Phase C is deliberately blocked on your decisions — the plan lists them as
  D1–D6 so you can answer them in one pass.
