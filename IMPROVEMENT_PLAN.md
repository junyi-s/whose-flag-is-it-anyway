# Improvement Plan — Correctness, Security & Hygiene

This plan addresses the findings from the code review. Phases are ordered by
**risk-adjusted value**: cheap hygiene first, then game-breaking correctness
bugs, then the architectural information-leak fix, then deployment correctness,
then the tests that lock it all in.

Each item lists the **files touched**, the **approach**, and a rough **effort**
estimate (S ≈ <1h, M ≈ half-day, L ≈ 1–2 days).

---

## Phase 0 — Hygiene & dead code (S, do first)

Low-risk cleanup that makes the rest safer to work on.

- **0.1 Fix the test command.** `apps/server/package.json` uses `"test": "vitest"`
  (watch mode — hangs in CI). Change to `"test": "vitest run"` and add
  `"test:watch": "vitest"`.
- **0.2 Delete stray dev scripts.** `apps/server/src/test-phase3.ts`,
  `test-phase5_5.ts`, `test-socket.ts` are compiled into `dist/` and shipped.
  Remove them (or move to `scripts/` excluded from `tsconfig`).
- **0.3 Remove dead `flags:import` path.** The web client never emits
  `flags:import` (it parses `.txt` locally and calls `flags:submit`). Delete the
  handler in `handlers.ts` + `FlagsImportSchema`/`FlagsImportPayload`/response in
  `shared`, **or** wire the client to use it. Recommendation: delete.
- **0.4 README accuracy.** README still references OpenAI (`OPENAI_API_KEY`,
  `gpt-4o-mini`). Update to `ANTHROPIC_API_KEY` / `claude-haiku-4-5-20251001`
  to match the migrated code and `.env.example`.
- **0.5 ESLint.** `App.tsx` has an `eslint-disable` comment but no linter exists.
  Add a minimal flat ESLint config (typescript-eslint + react-hooks) wired into
  a `lint` script, or remove the orphan directive.

---

## Phase 1 — Game-breaking correctness (M, no protocol change)

These are server-only logic fixes; the wire format does not change.

### 1.1 Host migration on disconnect  (dead `transferHost`)
- **Files:** `socket/handlers.ts` (`handleDisconnect`), `game/GameRoom.ts`.
- **Problem:** every advancing event is host-only; if the host drops, the game
  stalls forever. `GameRoom.transferHost()` exists but is never called.
- **Approach:** in `handleDisconnect`, after marking the player disconnected, if
  the leaver is `hostId` and ≥1 other player is still connected, pick the
  longest-connected `isConnected` player (lowest `joinedAt`) and call
  `transferHost`. Broadcast the update. Apply the same on explicit `room:leave`.
  If the host reconnects, leave the new host in place (no take-back).

### 1.2 Bind/clear the voting timer to its round
- **Files:** `socket/handlers.ts` (`round:openVoting`, `revealRound`, `round:next`),
  `game/GameRoom.ts`.
- **Problem:** the auto-reveal `setTimeout` isn't tied to the round it was created
  for and is never cleared, so a manual reveal + advance can let a stale timer cut
  a *later* round's voting short.
- **Approach:** store the active timer handle + the `roundIndex` it targets on the
  room (e.g. `room.votingTimer`). In the callback, only reveal if
  `currentRoundIndex === targetIndex && status === 'VOTING'`. `clearTimeout` the
  handle in `revealRound` and whenever the round advances. Clear on room deletion.

### 1.3 Validate votes against room membership
- **Files:** `socket/handlers.ts` (`vote:cast`).
- **Problem:** `guessedPlayerId` is validated as a UUID but not as a player in the
  room; a crafted vote injects phantom score entries via `applyScoreDeltas`.
- **Approach:** reject with `INVALID_GUESS` if `!room.hasPlayer(guessedPlayerId)`.

### 1.4 Settings cross-field validation
- **Files:** `shared/schemas.ts` (or the `settings:update` handler).
- **Problem:** `minFlagsPerPlayer` can exceed `maxFlagsPerPlayer`.
- **Approach:** `.superRefine` on the resolved settings (after merge with defaults)
  to enforce `min ≤ max`; reject `settings:update` otherwise.

---

## Phase 2 — Fix the information leak (L, the important one)

**Problem:** `broadcastGameUpdate` sends the full `Game` snapshot to every client
on every change. That snapshot contains, for all flags, `subjectId` (the answer)
and `authorId` (the secret call-out planter). The game is fully cheatable from the
browser console, and the "secret call-out" promise is false.

**Goal:** the server is the only holder of hidden information; each client receives
only what it is allowed to know *for its current phase*.

