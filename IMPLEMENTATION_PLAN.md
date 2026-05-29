# Whose Flag Is It Anyway? — Implementation Plan

> **Status:** Pre-implementation
> **Final name:** Whose Flag Is It Anyway?
> **Repo / folder:** `whose-flag-is-it-anyway`
> **Workspace scope:** `@whose-flag/*`
> **Owner:** junyisim@gmail.com
> **Created:** 2026-05-22

This document is the single source of truth for building the game. It is written so that an executor (human or AI) can follow it linearly without making architectural decisions. Each phase is atomic and has explicit acceptance criteria.

---

## 1. Project Overview

### Concept
A multiplayer party game (2–20 players) where each player submits their personal "red flags." The game then presents red flags one at a time, and players vote on whose red flag they think it is. Points are awarded for correct guesses. An LLM (OpenAI) themes and orders the red flags to make the game flow more interesting.

**Assigned flags (call-outs).** During submission, players can *optionally* plant red flags on **other** players — up to 5 per target. A flag therefore has two roles: an **author** (who wrote it) and a **subject** (whose flag it is). The subject is the voting answer. Self-submitted flags simply have `subjectId === authorId`; assigned flags have an author different from the subject. Gameplay, voting, and scoring are otherwise unchanged — a flag is just "whose is it?", and the answer is the subject. The only voting restriction is that the **author** can't vote on their own flag; the subject *can* vote, and even scores if they correctly recognise a call-out written about them. See §9 Phase 3 for the exact scoring rules.

### Goals
- **Cheap to run:** Target ~$5/month infrastructure + ~$0.01/game in LLM costs
- **Mobile-first:** Players join from their phones; works as a PWA
- **Low friction:** Players join via short URL + 4-letter room code (Jackbox/Kahoot style)
- **Fun:** Animations, sounds, satisfying reveal moments
- **Replayable:** Each game feels unique due to LLM-ordering and player-submitted content

### Non-Goals (for MVP)
- Persistent user accounts
- Cross-game stats / leaderboards
- Spectator mode
- Custom themes / monetization
- Native mobile apps

---

## 2. Tech Stack (Pinned)

| Layer | Choice | Version | Rationale |
|---|---|---|---|
| Package manager | pnpm | 9.x | Monorepo workspace support |
| Language | TypeScript | 5.6+ | Type safety across client/server |
| Frontend framework | React | 18.3+ | Component model, ecosystem |
| Build tool | Vite | 5.x | Fast dev, PWA plugin |
| State management | Zustand | 4.x | Lightweight, no boilerplate |
| Styling | Tailwind CSS | 3.x | Mobile-first utility classes |
| UI animations | Framer Motion | 11.x | Reveal/transition animations |
| Routing | React Router | 6.x | Standard |
| Backend framework | Express | 4.x | Minimal, well-known |
| Realtime | Socket.io | 4.x | Reliable, fallbacks, well-documented |
| LLM | OpenAI SDK | 4.x | gpt-4o-mini for cost |
| LLM model | gpt-4o-mini | — | ~$0.15/1M input tokens |
| Validation | Zod | 3.x | Runtime + compile-time types |
| Testing | Vitest | 2.x | Vite-native |
| Deployment (web) | Vercel | — | Free tier |
| Deployment (server) | Railway | — | $5/mo hobby |

---

## 3. Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Player Phone   │     │  Player Phone   │     │  Player Phone   │
│  (React PWA)    │     │  (React PWA)    │     │  (React PWA)    │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │      WebSocket (Socket.io over HTTPS)         │
         └───────────────────────┼───────────────────────┘
                                 │
                        ┌────────▼─────────┐
                        │  Express Server  │
                        │  (Node.js)       │
                        │  ─ Socket.io     │
                        │  ─ Game rooms    │
                        │  ─ LLM proxy     │
                        └────────┬─────────┘
                                 │
                                 │ HTTPS
                                 ▼
                        ┌──────────────────┐
                        │  OpenAI API      │
                        │  (gpt-4o-mini)   │
                        └──────────────────┘
