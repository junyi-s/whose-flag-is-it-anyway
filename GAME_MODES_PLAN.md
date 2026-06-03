# Game Modes, Scoring Rewrite & Presenter Host — Implementation Plan

Supersedes **Phase C** of `IMPROVEMENT_PLAN_V2.md`. This is a delegation-ready
spec. It covers four interlocking pieces that share one foundation:

1. **Scoring rewrite** for the existing mode (decisions locked below).
2. **A second game mode** — a simplified speed/ordering scoring mode.
3. **A presenter / shared-screen host role** — a non-competing controller that
   runs the game on a shared screen (TV/laptop) and never votes.
4. **Auto-advance presentation** — an optional kiosk-style flow that walks the
   results → scores screens on a timer, skippable.

> **For the implementing agent (Sonnet):** read this whole file before writing
> code. Work phase-by-phase, top to bottom — Phase 1 is load-bearing for the
> rest. Each phase has explicit **acceptance criteria** and **test gates**; do not
> mark a phase done until both pass and the existing suite is green
> (`pnpm --filter @whose-flag/server test`, `pnpm --filter @whose-flag/web build`).
> Prefer extending the existing abstractions over adding parallel ones. When a
> decision is genuinely ambiguous, the **Open decisions** table at the bottom
> lists the chosen default — follow it rather than inventing a new path.

---

## Design principles (the bar for "elegant, not junior")

- **One source of truth for scoring.** The pure functions in
  `packages/shared/src/scoring.ts` are authoritative. The server computes; the
  client **renders what the server sends**. No parallel client re-computation.
- **Capabilities, not special-cases.** Model *who can vote / compete / control* as
  explicit, composable fields on the domain — never branch on names, indices, or
  "the first player." A presenter is a capability combination, not a hack.
- **Server owns state & timing.** All phase transitions and their timers live
  server-side, bound to the exact `(roundIndex, status)` they belong to, and are
  cleared on any manual transition. Clients render countdowns from timestamps;
  they never *drive* authoritative state on their own clock.
- **Additive protocol changes.** Extend payloads/settings with optional fields and
  sane defaults so old clients degrade gracefully and redaction stays correct.
- **Redaction is sacred.** Nothing added here may leak `subjectId`/`authorId`/
  others' votes before `REVEAL`. New server-only fields (e.g. vote order) must be
  stripped by `redactGameFor`.
- **Compose, don't fork.** `gameMode` × presenter-role × auto-advance are
  orthogonal and must work in any combination.

---

## Locked decisions (from discussion)

**Classic mode scoring**
- **Correct guessing is the core reward** and the single highest point source.
- **Rare bonus stays** — extra points to correct guessers when few got it right.
- **Fooling rewards the flag's author** (the writer), *even for call-outs about
  someone else* — never the misattributed player. **The per-misattributed-player
  award is deleted** (this is what let "believable suspects" farm points).
- **Fooling points < correct points** — a hard, validated invariant.
- **Self-flag vs call-out are distinguished:**
  - self-flag (author = subject) undetected → **stealth** to the author/subject.
  - call-out (author ≠ subject) undetected → **fooling/deception** to the
    **author**, at a rate **below** self-flag stealth (and below correct).
- All bonus magnitudes move into tunable **GameSettings**.

**Confirmed problem this fixes:** points currently leak to (a) whoever is *guessed
wrong* and (b) whoever is the *subject* of many flags — neither reflects skill,
while the real skill (writing/planting a convincing flag) earns the author
nothing. The rewrite routes deception credit to the author and deletes the passive
awards.

---

## Current state (grounded in the code)

- One implicit mode. Scoring: `packages/shared/src/scoring.ts`
  `computeRoundScoring(votes, subjectId, settings)` — called **twice**: server
  (authoritative, `GameEngine.computeScoreDeltas`) and **client**
  (`apps/web/src/components/RoundResults.tsx` recomputes for display → divergence
  risk).
- `vote:cast` (`apps/server/src/socket/handlers.ts`) overwrites
  `round.votes[playerId]`; **vote arrival order is not tracked**.
- `GameSettings` (`packages/shared/src/types.ts`): `pointsForCorrectGuess`,
  `pointsForFoolingOthers`, `votingTimeSeconds`, flag counts, `shuffleFlagOrder`.
  Bonus maxima `RARE_GUESS_BONUS_MAX`, `STEALTH_BONUS_MAX` are hardcoded constants.