### 2.1 Per-player delivery
- **Files:** `socket/handlers.ts`.
- On `room:create` / `room:join` / `room:rejoin`, also `socket.join(playerId)` so
  each player has a private channel (handles multiple tabs/reconnects).
- Replace `broadcastGameUpdate`'s single `io.to(roomCode).emit(...)` with a loop
  over `room.game.players` that emits a **redacted** view to `io.to(playerId)`.
- Redact the `game` returned in the create/join/rejoin **acks** too (currently raw
  `room.snapshot()`).

### 2.2 `redactGameFor(game, viewerId): GameView`  (pure, in `shared`)
A pure function so it is unit-testable in isolation. Redaction rules:

| Phase | `flags` map | Each round's `redFlag` | `votes` |
|---|---|---|---|
| LOBBY | n/a (empty) | — | — |
| SUBMITTING / GENERATING | only flags where `authorId === viewer`; others replaced by a count-only `submissionStatus: Record<PlayerId, number>` | — | — |
| PLAYING, round < current | full | full (text + subject) | full |
| PLAYING, current = REVEAL/SCOREBOARD | omit global map | full + `isOwnFlag` | full |
| PLAYING, current = PRESENTING/VOTING | omit global map | text only; **strip `subjectId`**, **strip `authorId`**, add `isOwnFlag: boolean` for the viewer | hide others' guesses; expose only viewer's own vote (+ set of voter IDs) |
| PLAYING, round > current (future) | omit | strip `text` entirely | — |
| FINAL_RESULTS | full | full | full |

- `authorId` of **assigned/call-out** flags stays hidden from non-authors at all
  times (optionally revealed only at FINAL_RESULTS as a "who planted it" reveal).
- The client already prefers `round.redFlag` over `game.flags` (`Game.tsx:36`), so
  dropping the global map during play is low-friction.

### 2.3 Type strategy
- Add a `GameView` type in `shared` (Game with `RedFlag` fields optional +
  `isOwnFlag?`, `revealed?`, and an optional `submissionStatus`). Keep the internal
  server `Game` fully typed/unredacted.
- The `game:updated` payload becomes `GameView`. Update the few client reads of
  `flag.subjectId` (`RoundResults`) and `flag.authorId` (`VotingPanel` →
  use `isOwnFlag` instead) accordingly.

### 2.4 Client adjustments
- `VotingPanel` disables self-vote via `isOwnFlag` instead of `authorId`.
- `PlayerProgressRow` reads `submissionStatus` instead of counting others' flags.
- `RoundResults` reads the now-revealed `subjectId` from the round flag.

### 2.5 Tests (gate for this phase)
- `redactGameFor`: a non-owner's view during VOTING contains **no** `subjectId`
  and **no** other players' flag text; the same view at REVEAL **does**.
- The author of an assigned flag never appears in another player's view.

---

## Phase 3 — Deployment correctness (S–M)

### 3.1 Trust the proxy so IP limits actually work
- **Files:** `index.ts`, `middleware/connectionLimits.ts`.
- **Problem:** behind Railway's load balancer, `socket.handshake.address` is the
  proxy IP, so the per-IP connection cap and room-create limit are globally shared
  / ineffective.
- **Approach:** `app.set('trust proxy', 1)`; add a `getClientIp(socket)` helper
  that reads the first hop of `x-forwarded-for` (Railway sets it) and falls back
  to `handshake.address`. Use it everywhere `handshake.address` is used today.
  Re-test the caps with simulated `X-Forwarded-For`.

---

## Phase 4 — Integration tests for the hard parts (M)

The existing 52 tests cover pure functions and guards but **none** of the socket
flow. Add `socket.io-client`-driven tests against an ephemeral server for:

- Host migration: host disconnects → another connected player becomes host and can
  advance.
- Timer: opening voting on round N+1 is not ended early by round N's stale timer.
- Vote validation: a vote for a non-member UUID is rejected.
- Redaction end-to-end: a second client's `game:updated` payload never contains the
  answer before reveal.

---

## Suggested execution order & rough budget

| Phase | Effort | Risk if skipped |
|---|---|---|
| 0 — hygiene | S | Low (but cheap) |
| 1 — correctness | M | **High** (host drop bricks games; stale timer) |
| 2 — info leak | L | **Critical** (game is cheatable) |
| 3 — proxy/IP | S–M | Medium (abuse caps don't work in prod) |
| 4 — integration tests | M | Medium (regressions on the above) |

Total: roughly **3–5 focused days**. Phase 2 is the bulk. Phases 0, 1, 3 can each
ship independently in a day or less.