```

### Key Architectural Decisions
1. **No database for MVP.** Game state lives in memory on the server. Rooms are ephemeral — when the game ends or all players disconnect, the room is destroyed.
2. **Server is authoritative.** All game state (current round, scores, votes) is managed on the server. Clients send intent (vote, advance, etc.) and receive state updates.
3. **One room per game.** Each game gets a unique 4-letter code (e.g., `BJQK`).
4. **Reconnection handling.** Players can refresh / lose connection and rejoin with the same room code + player ID (stored in localStorage).
5. **LLM calls are server-side.** API key never touches the client.

---

## 4. Shared Types

These types live in `packages/shared/src/types.ts` and are imported by both client and server.

```typescript
// ─── Identifiers ───
export type RoomCode = string;       // 4 uppercase letters, e.g. "BJQK"
export type PlayerId = string;       // UUID
export type RedFlagId = string;      // UUID

// ─── Player ───
export interface Player {
  id: PlayerId;
  name: string;                       // Display name, 1-20 chars
  avatar: AvatarConfig;
  isHost: boolean;
  isConnected: boolean;
  joinedAt: number;                   // Unix ms
}

export interface AvatarConfig {
  emoji: string;                      // Single emoji char
  bgColor: string;                    // Hex color, e.g. "#FF5733"
}

// ─── Red Flag ───
export interface RedFlag {
  id: RedFlagId;
  text: string;                       // 3-200 chars
  authorId: PlayerId;                 // Who WROTE the flag (mostly hidden metadata)
  subjectId: PlayerId;                // Whose flag it is — the VOTING ANSWER.
                                      //   Self-flag: subjectId === authorId
                                      //   Assigned flag: someone called out another player
  theme?: string;                     // Set by LLM, e.g. "Dating Habits"
  orderIndex?: number;                // Set by LLM, position in game
}

// ─── Game Settings (configured pre-game) ───
export interface GameSettings {
  minFlagsPerPlayer: number;          // Default 5
  maxFlagsPerPlayer: number;          // Default 50
  votingTimeSeconds: number;          // Default 20
  pointsForCorrectGuess: number;      // Default 100
  pointsForFoolingOthers: number;     // Default 50 per fooled player
  shuffleFlagOrder: boolean;          // Default true (LLM orders if true)
}

// ─── Game State Machine ───
export type GameStatus =
  | 'LOBBY'           // Waiting for players to join
  | 'SUBMITTING'      // Players entering their red flags
  | 'GENERATING'      // Server calling LLM to theme/order
  | 'PLAYING'         // Active rounds
  | 'FINAL_RESULTS'   // Game over, showing standings
  | 'CLOSED';         // Room destroyed

export type RoundStatus =
  | 'PRESENTING'      // Red flag displayed, vote not yet open
  | 'VOTING'          // Vote panel active, timer running
  | 'REVEAL'          // Showing votes cast + correct answer
  | 'SCOREBOARD';     // Showing updated standings

// ─── Game Round ───
export interface Round {
  index: number;                      // 0-based
  redFlag: RedFlag;
  status: RoundStatus;
  votes: Record<PlayerId, PlayerId>;  // voter -> guessed-as
  startedAt: number;                  // Unix ms
  votingEndsAt?: number;              // Unix ms when timer expires
}

// ─── Game ───
export interface Game {
  code: RoomCode;
  status: GameStatus;
  hostId: PlayerId;
  settings: GameSettings;
  players: Record<PlayerId, Player>;
  flags: Record<RedFlagId, RedFlag>;
  rounds: Round[];
  currentRoundIndex: number;          // -1 before first round
  scores: Record<PlayerId, number>;
  createdAt: number;
}

