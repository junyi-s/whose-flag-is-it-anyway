# Improvement Plan V2 — Connections, Exit/Leave, and Scoring

Follow-on to `IMPROVEMENT_PLAN.md` (Phases 0–4, largely shipped: redaction,
host migration, voting-timer binding, proxy/IP caps). This round targets three
themes surfaced during the 2026-05-31 smoke test and play-through:

1. **Connection & rejoin correctness** — the double-socket / rejoin race.
2. **Exit & end-game flows** — leaving cleanly, and the host ending a game in
   progress.
3. **Scoring re-evaluation** — the points model is partly incoherent and the
   knobs live in two different places.

Effort key: **S** ≈ <1h · **M** ≈ half-day · **L** ≈ 1–2 days.

> **Status note:** A hotfix for the rejoin race (A.1) and the double-`connect`
> (A.2 frontend half) already landed in the working tree on `apps/web/src/App.tsx`
> and `apps/web/src/routes/Home.tsx` but is **not yet committed or deployed**.
> Phase A formalizes and hardens it; start by reviewing that diff.

---

## Phase A — Connection & rejoin correctness (M)

### Current behavior (grounded)
- `apps/web/src/lib/socket.ts` exports one module-level socket with
  `autoConnect: false`.
- `App.tsx` (mount) connects and fires `room:rejoin` if a persisted identity
  exists in `localStorage` (`wfia_identity`: `{ playerId, code, secret }`).
- `Home.tsx` `handleCreate` / `handleJoin` *also* called `socket.connect()` and
  emitted `room:create` / `room:join`.
- Server `socket/handlers.ts`: each of create/join/rejoin does
  `socket.join(code)` + `socket.join(playerId)` and stamps
  `socket.data.{roomCode, playerId}`. `handleDisconnect` marks the player
  disconnected, migrates host, and schedules room GC if everyone is gone.

### Problems
1. **Buffered-emit race (A.1).** With `autoConnect: false`, emitting before the
   socket connects buffers the event. `App.tsx` buffered `room:rejoin` at mount,
   so it always reached the server *before* a user's `room:join`, navigating the
   user back into a stale room. **Hotfix applied:** only emit `room:rejoin` after
   the `connect` event (`socket.once('connect', …)`), plus a guard that ignores
   the rejoin ack if the store already holds a different room.
2. **Double connect (A.2).** Two `socket.connect()` callers (App + Home) plus
   React StrictMode's double-mount produced the "two `Socket connected` events,
   one orphan" symptom in `SMOKE_TEST_FINDINGS.md`. **Hotfix applied** on the
   frontend (Home no longer connects). Still need server-side resilience.
3. **No per-`playerId` socket dedup (A.3).** Nothing reconciles multiple live
   sockets for the same `playerId`. Open two tabs (or reconnect before the old
   socket times out) and **both** sockets sit in the `playerId` room. When
   *either* disconnects, `handleDisconnect` marks the player offline and may
   transfer host away — even though the player is still present in the other tab.
   This is a real correctness bug, not just orphan-count noise.
4. **Rejoin doesn't rebind identity on the live socket cleanly.** `room:rejoin`
   sets `socket.data` on the *new* socket but the *old* socket keeps its
   `socket.data`, so its eventual `disconnect` still runs `handleDisconnect` for
   that player.
5. **Host refresh permanently loses host (A.5).** When the host refreshes their
   browser, the old socket fully disconnects *before* the new one connects, so
   there is **no overlapping socket** — the A.3/A.4 "any other live socket?"
   check does not help here. `handleDisconnect` immediately migrates host to the
   longest-connected other player; the host then rejoins but host is **not taken
   back** (by design today). Net effect: a simple page refresh by the host hands
   the game to someone else every time. This is the most visible bug from play
   sessions.

### Approach
- **A.1 — harden the client ordering.** Keep the `socket.once('connect', …)`
  rejoin. Add a tiny connection-state guard in the store (`connectionStatus:
  'idle' | 'connecting' | 'connected'`) so create/join/rejoin all funnel through
  one place and never double-fire. Confirm StrictMode double-invoke is idempotent
  (the `once` + cleanup `off` already covers this; verify).
- **A.2 — single connect owner.** `App.tsx` is the only place that calls
  `socket.connect()`. Create/join/rejoin assume an open (or opening) socket and
  rely on socket.io buffering. (Frontend hotfix already does this — lock it in
  with a comment + a lint guard against `socket.connect()` outside `App.tsx`.)