- Round flow `PRESENTING → VOTING → REVEAL → SCOREBOARD`; the voting auto-reveal
  timer is already round-bound (`GameRoom.setVotingTimer/clearVotingTimer`,
  `votingTimerRound`). `round:revealed` carries `{ round, scoreDeltas }` — **no
  breakdown**.
- `MIN_PLAYERS` and "all submitted"/"all voted"/host checks all assume *every*
  player is a competitor.
- `redactGameFor` (`packages/shared/src/redact.ts`) already strips hidden fields
  per phase — extend it for any new server-only field.

---

## Domain model changes

### 1. Game mode
```ts
export type GameMode = 'classic' | 'speed'      // display: "Classic", "Quickdraw"
```
Add `gameMode: GameMode` to `GameSettings` (default `'classic'`). Editable only in
`LOBBY`, host-only, via the existing `settings:update` path.

### 2. Player capability — the presenter role
Two **orthogonal** booleans on `Player` (`types.ts`):
- `isHost: boolean` — *control authority* (existing; transferable via migration).
- `spectator: boolean` — **NEW**: a non-competing participant. A spectator does
  **not** submit flags, is **not** a vote subject, **cannot** vote, and is **not**
  ranked on the competitive scoreboard. Set at create/join; stable for the room's
  life.

A **shared-screen / presenter host** is simply `{ isHost: true, spectator: true }`.
A normal host is `{ isHost: true, spectator: false }`. The combination composes —
do not add a third enum.

**Single capability selector** (add to `shared`, use everywhere):
```ts
export const isCompetitor = (p: Player) => !p.spectator
export const competitors = (game) => Object.values(game.players).filter(isCompetitor)
```
Replace every "all players" assumption that means "all *competing* players" with
`competitors(game)`:
- `MIN_PLAYERS` check → `competitors(game).length >= MIN_PLAYERS` (a presenter does
  **not** count toward the minimum).