// ─── LLM Output Schema ───
export interface LlmOrderingResult {
  themes: string[];                   // List of theme names used
  orderedFlags: Array<{
    flagId: RedFlagId;
    theme: string;
    orderIndex: number;
  }>;
}
```

---

## 5. Socket Event Contracts

All events use a typed payload. Defined in `packages/shared/src/events.ts`.

### Client → Server

| Event | Payload | Response | Notes |
|---|---|---|---|
| `room:create` | `{ playerName: string, avatar: AvatarConfig, settings?: Partial<GameSettings> }` | `{ code: RoomCode, playerId: PlayerId, game: Game }` | Creates room, makes caller the host |
| `room:join` | `{ code: RoomCode, playerName: string, avatar: AvatarConfig }` | `{ playerId: PlayerId, game: Game }` | Joins existing room |
| `room:rejoin` | `{ code: RoomCode, playerId: PlayerId }` | `{ game: Game }` | Reconnect after disconnect |
| `room:leave` | `{}` | `{}` | Player leaves voluntarily |
| `flags:submit` | `{ flags: string[] }` | `{ accepted: number }` | Submit your OWN red flags (subjectId = you) |
| `flags:import` | `{ text: string }` | `{ accepted: number, rejected: string[] }` | Parse text file, one flag per line (your own flags) |
| `flags:assign` | `{ subjectId: PlayerId, flags: string[] }` | `{ accepted: number }` | Optionally assign up to 5 flags to ANOTHER player (subjectId ≠ you) |
| `game:start` | `{}` | `{}` | Host only; triggers LLM ordering, moves to PLAYING |
| `round:next` | `{}` | `{}` | Host only; advances to next round |
| `round:openVoting` | `{}` | `{}` | Host only; moves PRESENTING → VOTING |
| `vote:cast` | `{ guessedPlayerId: PlayerId }` | `{}` | Player votes |
| `round:reveal` | `{}` | `{}` | Host only; closes vote, computes scores, moves to REVEAL |
| `settings:update` | `{ settings: Partial<GameSettings> }` | `{}` | Host only; pre-game only |

### Server → Client (broadcasts)

| Event | Payload | When |
|---|---|---|
| `game:updated` | `{ game: Game }` | Any change to game state |
| `player:joined` | `{ player: Player }` | New player connects |
| `player:left` | `{ playerId: PlayerId }` | Player disconnects |
| `player:reconnected` | `{ playerId: PlayerId }` | Player rejoins |
| `flags:progress` | `{ playerId: PlayerId, count: number }` | Player submits more flags |
| `round:started` | `{ round: Round }` | Round begins |
| `round:vote` | `{ voterId: PlayerId }` | Someone voted (without revealing choice) |
| `round:revealed` | `{ round: Round, scoreDeltas: Record<PlayerId, number> }` | Vote closed, scores updated |
| `game:ended` | `{ finalScores: Record<PlayerId, number> }` | All rounds done |
| `error` | `{ code: string, message: string }` | Validation / state errors |

---

## 6. REST Endpoints

Used only for stateless / non-realtime operations.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness probe |
| `GET` | `/api/rooms/:code/exists` | Check if room exists (before joining) |

---

## 7. Game State Machine

```
              ┌─────────┐
              │  LOBBY  │ (waiting for ≥2 players)
              └────┬────┘
                   │ host: game:start
                   ▼
            ┌─────────────┐
            │ SUBMITTING  │ (players enter flags)
            └──────┬──────┘
                   │ all players have ≥min SELF flags AND host:game:start
                   ▼
            ┌─────────────┐
            │ GENERATING  │ (server calls LLM)
            └──────┬──────┘
                   │ LLM returns ordered flags
                   ▼
            ┌─────────────┐
            │  PLAYING    │ ← (loops through rounds)
            └──────┬──────┘
                   │ all rounds complete
                   ▼
            ┌────────────────┐
            │ FINAL_RESULTS  │
            └────────────────┘

Within PLAYING:
   PRESENTING → VOTING → REVEAL → SCOREBOARD → (next round or end)
```

---

## 8. LLM Integration

### When called
Once per game, during the `GENERATING` state, after all players have submitted their flags and the host clicks "Start Game."

### Model
`gpt-4o-mini` via OpenAI Chat Completions API with `response_format: { type: "json_object" }`.

### System Prompt
```
You are a game master for a multiplayer party game called "Red Flags."
Players have each submitted personal "red flags" (relationship dealbreakers,
quirky habits, or pet peeves). Your job is to:

1. Group these red flags into 3-7 fun, descriptive themes
   (e.g., "Communication Crimes", "Hygiene Horrors", "Texting Sins").
2. Order them so the game flows well: start with lighter, funnier flags,
   build to spicier/more dramatic ones, and intersperse themes for variety.
3. Avoid placing two flags about the same subject back-to-back.

You will receive an array of red flags with subject IDs.
Output ONLY valid JSON matching this schema:
{
  "themes": ["Theme 1", "Theme 2", ...],
  "orderedFlags": [
    { "flagId": "uuid", "theme": "Theme 1", "orderIndex": 0 },
    ...
  ]
}
```

### User Prompt Template
```
Here are the red flags:
[
  { "id": "<flag-id>", "subjectId": "<subject-id>", "text": "<flag-text>" },
  ...
]