- **A.3 — server-side identity dedup.** On `room:rejoin` (and ideally on a new
  `room:resume`), look up any existing socket(s) already bound to that
  `playerId` and disconnect the stale one(s) before binding the new socket:
  - Track `playerId -> Set<socketId>` (or use socket.io rooms:
    `io.in(playerId).fetchSockets()`).
  - On rejoin, for each existing socket where `s.id !== socket.id`, call
    `s.disconnect(true)` *after* transferring nothing (it's the same player) and
    **suppress** that socket's `handleDisconnect` side effects (guard:
    if a newer socket for the same `playerId` is already connected, the
    disconnecting socket should not mark the player offline or migrate host).
  - Implement the guard as: in `handleDisconnect`, before
    `setConnected(playerId, false)`, check `io.in(playerId).fetchSockets()` —
    if any *other* socket remains, return early (player still present).
- **A.4 — make `handleDisconnect` reconnection-aware.** Replace the immediate
  offline-mark with the "any other live socket?" check above. This single change
  fixes both the multi-tab false-disconnect and the orphan-socket host churn.
- **A.5 — preserve host across a refresh (grace-period migration).** Do **not**
  migrate host synchronously inside `handleDisconnect`. Instead, when the host's
  last socket drops, schedule a deferred migration on the room
  (`hostMigrationTimer`, e.g. **15–20s**, configurable). On `room:rejoin` by that
  same `playerId`, cancel the pending timer and keep them as host. Only if the
  timer fires (host still gone) do we migrate to the longest-connected
  `isConnected` player. This mirrors the existing 60s room-GC grace and makes a
  refresh a no-op for host status.
  - Files: `GameRoom.ts` (timer handle + `scheduleHostMigration` /
    `cancelHostMigration`), `handlers.ts` (`handleDisconnect`, `room:rejoin`).
  - Keep an explicit-leave path immediate (a host who *clicks leave* should
    migrate now, not after the grace window) — distinguish passive disconnect
    from intentional `room:leave` / `room:close`.
  - Edge case: if a non-host advances the game while migration is pending, that's
    fine — but host-only actions stay blocked until the timer resolves or the
    host returns. Acceptable for a 15–20s window; document it.

### Tests (gate)
- Integration (`socket.io-client`): two clients as the same `playerId`; closing
  one leaves the player `isConnected: true` and host unchanged.
- Rejoin after a real disconnect re-binds and re-emits a correct redacted view.
- Buffered-order: a client that emits `room:join` immediately after construction
  (before `connect`) lands in the joined room, not a stale persisted one.
- **Host refresh:** host disconnects then rejoins within the grace window →
  `hostId` is unchanged and the migration timer was cancelled. Host stays gone
  past the window → host migrates exactly once.

---

## Phase B — Exit, leave & end-game (M)

### Current behavior (grounded)
- `room:leave` → `handleDisconnect` → marks the player **disconnected but keeps
  them in `players`/`scores`**; name stays taken; they remain on the scoreboard.
- There is **no** host-driven "end this game now." `round:next` only reaches
  `FINAL_RESULTS` by exhausting all rounds.
- `game:ended` event exists and is emitted only from `round:next` at the end.

### Problems
1. **No graceful mid-game exit for a player.** Leaving during LOBBY should free
   the slot + name; leaving mid-game should preserve scores but visibly mark the
   player gone (and not block host-only advancement if the leaver was host).
2. **Host can't end a game early.** If players bail or the room wants to stop,
   the host is stuck advancing round-by-round. `SMOKE_TEST_FINDINGS.md` already
   specs `game:end`.
3. **Host migration + leave interplay.** `room:leave` migrates host via
   `handleDisconnect`, but an explicit leave should arguably *remove* the player,
   not just mark them offline (especially in LOBBY).

### Approach

Two distinct host actions — they mean different things and apply in different
phases:

- **B.1 — `game:end` (host-only) → FINAL_RESULTS.** For when scores already
  exist and the host wants to stop and crown a winner. New event, no payload.
  - `shared/events.ts`: add `'game:end'` to `ClientToServerEvents`.
  - `handlers.ts`: validate host + status ∈ {`GENERATING`, `PLAYING`};
    `room.clearVotingTimer()`; set `status = 'FINAL_RESULTS'`;
    `broadcastGameUpdate`; emit `game:ended` with current `scores`.
  - Frontend: host-only "End Game" button during active play, behind a
    confirm dialog. Lives in `Game.tsx` host controls.