- `allPlayersHaveMinFlags`, "all submitted", "all voted" → over `competitors`.
- vote-subject pool & call-out target list → `competitors` only.
- scoreboard / final ranking → `competitors` only (presenters never appear as
  competitors; either don't add them to `game.scores` or keep them out of the UI).

### 3. Vote ordering (speed mode)
Add `voteOrder: PlayerId[]` to `Round` — **server-only**, stripped by
`redactGameFor` before `REVEAL`. It holds competing voters in the order their
*current* vote was locked (see Speed mode).

### 4. Unified phase timer (generalize the voting timer)
Replace the bespoke voting timer with one general, round-bound phase timer on
`GameRoom`:
```ts
// one active timer at a time (the game is linear)
scheduledPhase?: { handle: Timeout; roundIndex: number; status: RoundStatus }
schedulePhase(handle, roundIndex, status)   // replaces setVotingTimer
clearPhase()                                 // replaces clearVotingTimer
```
Every auto-transition (voting auto-reveal **and** auto-advance dwell) goes through
this. The callback must re-check `currentRoundIndex === roundIndex &&
round.status === status` before transitioning (stale-timer guard — same pattern
already used for voting). Any manual host transition calls `clearPhase()` first.
Migrate the existing voting auto-reveal onto this so there is exactly one timing
mechanism.

### 5. Auto-advance settings + countdown field
```ts
// GameSettings
autoAdvance: boolean          // default false
autoAdvanceSeconds: number    // default 10
```
Add `advanceAt?: number` (Unix ms) to `Round` — when set, the next auto-transition
fires then; clients render a countdown/progress bar from it (mirrors the existing
`votingEndsAt`).

### 6. Settings, defaults, validation
- Defaults in `packages/shared/src/constants.ts`; add the new `DEFAULT_*`.
- `GameSettings` gains: `gameMode`, classic knobs (`rareBonusMax`,
  `stealthBonusMax`, `foolingBonusMax` — `pointsForCorrectGuess` already exists;
  retire/rename `pointsForFoolingOthers` → `foolingBonusMax`), speed knobs
  (`speedFirstPoints`, `speedStep`, `speedMinPoints`), `autoAdvance`,
  `autoAdvanceSeconds`.
- `packages/shared/src/schemas.ts` (`GameSettingsPartialSchema`): bounds for every
  new field + cross-field refines: `foolingBonusMax < pointsForCorrectGuess`,
  `speedMinPoints <= speedFirstPoints`, `autoAdvanceSeconds` in e.g. `[3, 30]`.
  Reject `settings:update` that violates them (the handler already surfaces refine
  errors). Consider grouping scoring knobs under a `scoring` sub-object if it reads
  cleaner — your call, but keep one consistent shape.

---

## Mode A — Classic ("Deception")

Per round: true subject `S`, author `W` (from the flag), competing votes only,
`total = competing votes cast`.

- **Correct:** each competitor who guessed `S` → `+pointsForCorrectGuess`
  **and** `+rareBonus`, where `rareBonus = round(rareBonusMax * (1 -
  correctCount/total))` (full `rareBonusMax` when `total === 1`).
- **Undetected reward,** scaled by `wrongFraction = wrongCount/total`:
  - self-flag (`W === S`): `+round(stealthBonusMax * wrongFraction)` → `S`.
  - call-out (`W !== S`): `+round(foolingBonusMax * wrongFraction)` → **`W`**.
- **No award to misattributed players. Ever.**
- Defaults (starting point, all tunable): correct **100**, rare **100**, stealth
  **80**, fooling **50**. Invariant enforced: `fooling < correct`.
- `ScoreReason` gains nothing new for classic; relabel the `fooled` reason in the
  UI to reflect author-credit (e.g. "🃏 fooled (you planted it)"). Keep `stealth`,
  `correct`, `rare`.

## Mode B — Speed ("Quickdraw")

Simplified, pure race on *who identified the subject first*:

- The server records **vote order** among competitors. The first correct guess
  scores most; points step down the order. Nobody else scores (no stealth/fooling/
  rare).
- **Changing or re-selecting a guess during voting sends you to the back of the
  order** — locking in fast and committing is the whole game. (Default: *any*
  re-cast moves you to the back; see M3 to soften to changed-only.)
- **No clocks.** Arrival order at the server *is* the ranking — store sequence,
  not timestamps.
- **Vote handling** (`vote:cast`, speed branch): remove `pid` from `voteOrder` if
  present, then `push(pid)`; then set `round.votes[pid]`. Return the voter's lock
  position privately (see protocol).
- **Scoring at reveal:** walk `voteOrder`; maintain `rank` starting at 0; for each
  `pid` whose **final** vote equals `S`, award
  `max(speedMinPoints, speedFirstPoints - rank*speedStep)` and `rank++`. Wrong
  guessers → 0. (Because a changed vote went to the back, second-guessing naturally
  costs rank.)
- Defaults: `speedFirstPoints` **100**, `speedStep` **20**, `speedMinPoints`
  **20** → 100, 80, 60, 40, 20, 20, … Add `ScoreReason` `'speed'`.
- **Auto-reveal when all competitors have voted** (M2 default yes): when the last
  competing vote lands, schedule/trigger reveal (via the phase timer or directly).
  The voting timer still bounds the round if some never vote.

## Presenter host (shared screen)

A `{ isHost: true, spectator: true }` participant runs the game on a shared device:
- **No competing UI:** their client renders a **presenter view** — big flag,
  live vote tally (counts only, no answer), and the host controls — and **never a
  voting panel**. They are excluded from the subject pool, flag submission, and the
  competitive scoreboard.
- **Full control:** all existing host-only events (`game:start`, `round:next`,
  `round:openVoting`, `round:reveal`, `round:scoreboard`, `game:end`,
  `room:close`, `settings:update`). No new authority needed — they're host.
- **Counting:** excluded from `MIN_PLAYERS` and all "everyone has X" checks via the
  `competitors` selector. So a presenter + 2 players is a valid game.
- **Host migration interplay (A.5):** if the presenter host drops past the grace
  window, migrate control to a competitor (they become host on their phone and the
  game continues). Migration target selection should **prefer competitors**; a
  returning presenter does not reclaim host (existing no-take-back rule). Document
  this in the handler.
- **Forward-compatible with Cast Mode:** build the presenter view as a
  self-contained, read-only-of-game-state component so it can later be mounted at a
  standalone `/cast/:code` route (the SMOKE_TEST_FINDINGS "Cast Mode" request)
  without rework. Don't couple it to the host's input widgets beyond the control bar.

**Where the choice is made:** at **room creation** the host picks "Host & play" vs
"Run on this screen (you won't play)" — because it determines whether they submit
flags. Allow toggling in `LOBBY` before start as a convenience. Persist
`spectator` in `RoomCreatePayload` (optional, default false) and reflect it in the
create/rejoin acks.

## Auto-advance presentation

Optional kiosk flow, toggled by the host (most useful with a presenter), honored
**by the server** so it survives a controller refresh:
- Setting `autoAdvance` (+ `autoAdvanceSeconds`, default 10).
- When `autoAdvance` and the game enters **REVEAL**, `schedulePhase` a transition
  to **SCOREBOARD** after N s; on entering **SCOREBOARD**, schedule **round:next**
  after N s. Set `round.advanceAt` so clients can render a countdown + progress bar.
- **Skippable:** a "Skip ⏭" control on the presenter (and host) screen emits the
  same existing host transition event, whose handler calls `clearPhase()` and
  advances immediately. No special skip event needed — reuse `round:scoreboard` /
  `round:next`.
- Scope: auto-advance covers the **post-vote** chain (REVEAL dwell → SCOREBOARD
  dwell → next). Opening voting and revealing stay host-driven (or, in speed mode,
  reveal auto-fires when all voted). Extending auto-advance to open voting too is a
  later option, not in scope.
- Robustness: because timing is server-side and round-bound, a presenter refresh
  (A.5 grace) does not desync or double-fire; the stale-timer guard prevents a
  pending dwell from firing on the wrong round.

---

## Phases

### Phase 1 — Scoring foundation & single source of truth (M)  *(do first)*
**Goal:** one mode-aware authoritative scoring path; client renders server truth.
- Make `computeRoundScoring` **mode-aware**: dispatch to `computeClassicScoring`
  vs `computeSpeedScoring` behind one entry point. Signature takes what both need:
  the `Round` (for `votes` + `voteOrder`), the flag (`subjectId` + `authorId`),
  and `settings`. Keep it pure.
- Add `ScoreReason` `'speed'`.
- **Ship the breakdown over the wire:** extend `RoundRevealedPayload` with
  `breakdown: Record<PlayerId, ScoreLine[]>`. `revealRound` sends server truth.
- `RoundResults.tsx` **stops** calling `computeRoundScoring` and renders the
  `breakdown` from the event/store instead.
- Files: `shared/scoring.ts`, `shared/events.ts`, `server/GameEngine.ts`,
  `server/socket/handlers.ts`, `web/.../RoundResults.tsx`, `web/stores/gameStore.ts`
  (hold last breakdown alongside `lastDeltas`).
- **Acceptance:** server `game.scores` deltas exactly equal the sum of points in
  the `breakdown` emitted; the client no longer imports `computeRoundScoring`.
- **Tests:** unit table for classic across unanimous-correct / all-wrong /
  single-voter; assert deltas == sum(breakdown).

### Phase 2 — Classic scoring rewrite (S–M)
- Implement the locked Classic model (delete misattributed award; call-out
  undetected → author; scale stealth/fooling by `wrongFraction`).
- Move bonus maxima into `GameSettings`; defaults in `constants.ts`; Zod bounds +
  `fooling < correct` refine in `schemas.ts`. Update `DEFAULT_GAME_SETTINGS`.
- Update `RoundResults.tsx` labels.
- **Acceptance:** a misattributed player receives 0; a call-out author receives the
  fooling bonus when undetected; a self-flag subject receives stealth; `fooling <
  correct` is rejected at validation if violated.
- **Tests:** self-flag vs call-out author-credit; "no points to misattributed
  player"; settings refine rejects `fooling >= correct`.

### Phase 3 — Speed mode, server (M)
- `Round.voteOrder` (+ redaction strip). `vote:cast` speed branch (move-to-back).
- Private lock position: extend the `vote:cast` ack to a response type
  `{ order?: number }` (order = the voter's 1-based position in `voteOrder`). Keep
  it additive.
- `computeSpeedScoring` + the "all competitors voted → reveal" trigger.
- **Acceptance:** order respected; a changed vote moves to the back; ladder + floor
  correct; wrong guesses score 0; `voteOrder` never present in a pre-reveal
  redacted view.
- **Tests:** integration — two competitors, lock order, change-penalty, final
  scoring; redaction check that `voteOrder` is absent during VOTING.

### Phase 4 — Presenter host & capability model (M)
- Add `Player.spectator` + `isCompetitor`/`competitors` selectors; thread through
  `MIN_PLAYERS`, submission/voting/subject/scoreboard checks.
- `RoomCreatePayload.spectator?` + lobby toggle; reflect in acks and `redactGameFor`.
- Host-migration prefers competitors; document presenter-leave behavior.
- **Acceptance:** a presenter cannot vote / submit flags / be a subject / appear as
  a competitor; presenter + 2 competitors can start; presenter-host drop migrates
  control to a competitor after grace.
- **Tests:** integration — presenter cannot `vote:cast` (rejected); `MIN_PLAYERS`
  counts competitors only; vote-subject list excludes the presenter.

### Phase 5 — Unified phase timer & auto-advance (M)
- Generalize the voting timer to the round-bound phase timer; migrate auto-reveal
  onto it.
- Add `autoAdvance`/`autoAdvanceSeconds` settings + `Round.advanceAt`; server
  schedules REVEAL→SCOREBOARD→next dwell; skip via existing host events clearing
  the phase timer.
- **Acceptance:** with `autoAdvance` on, REVEAL and SCOREBOARD each dwell
  `autoAdvanceSeconds` then advance; a manual Skip advances immediately and cancels
  the pending timer; a stale dwell never fires on the wrong round.
- **Tests:** integration — auto-advance walks the chain on a short timer; skip
  cancels; stale-timer guard holds across a round boundary (extend the existing
  stale-voting-timer test pattern).

### Phase 6 — Client UX: mode select, presenter view, speed voting (M)
- **Mode select** (Lobby, host-only): two description cards (below) + conditional
  mode-specific settings; non-hosts see a read-only mode badge. A small mode chip on
  the round screens so players always know the rules.
- **Presenter view:** big flag, live tally (counts only), host control bar, no
  voting panel; auto-advance toggle + countdown/progress + Skip. Built as a
  self-contained component (Cast-Mode-ready).
- **Speed voting panel:** lock-in state, the lock position from the ack, and an
  explicit warning that changing your guess **sends you to the back of the line**.
- **Speed results:** render the order + points ladder.
- **Acceptance:** each combination (classic/speed × presenter/no-presenter ×
  auto-advance on/off) renders the right screens and controls; web build passes.

### Phase 7 — Docs & polish (S)
- README + `.env.example` for new tunables; a short "Game modes" doc; note the
  presenter view's Cast-Mode forward path.

---

## Mode-selection & presenter UX (brainstorm)

**Location:** embed in the **Lobby** (host already configures there; players watch
it). Prominent mode toggle at the top of host controls; conditional settings below.
A dedicated `/mode/:code` step is the alternative — more ceremony, skip unless the
lobby gets crowded.

```
┌──────────────────────────┐   ┌──────────────────────────┐
│ 🎭  CLASSIC               │   │ ⚡  QUICKDRAW             │
│ Guess whose red flag it  │   │ Same flags, pure speed.  │
│ is. Score for correct    │   │ First to correctly guess │
│ reads, rare guesses, and │   │ scores big — points drop │
│ for planting flags that  │   │ down the line. Change    │
│ fool everyone.           │   │ your answer → back of    │
│ [ Selected ✓ ]           │   │ the line! [ Select ]     │
└──────────────────────────┘   └──────────────────────────┘

Host on this screen?  ( ) I'm playing   (•) Run on this screen (I won't play)
Auto-advance results   [ off | on ]   dwell: [ 10s ]   (skippable)
```

- Selecting a mode reveals only that mode's sliders (Classic: correct / fooling /
  stealth / rare; Quickdraw: first / step / min).
- The presenter toggle (creation-time + lobby) sets `spectator`. Auto-advance is a
  setting most useful with a presenter but available regardless.

---

## Open decisions (defaults chosen — follow unless told otherwise)

| # | Question | Default |
|---|---|---|
| M1 | Mode display names | "Classic" / "Quickdraw" |
| M2 | Speed: auto-reveal once all competitors have voted? | Yes |
| M3 | Speed: re-selecting the **same** answer → back of line, or only a *changed* one? | Any re-cast → back |
| M4 | Speed: do non-correct guessers score anything? | No — pure race |
| M5 | Mode-select location | Lobby embed |
| M6 | Presenter choice at create-time, lobby, or both? | Both (create sets it; lobby can toggle pre-start) |
| M7 | Auto-advance scope | Post-vote chain only (REVEAL→SCOREBOARD→next) |
| M8 | D4 / D5 (wrong-vote penalty / overall scale rebalance) | None / keep 100-scale |

---

## Suggested order & budget
Phase 1 → 2 (classic correctness ships value alone) → 3 (speed server) → 4
(presenter/capabilities) → 5 (timer + auto-advance) → 6 (UX) → 7 (docs). Roughly
**4–6 focused days**. Phase 1 and the capability selector (Phase 4) are the two
load-bearing abstractions — get them clean and the rest is mechanical.