There are <N> total red flags about <M> players.
Return the full ordering JSON.
(subjectId identifies whose flag it is — keep two flags about the same subject apart.)
```

### Cost Estimate
- ~20 players × ~10 flags = 200 flags
- Input: ~200 × 30 tokens ≈ 6k tokens → $0.0009
- Output: ~200 × 25 tokens ≈ 5k tokens → $0.003
- **Total per game: ~$0.004**

### Validation
Server validates LLM output with Zod schema. If invalid or missing flag IDs, fall back to random shuffle.

### Failure Modes
- Timeout (>20s) → fall back to random shuffle, log warning
- Rate limit → retry once with backoff, then fall back
- Invalid JSON → fall back to random shuffle

---

## 9. Implementation Phases

Each phase is independently testable. Complete one before starting the next.

### Phase 0: Project Scaffolding
**Goal:** Empty monorepo that installs cleanly and runs an empty server + empty React app.

**Tasks:**
- [ ] Initialize pnpm workspace at repo root
- [ ] Create `apps/web` with Vite + React + TypeScript template
- [ ] Create `apps/server` with Express + TypeScript
- [ ] Create `packages/shared` empty package
- [ ] Add Tailwind to `apps/web`
- [ ] Add scripts: `pnpm dev` runs both apps concurrently
- [ ] Add `.gitignore`, `.env.example`, root `README.md`
- [ ] Initialize git repo, first commit

**Acceptance:**
- `pnpm install` succeeds from root
- `pnpm dev` starts web at `localhost:5173` and server at `localhost:3001`
- Web page shows "Red Flags" placeholder
- `GET localhost:3001/health` returns `200 { ok: true }`

**Files created:**
```
package.json
pnpm-workspace.yaml
tsconfig.base.json
.gitignore
.env.example
README.md
apps/web/{package.json, vite.config.ts, tsconfig.json, index.html,
          src/main.tsx, src/App.tsx, src/index.css, tailwind.config.js,
          postcss.config.js}