- **B.1b — `room:close` (host-only) → CLOSED / destroy.** For aborting a room
  with no meaningful scores — primarily the **LOBBY and SUBMITTING (red-flag
  entry) screens**, where sending everyone to a zeroed FINAL_RESULTS would be
  nonsense. This is the "exit/close the room during red-flag entry" affordance.
  - `shared/types.ts` already defines a `CLOSED` `GameStatus` (currently unused) —
    use it.
  - `shared/events.ts`: add `'room:close'` to `ClientToServerEvents` (no payload).
  - `handlers.ts`: validate host; `room.clearVotingTimer()` +
    `clearHostMigration()`; set `status = 'CLOSED'`; broadcast one final
    `game:updated` (or a dedicated `room:closed` event) so every client knows it
    was intentional; then `roomManager.delete(code)` immediately (don't wait for
    GC).
  - Frontend: on seeing `CLOSED` (or `room:closed`), every client clears its
    persisted identity (`usePersistedIdentity().clear()`) and navigates to `/`
    with a small "Host closed the room" notice. Otherwise the stale identity
    would try to rejoin a dead room on next load.
  - Host-only **"Close Room"** button on `SubmitFlags.tsx` (and the LOBBY screen),
    behind a confirm dialog.

- **B.1c — exit affordance on the red-flag entry screen.** Add a per-player
  **"Leave"** button to `SubmitFlags.tsx` for non-hosts (and hosts who want to
  bail rather than close) that emits `room:leave`. Pairs with the phase-aware
  leave semantics in B.2.
- **B.2 — leave semantics by phase.** Split `room:leave` from passive disconnect:
  - **LOBBY & SUBMITTING (red-flag entry):** remove the player entirely —
    `delete players[id]`, `delete scores[id]`, drop their rejoin secret, free the
    name, **and drop any flags they authored** (both self-flags and call-outs
    they planted) so no phantom subject ends up in the built rounds. No scores
    exist yet, so nothing is lost. If they were host, migrate immediately
    (explicit leave, not the grace-period path from A.5).
  - **PLAYING:** keep current behavior (mark offline, preserve score) but surface
    "left" vs merely "disconnected" in the UI if we want the distinction
    (optional; add a `hasLeft` flag on `Player` only if the UI needs it).
  - Add `GameRoom.removePlayer(playerId)` covering the LOBBY/SUBMITTING path
    (players + scores + secret + authored flags).
  - If removing the player empties the room, GC immediately (reuse the existing
    all-gone deletion path).
  - Guard `game:start`: if a SUBMITTING leave drops the room below `MIN_PLAYERS`,
    `game:start` already rejects with `NOT_ENOUGH_PLAYERS` — verify the UI
    reflects the reduced count.
- **B.3 — confirm end-state navigation.** Clients already route to
  `/results/:code` on `FINAL_RESULTS` via `game:updated`; verify `game:end`
  drives the same redirect (it reuses `broadcastGameUpdate`, so it should).

### Tests (gate)
- Host `game:end` from `PLAYING` → all clients land on `FINAL_RESULTS` with
  scores intact; non-host `game:end` is rejected (`NOT_HOST`).
- Host `room:close` from SUBMITTING → room is deleted, all clients receive the
  closed signal, clear identity, and route home; non-host `room:close` rejected.
- LOBBY/SUBMITTING leave frees the name (another player can take it), the slot,
  and removes the leaver's submitted flags.
- Voting timer from the ended round does not fire after `game:end` / `room:close`.

---

## Phase C — Scoring re-evaluation (M, **design decisions needed**)

### Current model (grounded in `packages/shared/src/scoring.ts`)
Per round, given `votes: voter -> guessed`, the flag's `subjectId`, and settings:
- **correct** (`pointsForCorrectGuess`, default 100): each voter who guessed the
  subject.
- **rare** (`RARE_GUESS_BONUS_MAX = 100`, *hardcoded constant*): added to each
  correct voter, scaled by how few got it right —
  `round(100 * (1 - correctCount/total))`; `total === 1` ⇒ full 100.
- **fooled** (`pointsForFoolingOthers`, default 50): awarded to the *guessed*
  player whenever a voter guesses someone who is **not** the subject and **not**
  themselves. i.e., the misattributed player is rewarded.
- **stealth** (`STEALTH_BONUS_MAX = 100`, *hardcoded constant*): awarded to the
  subject, scaled by `wrongCount/total`.

### Problems / smells
1. **Knobs live in two places.** `pointsForCorrectGuess` / `pointsForFoolingOthers`
   are in `GameSettings` (configurable), but `RARE_GUESS_BONUS_MAX` and
   `STEALTH_BONUS_MAX` are hardcoded in `constants.ts`. So half the model is
   tunable and half isn't, and the defaults (100/100 bonus vs 100/50 base) can
   dominate the base points in unexpected ways.