apps/server/{package.json, tsconfig.json, src/index.ts}
packages/shared/{package.json, tsconfig.json, src/index.ts}
```

---

### Phase 1: Shared Types & Schemas
**Goal:** All types from Section 4 + 5 are defined and exported from `packages/shared`.

**Tasks:**
- [ ] Create `packages/shared/src/types.ts` with all interfaces from Section 4
- [ ] Create `packages/shared/src/events.ts` with all event payload types from Section 5
- [ ] Create `packages/shared/src/constants.ts` (min/max players, default settings)
- [ ] Create `packages/shared/src/schemas.ts` with Zod schemas for all inbound events
- [ ] Export everything from `packages/shared/src/index.ts`

**Acceptance:**
- Both `apps/web` and `apps/server` can `import { Player, Game, ... } from '@whose-flag/shared'`
- TypeScript builds without errors in all three packages

**Constants to define:**
```typescript
MIN_PLAYERS = 2
MAX_PLAYERS = 20
MIN_FLAGS_PER_PLAYER = 5
MAX_FLAGS_PER_PLAYER = 50
MAX_FLAGS_ASSIGNED_PER_TARGET = 5   // Optional call-outs: max flags one player may assign to each other player
MIN_FLAG_LENGTH = 3
MAX_FLAG_LENGTH = 200
MIN_NAME_LENGTH = 1
MAX_NAME_LENGTH = 20
ROOM_CODE_LENGTH = 4
ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ" // no I, O for clarity
DEFAULT_VOTING_SECONDS = 20
DEFAULT_POINTS_CORRECT = 100
DEFAULT_POINTS_FOOLED = 50
```

---

### Phase 2: Server — Room Management
**Goal:** In-memory room creation, joining, and basic socket connection handling.

**Tasks:**
- [ ] Install `socket.io`, `cors`, `zod`, `uuid`, `dotenv`
- [ ] Wire Socket.io to Express server
- [ ] Create `src/game/codeGenerator.ts` — generate unique 4-letter codes
- [ ] Create `src/game/GameRoom.ts` — class managing one room's state
- [ ] Create `src/game/roomManager.ts` — singleton holding all active rooms
- [ ] Create `src/socket/handlers.ts` — implement `room:create`, `room:join`, `room:rejoin`, `room:leave`
- [ ] Emit `game:updated`, `player:joined`, `player:left` correctly
- [ ] Validate all inbound payloads with Zod
- [ ] Add disconnect handling (mark player as disconnected, don't remove)

**Acceptance:**
- A node REPL or test script can:
  - Create a room and receive a code
  - Join with the code from another socket
  - See `player:joined` event
  - Disconnect and rejoin successfully

---

### Phase 3: Server — Flag Submission & Game Flow
**Goal:** Players can submit flags; host can start game; rounds advance.

**Tasks:**
- [ ] Implement `flags:submit` and `flags:import` handlers (self-flags; subjectId = author)
- [ ] Implement `settings:update` handler (host only, pre-game only)
- [ ] Create `src/game/GameEngine.ts` — round logic, scoring
- [ ] Implement `game:start` — validate min SELF flags per player, transition to GENERATING
- [ ] Implement `round:next`, `round:openVoting`, `round:reveal`, `vote:cast`
- [ ] `vote:cast` rules:
  - Block only the **author** of the flag from voting (`flag.authorId === voter`). The subject may vote.
  - Voters (including the subject) may pick any player, **including themselves** — the UI never disables self, so it can't leak the answer.
- [ ] Compute score deltas correctly on reveal (answer = `subjectId`):
  - Guess === subject → that voter gets +pointsForCorrectGuess (incl. a subject who recognises a call-out written about them)
  - Guess is wrong AND guess ≠ voter → the guessed player gets +pointsForFoolingOthers
  - Guess is wrong AND guess === voter → no points to anyone (a wrong self-vote is a harmless abstain; prevents fooling-point farming)
- [ ] Auto-close voting when timer expires
- [ ] Emit `round:started`, `round:vote`, `round:revealed`, `game:ended`

> **Note:** The `flags:assign` handler and the `authorId → subjectId` retrofit of scoring/voting land in **Phase 5.5** (added after the original Phase 3 shipped). The rules above are the final, canonical spec.

**Acceptance:**
- Full game playable via socket scripts: create → join → submit → start (without LLM yet, use shuffle) → vote → reveal → ... → end
- Scores are correct
- Bad actions (e.g., non-host calling `game:start`) return `error` event

---

### Phase 4: Server — LLM Integration
**Goal:** When host starts the game, server calls OpenAI to theme + order flags.

**Tasks:**
- [ ] Install `openai` SDK
- [ ] Create `src/llm/openai.ts` — client wrapper with API key from env
- [ ] Create `src/llm/prompts.ts` — system + user prompt templates
- [ ] Create `src/llm/questionGen.ts` — orchestrates: build prompt, call API, parse, validate
- [ ] Zod schema for `LlmOrderingResult`; fall back to shuffle on invalid output
- [ ] 20-second timeout; one retry on rate limit; fall back otherwise
- [ ] Call from `game:start` handler after flag submission complete
- [ ] Apply ordering to `Game.flags` (set `theme` and `orderIndex`)

**Acceptance:**
- Game with 5+ flags gets themed and ordered by LLM
- LLM unavailable → game still starts with random order, warning logged
- Invalid API key → clean error message in server logs

---

### Phase 5: Client — Home & Lobby Screens
**Goal:** Player can land, create/join room, see lobby with other players.

**Tasks:**
- [ ] Install `socket.io-client`, `zustand`, `react-router-dom`, `framer-motion`, `nanoid`
- [ ] Create `src/lib/socket.ts` — singleton socket connection
- [ ] Create `src/stores/gameStore.ts` — Zustand store mirroring server Game state
- [ ] Set up routing: `/`, `/lobby/:code`, `/submit-flags/:code`, `/game/:code`, `/results/:code`
- [ ] Build `Home.tsx`:
  - "Create Game" button → modal: enter name + pick avatar (emoji + color)
  - "Join Game" → enter code + name + avatar
- [ ] Build `Lobby.tsx`:
  - Big room code displayed
  - Share button (copies URL to clipboard)
  - Player grid showing avatars + names
  - Host sees "Start" button (disabled until ≥2 players)
  - Settings panel (host only): voting time, scoring weights
- [ ] Store player identity (`playerId`, `code`) in `localStorage` for reconnect
- [ ] Auto-rejoin on page load if localStorage has valid identity

**Acceptance:**
- Two browser windows can create + join a game
- Both see each other in the lobby
- Refresh a window → reconnects automatically
- Mobile viewport renders cleanly (test at 375px)

---

### Phase 5.5: Assigned Red Flags — Shared Types & Server Retrofit
**Goal:** Add the "call out other players" feature to the data model + server. Inserted after Phases 1–4 shipped, so it retrofits the already-committed shared/server code. Must land before the Phase 6 submit UI consumes it.

**Why a half-phase:** Phases 1–4 are committed. Rather than reopening them, this phase carries every change the feature needs in shared + server, leaving Phases 6–7 to be the client surface.

**Tasks:**
- [ ] `packages/shared`: add `subjectId: PlayerId` to `RedFlag` (self-flags: `subjectId === authorId`)
- [ ] `packages/shared`: add `MAX_FLAGS_ASSIGNED_PER_TARGET = 5` constant
- [ ] `packages/shared`: add `flags:assign` to `ClientToServerEvents` + `FlagsAssignPayload` + `FlagsAssignResponse`
- [ ] `packages/shared`: add `FlagsAssignSchema` (subjectId is a UUID, flags 1..5, each 3–200 chars)
- [ ] Server `makeFlag(text, authorId, subjectId)` — thread subjectId through
- [ ] Server `GameRoom`: split flag storage helpers
  - self-flags replace scope = flags where `authorId === subjectId === player`
  - assigned-flags replace scope = flags where `authorId === player && subjectId === target`
  - `allPlayersHaveMinFlags()` counts SELF flags only (assigned are bonus)
- [ ] Server `flags:assign` handler: validate subject is a real player and ≠ author; cap at 5; status must be SUBMITTING; emit `game:updated`
- [ ] Server `vote:cast`: **no change needed** — it already blocks `flag.authorId === voter` (author-only) and never guards `guess === voter` (self-pick already allowed). Just confirm; do NOT switch the block to `subjectId`.
- [ ] Server scoring (`computeScoreDeltas`): answer = `subjectId`; correct → voter; wrong & guess ≠ voter → guessed player gets fooling; wrong & guess === voter → nobody (this guard is the one real change to existing scoring)
- [ ] LLM `prompts.ts`: send `subjectId` (not authorId); ask to keep same-subject flags apart
- [ ] Update `test-phase3.ts` (or add `test-phase5_5.ts`): cover an assigned flag + a subject self-scoring + a wrong self-vote awarding nobody

**Acceptance:**
- A player can assign ≤5 flags to another player; assigning to self / a non-player / a 6th flag is rejected
- An assigned flag plays identically to a self-flag from the voter's view
- Author of a flag cannot vote on it; subject can, and scores if they pick themselves correctly
- A wrong self-vote awards no points to anyone
- LLM ordering keeps two flags about the same subject apart (best-effort)

---

### Phase 6: Client — Submit Flags Screen
**Goal:** Players add their own red flags, and optionally plant flags on other players.

**Tasks:**
- [ ] Build `SubmitFlags.tsx`:
  - Two sections: **"Your Red Flags"** (required) and **"Call Out Others"** (optional)
  - Your section: input + "Add" button, list with remove, counter "X / 5 minimum, X / 50 max"
  - "Import from file" button → opens file picker (.txt) — your own flags only
  - Call-out section: pick a player → add up to 5 flags for them, counter "X / 5", remove buttons
  - Make clear call-outs are optional and stay hidden from the target
- [ ] Build `lib/fileImport.ts` — parse .txt, one flag per line, trim, dedupe
- [ ] Wire `flags:submit` / `flags:import` (self) and `flags:assign` (per target)
- [ ] Show submission progress of other players (SELF-flag count, not content; call-outs not surfaced)
- [ ] "Ready" button appears at minimum SELF count
- [ ] Show waiting state when player is ready but others aren't
- [ ] Host sees "Start Game" button when all players ready

**Acceptance:**
- Player can add their own flags one by one and import a .txt with 10+ flags
- Player can assign up to 5 flags to another player; the UI blocks a 6th and blocks assigning to self
- Other players' SELF progress count updates live; call-outs are not revealed in the UI
- Can't proceed below min SELF count

---

### Phase 7: Client — Game Screen
**Goal:** Active gameplay — see flag, vote, see reveal, see scoreboard.

**Tasks:**
- [ ] Build `Game.tsx` with sub-views for each `RoundStatus`:
  - `<PresentingView>` — big red flag card, theme banner, "Reveal Votes" disabled
  - `<VotingView>` — flag card + grid of player avatars to vote, timer countdown
  - `<RevealView>` — show who voted for whom (animated bars), highlight the **subject** (correct answer); for assigned flags, also reveal the author ("…and {author} planted it 👀")
  - `<ScoreboardView>` — leaderboard with score deltas (animated +100, etc.)
- [ ] Host-only "Next" / "Open Voting" / "Reveal" buttons (others see "Waiting for host…")
- [ ] Voting panel: disable voting entirely if **you authored** this flag ("You wrote this one"); otherwise enable every avatar **including your own** (never disable self — it would leak the answer)
- [ ] Use Framer Motion for card flips, score number animations, vote tally bars
- [ ] Show round counter (e.g., "Round 5 of 23")

**Acceptance:**
- Game playable end-to-end on mobile
- Animations feel snappy (not slow)
- Host controls work; non-host can't accidentally advance
- Author of a flag can't vote; everyone else can, self-pick allowed
- Reveal shows the subject (answer), the voter breakdown, and the author for assigned flags

---

### Phase 8: Client — Final Results Screen
**Goal:** End-of-game scoreboard with celebration.

**Tasks:**
- [ ] Build `Results.tsx`:
  - Podium for top 3 (animated entrance)
  - Full ranked list below
  - Confetti animation for winner
  - "Play Again" button (host) — resets game keeping same players
  - "New Game" button — leaves room, back to home
- [ ] Handle "Play Again" on server: clear flags + scores, transition to SUBMITTING

**Acceptance:**
- Winner is correctly highlighted
- Confetti fires once
- Play Again works without leaving lobby

---

### Phase 9: Polish
**Goal:** Game feels finished.

**Tasks:**
- [ ] PWA manifest + icons + service worker (Vite PWA plugin)
- [ ] Sound effects: vote cast, reveal, score increment, winner
- [ ] Haptic feedback on mobile (vibrate API on vote, reveal)
- [ ] Error boundaries on all routes
- [ ] Loading states for LLM generation step ("Shuffling the deck…")
- [ ] Empty/edge states (1 player tries to start, etc.)
- [ ] Accessibility pass: keyboard nav, ARIA labels, contrast check
- [ ] Test on iOS Safari, Android Chrome, desktop browsers

**Acceptance:**
- Lighthouse PWA score ≥90
- Manual playtest with 3 friends goes smoothly
- No console errors in production build

---

### Phase 10: Deployment
**Goal:** Live URL anyone can play at.

**Tasks:**
- [ ] Deploy `apps/server` to Railway
  - Set `OPENAI_API_KEY` env var
  - Set `CORS_ORIGIN` env var to web URL
  - Note the public URL
- [ ] Deploy `apps/web` to Vercel
  - Set `VITE_SOCKET_URL` to Railway URL
  - Configure as Vite project
- [ ] Test full flow on live URLs
- [ ] Add custom domain (optional)
- [ ] Set up uptime monitoring (UptimeRobot free tier)

**Acceptance:**
- Two strangers on different networks can play a full game
- Latency feels acceptable (<500ms vote-to-reveal)
- OpenAI calls succeed in production

---

## 10. Directory Structure (Final)

```
whose-flag-is-it-anyway/
├── IMPLEMENTATION_PLAN.md         ← this file
├── TODO.md                        ← live progress tracker
├── HAIKU_PROMPT.md                ← agent kickoff prompt
├── README.md
├── package.json                   ← workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .gitignore
├── .env.example
├── .nvmrc
│
├── apps/
│   ├── web/
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   ├── tailwind.config.js
│   │   ├── postcss.config.js
│   │   ├── index.html
│   │   ├── public/
│   │   │   ├── manifest.json
│   │   │   └── icons/
│   │   └── src/
│   │       ├── main.tsx
│   │       ├── App.tsx
│   │       ├── index.css
│   │       ├── routes/
│   │       │   ├── Home.tsx
│   │       │   ├── Lobby.tsx
│   │       │   ├── SubmitFlags.tsx
│   │       │   ├── Game.tsx
│   │       │   └── Results.tsx
│   │       ├── components/
│   │       │   ├── ui/
│   │       │   │   ├── Button.tsx
│   │       │   │   ├── Input.tsx
│   │       │   │   └── Modal.tsx
│   │       │   ├── RedFlagCard.tsx
│   │       │   ├── VotingPanel.tsx
│   │       │   ├── PlayerAvatar.tsx
│   │       │   ├── Scoreboard.tsx
│   │       │   ├── RoundResults.tsx
│   │       │   └── Timer.tsx
│   │       ├── hooks/
│   │       │   ├── useGameSocket.ts
│   │       │   └── usePersistedIdentity.ts
│   │       ├── stores/
│   │       │   └── gameStore.ts
│   │       ├── lib/
│   │       │   ├── socket.ts
│   │       │   ├── fileImport.ts
│   │       │   ├── avatars.ts
│   │       │   └── sounds.ts
│   │       └── types/
│   │           └── env.d.ts
│   │
│   └── server/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           ├── socket/
│           │   └── handlers.ts
│           ├── game/
│           │   ├── GameRoom.ts
│           │   ├── GameEngine.ts
│           │   ├── roomManager.ts
│           │   └── codeGenerator.ts
│           ├── llm/
│           │   ├── openai.ts
│           │   ├── prompts.ts
│           │   └── questionGen.ts
│           ├── routes/
│           │   ├── health.ts
│           │   └── rooms.ts
│           └── utils/
│               └── logger.ts
│
├── packages/
│   └── shared/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           ├── types.ts
│           ├── events.ts
│           ├── constants.ts
│           └── schemas.ts
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── GAME_FLOW.md
│   └── DEPLOYMENT.md
│
└── scripts/
    └── dev.sh
```

---

## 11. Environment Variables

### `.env.example`
```
# Server
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173

# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# Web (prefix VITE_)
VITE_SOCKET_URL=http://localhost:3001
```

---

## 12. Testing Strategy

**Unit tests (Vitest):**
- `GameEngine.computeScores()` — all scoring edge cases
- `codeGenerator.generate()` — uniqueness, charset
- `fileImport.parse()` — happy + malformed
- LLM output validation

**Integration tests:**
- Full game flow via socket.io-client harness in `apps/server/tests/`
- Reconnect during voting phase
- Host disconnects → game pauses

**Manual playtest checklist** (before deployment):
- [ ] 2-player game
- [ ] 8-player game
- [ ] Player joins mid-lobby
- [ ] Player disconnects mid-vote
- [ ] Host disconnects mid-vote
- [ ] LLM fails (test with invalid key)
- [ ] File import with 50 flags
- [ ] Play Again works
- [ ] Mobile Safari, Android Chrome

---

## 13. Resolved Design Decisions

1. **Branding** — ✅ **"Whose Flag Is It Anyway?"** (folder: `whose-flag-is-it-anyway`)
2. **Visual style** — ✅ **Loud Jackbox-style** — chunky drop-shadowed buttons, oversized type, springy framer-motion animations, bold saturated colors, playful emoji-driven UI
3. **Color palette** — Red/pink primary accents, with a yellow/blue secondary for contrast. Final palette tokens to be set in Phase 5 with Tailwind theme config.
4. **Theme mode** — ✅ **User-toggleable dark mode** (toggle in lobby + persisted to localStorage). Default = system preference.
5. **Profanity filter** — ✅ **None.** No filtering on player submissions or LLM output — game is friends-only by design.
6. **Avatars** — ✅ **Emoji + color combos for MVP.** Curated emoji set + ~12 bright background colors. Custom avatars/characters out of scope.
7. **Adult content warning** — Not needed; users opt in by joining a game with friends.

---

## 14. Handoff Notes for Haiku (Executing Agent)

When implementing each phase:
1. **Do not deviate from the file structure** above without asking
2. **Use exact type names** from Section 4 — do not rename
3. **Use exact event names** from Section 5 — do not rename
4. **If a task is ambiguous, ask** rather than guessing
5. **Run `pnpm build` after each phase** — must pass before moving on
6. **Commit at each phase boundary** with message `feat(phase-N): <description>`
7. **Do not install additional dependencies** not listed in Section 2 without asking
8. **Mobile-first CSS** — write Tailwind classes for mobile, then `md:` for desktop
9. **No `any` types** — use `unknown` if truly unknown, then narrow

---

**End of plan. Review with stakeholder before Phase 0.**