2. **"Fooled" rewards the wrong person.** Points go to whoever was *guessed*, not
   to the flag's author/subject who actually "pulled off" the deception. A player
   who never wrote a deceptive flag still farms points just by being a plausible
   wrong answer. For **assigned/call-out flags** (authorId ≠ subjectId) this is
   especially incoherent — the *subject* is the accused victim, yet "stealth"
   rewards them for not being detected.
3. **Self-flag vs assigned-flag semantics aren't distinguished.** The same
   correct/rare/fooled/stealth math applies whether the flag is self-authored or
   planted on someone. The narrative ("whose flag is it?") differs between the
   two and the scoring should probably acknowledge that.
4. **Duplicate, divergence-prone computation.** The server computes deltas via
   `computeScoreDeltas` (GameEngine → `computeRoundScoring().deltas`) and is the
   authority for `game.scores`. The **client re-computes** the full
   `computeRoundScoring` in `RoundResults.tsx` to render the per-reason breakdown.
   They agree only as long as the client's redacted `round.votes` exactly matches
   the server's at REVEAL. Any redaction change silently desyncs the displayed
   breakdown from the actual scores.
5. **No-op / decoy votes.** Voting for yourself (when it isn't your own flag)
   scores nothing and costs nothing — a free "hide my real guess" move with no
   trade-off. Abstaining is likewise costless. Worth deciding if that's intended.

### Decisions needed (resolve before coding — see Open Decisions)
- **D1.** Should "fooled" reward the *author* of the flag (the deceiver) instead
  of the misattributed player? Or keep current behavior?
- **D2.** Should rare/stealth bonuses move into `GameSettings` (tunable) or stay
  fixed? If tunable, add Zod bounds + UI.
- **D3.** Different scoring for self-flags vs assigned flags? (e.g., assigned
  flags reward the *planter* when others guess the subject correctly.)
- **D4.** Any penalty/cost for wrong guesses or decoy self-votes?
- **D5.** Target score scale — keep 100-based, or rebalance so bonuses don't
  swamp base points?

### Approach (once D1–D5 decided)
- Consolidate all scoring constants into `GameSettings` (or a `ScoringConfig`
  sub-object) so there's a single source of tunables; keep defaults in
  `constants.ts` and bound them in `schemas.ts`.
- Rewrite `computeRoundScoring` to the agreed model; it stays the single shared
  pure function used by **both** server (authoritative) and client (display).
- **Stop the client re-computing for points.** Send the authoritative
  `breakdown` (not just `deltas`) in the `round:revealed` payload so the UI
  renders server truth. Keep `computeRoundScoring` importable for type/shape
  only, or drop the client call entirely.
- Update `RoundResults.tsx` reason labels if reasons change.
- Heavily unit-test the new model (it's a pure function — cheap to pin down).

### Tests (gate)
- Table-driven cases for every reason across: unanimous-correct, all-wrong,
  single-voter, self-flag vs assigned-flag, and the decoy-self-vote case.
- Server `game.scores` equals the sum of `breakdown` points sent to the client
  (no client/server divergence).

---

## Open decisions (need user input)

| # | Question | Why it matters |
|---|---|---|
| D1 | "Fooled" → reward flag author/deceiver, or keep rewarding the misattributed player? | Changes who benefits; affects whether call-out flags make sense |
| D2 | Move `RARE_GUESS_BONUS_MAX` / `STEALTH_BONUS_MAX` into tunable settings? | Consistency of the knobs; UI surface |
| D3 | Distinct scoring for self vs assigned flags? | Core to the "whose flag" premise |
| D4 | Penalty for wrong/decoy votes? | Affects voting strategy & balance |
| D5 | Overall score scale / rebalance bonuses vs base? | Bonuses (100/100) currently rival base (100/50) |
| D6 | Player leave in-game: just mark offline, or show an explicit "left" state? | UI complexity vs clarity |

---

## Suggested execution order & budget

| Phase | Effort | Risk if skipped |
|---|---|---|
| A — connection/rejoin | M | **High** (multi-tab false-disconnect, host churn) |
| B — exit/end-game | M | Medium (host stuck; stale lobby slots) |
| C — scoring | M | Medium (incoherent rewards; client/server desync) |

Ship **A first** (formalize the uncommitted hotfix + server dedup), then **B**,
then **C** once D1–D6 are answered. Roughly **2–3 focused days** total; C's
coding is small once the design is locked — the cost is the decisions, not the
code.
