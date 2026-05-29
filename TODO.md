# Whose Flag Is It Anyway? — Build Progress

> **Active phase:** Phase 6 (in progress)
> **Last updated:** 2026-05-29
> **Updated by:** Claude Sonnet 4.6

> **Feature added 2026-05-29:** Assigned red flags ("call out other players"). A flag now has an `authorId` (who wrote it) and a `subjectId` (whose flag it is = the voting answer). Self-flags have `subjectId === authorId`. See `IMPLEMENTATION_PLAN.md` §1, §4, §5, §8, §9 Phase 5.5. Scoring rule: answer = subject; only the author is blocked from voting; the subject may vote and scores if they correctly pick themselves; a wrong self-vote awards nobody.

This file tracks implementation progress for `IMPLEMENTATION_PLAN.md`. The executing agent must update this file at the start and end of every task. Do not skip ahead; do not work on multiple phases simultaneously.

---

## Legend

- [ ] = Not started
- [~] = In progress (only one task at a time should be `[~]`)
- [x] = Complete
- [!] = Blocked (add a `↳ blocker: <reason>` note below the line)

---

## Pre-flight Decisions (All Resolved ✅)

- [x] Visual style: **Loud Jackbox-style** — bold colors, big type, playful animations, lots of motion
- [x] Final game name: **"Whose Flag Is It Anyway?"** (folder: `whose-flag-is-it-anyway`, package scope: `@whose-flag/*`)
- [x] Dark mode: **User-toggleable** (toggle in lobby; default = system preference; persisted to localStorage)
- [x] Profanity filter on LLM output: **None** — friends-only game, no filtering
- [x] Custom avatars beyond emoji + color: **No (MVP: curated emoji + ~12 bright bg colors)**

All preflight decisions resolved. Proceed to Phase 0.

---

## Phase 0 — Project Scaffolding

> **Goal:** Empty monorepo that installs cleanly and runs an empty server + empty React app.
> **Phase status:** Complete
> **Commit message when done:** `feat(phase-0): project scaffolding`

### Tasks

- [x] Initialize git repo
- [x] Create root `package.json` (private, workspaces enabled)
- [x] Create `pnpm-workspace.yaml`
- [x] Create `tsconfig.base.json`
- [x] Create root `.gitignore` (node_modules, dist, .env, .DS_Store)
- [x] Create `.env.example` (see Plan §11)
- [x] Create root `README.md`
- [x] Create `.nvmrc` pinning Node 20
- [x] Scaffold `apps/web` with Vite + React + TypeScript
- [x] Install + configure Tailwind in `apps/web`
- [x] Scaffold `apps/server` (Express + TypeScript + tsx for dev)
- [x] Scaffold `packages/shared` (TS library, no runtime deps yet)
- [x] Wire `apps/web` and `apps/server` to depend on `@whose-flag/shared`
- [x] Add concurrent dev script at root (`pnpm dev` runs both apps)
- [x] Verify: `pnpm install` from root succeeds
- [x] Verify: `pnpm dev` boots both
- [x] Verify: `localhost:5173` shows "Red Flags" placeholder
- [x] Verify: `GET localhost:3001/health` → `200 { ok: true }`
- [x] Commit

### Notes
_(executor adds notes here as needed)_

---

## Phase 1 — Shared Types & Schemas

> **Goal:** All types from Plan §4 + §5 defined and exported from `packages/shared`.
> **Phase status:** Complete
> **Commit message when done:** `feat(phase-1): shared types and schemas`

### Tasks

- [x] Create `packages/shared/src/types.ts` with **all** interfaces from Plan §4 verbatim
- [x] Create `packages/shared/src/events.ts` with payload types from Plan §5
- [x] Create `packages/shared/src/constants.ts` with values from Plan §9 Phase 1
- [x] Install `zod` in `packages/shared`
- [x] Create `packages/shared/src/schemas.ts` — Zod schemas for every inbound socket event
- [x] Re-export everything from `packages/shared/src/index.ts`
- [x] Verify: `pnpm -r build` passes
- [x] Verify: `import { Player, Game, GameSettings } from '@whose-flag/shared'` works in both apps
- [x] Commit

### Notes

---

## Phase 2 — Server: Room Management

> **Goal:** In-memory room creation, joining, reconnection via Socket.io.
> **Phase status:** Complete
> **Commit message when done:** `feat(phase-2): server room management`

### Tasks

- [x] Install in `apps/server`: `socket.io`, `cors`, `uuid`, `dotenv`
- [x] Wire Socket.io to Express
- [x] Add CORS config reading `CORS_ORIGIN` env
- [x] Create `src/utils/logger.ts` (basic console wrapper)
- [x] Create `src/game/codeGenerator.ts` — generate unique 4-letter codes (charset from constants)
- [x] Create `src/game/GameRoom.ts` — class wrapping one Game's mutable state
- [x] Create `src/game/roomManager.ts` — singleton Map<RoomCode, GameRoom>
- [x] Create `src/socket/handlers.ts` — register all socket handlers
- [x] Implement `room:create` (with validation)
- [x] Implement `room:join` (validates room exists, name uniqueness, max players)
- [x] Implement `room:rejoin` (matches by playerId from localStorage)
- [x] Implement `room:leave`
- [x] Disconnect handling: mark `isConnected: false`, do not remove player
- [x] Emit `game:updated` on any state change
- [x] Emit `player:joined`, `player:left`, `player:reconnected`
- [x] Validate every inbound payload with Zod, emit `error` on failure
- [x] Verify: write a manual socket.io-client script that creates + joins + rejoins
- [x] Commit

### Notes

---

## Phase 3 — Server: Flag Submission & Game Flow

> **Goal:** Players submit flags; host starts game; rounds advance; scoring works.
> **Phase status:** Complete
> **Commit message when done:** `feat(phase-3): server flag submission and round flow`

### Tasks

- [x] Implement `flags:submit` (validate length, count, store on Player)
- [x] Implement `flags:import` (parse text body, one flag per line, trim/dedupe)
- [x] Implement `settings:update` (host only, lobby state only)
- [x] Create `src/game/GameEngine.ts` with pure functions:
  - [x] `computeScoreDeltas(round, flags)` → `Record<PlayerId, number>`
  - [x] `nextRoundIndex(game)` → number | null
  - [x] `randomShuffleFlags(flags)` → ordered list (fallback when LLM off)
- [x] Implement `game:start` (host only; min players; min flags/player; transition LOBBY→SUBMITTING or SUBMITTING→GENERATING)
- [x] Implement `round:next` (host; advances round, sets status PRESENTING)
- [x] Implement `round:openVoting` (host; status → VOTING; sets `votingEndsAt`)
- [x] Implement `vote:cast` (only during VOTING; can't vote own flag; overwrites prior vote)
- [x] Implement `round:reveal` (host or auto on timer; computes deltas, updates scores, status → REVEAL)
- [x] Auto-reveal timer using `setTimeout` when voting opens
- [x] After last round → emit `game:ended`, status → FINAL_RESULTS
- [x] Emit all server→client events from Plan §5
- [x] Verify: scoring matches Plan §9 Phase 3 (correct guess + fool bonus)
- [x] Verify: full game playable via socket script with shuffle (no LLM yet)
- [x] Commit

### Notes

---

## Phase 4 — Server: LLM Integration

> **Goal:** OpenAI orders + themes flags when game starts.
> **Phase status:** Complete
> **Commit message when done:** `feat(phase-4): openai flag ordering`

### Tasks

- [x] Install `openai` SDK in `apps/server`
- [x] Create `src/llm/openai.ts` — singleton OpenAI client reading `OPENAI_API_KEY`
- [x] Create `src/llm/prompts.ts` — `SYSTEM_PROMPT` constant + `buildUserPrompt(flags)` fn
- [x] Create `src/llm/questionGen.ts` — `orderFlags(flags): Promise<LlmOrderingResult>`
- [x] Zod schema for `LlmOrderingResult` in `packages/shared/src/schemas.ts`
- [x] On call: `response_format: { type: 'json_object' }`, model from env
- [x] 20-second timeout via `AbortController`
- [x] One retry on rate-limit (exponential backoff: 2s)
- [x] On any failure → fall back to `randomShuffleFlags`, log warning
- [x] Call from `game:start` handler when transitioning to GENERATING
- [x] Apply ordering: set `theme` and `orderIndex` on each `RedFlag`
- [x] Build `Game.rounds` from ordered flags before transitioning to PLAYING
- [ ] Verify: with valid `OPENAI_API_KEY`, flags get themed (needs real key — skip to Phase 5, verify during Phase 10 deployment)
- [x] Verify: with invalid key, game still starts with shuffle, warning logged
- [x] Commit

### Notes

Static analysis fix: `FlagsImportSchema` text max was `MAX_FLAG_LENGTH * MAX_FLAGS_PER_PLAYER + MAX_PLAYERS` (10020), too small by 29 chars for a max-size import. Fixed to `(MAX_FLAG_LENGTH + 1) * MAX_FLAGS_PER_PLAYER` (10050).
Valid-key LLM path deferred to Phase 10 deployment verification (no `OPENAI_API_KEY` in local env).

---

## Phase 5 — Client: Home & Lobby

> **Goal:** Create/join room, see lobby with avatars.
> **Phase status:** Complete
> **Commit message when done:** `feat(phase-5): home and lobby screens`

### Tasks

- [x] Install client deps: `socket.io-client`, `zustand`, `react-router-dom`, `framer-motion`, `nanoid`
- [x] Create `src/lib/socket.ts` — singleton socket connection (lazy connect)
- [x] Create `src/lib/avatars.ts` — emoji list + color palette (loud, bright)
- [x] Create `src/stores/gameStore.ts` — Zustand store with `game`, `playerId`, `setGame`, etc.
- [x] Create `src/hooks/useGameSocket.ts` — subscribes store to socket events
- [x] Create `src/hooks/usePersistedIdentity.ts` — read/write `playerId`+`code` to localStorage
- [x] Set up React Router with all 5 routes
- [x] Build `src/components/ui/Button.tsx` (loud Jackbox: chunky, drop-shadowed, springy hover)
- [x] Build `src/components/ui/Input.tsx` (bold border, large text)
- [x] Build `src/components/PlayerAvatar.tsx` (emoji on colored circle, big)
- [x] Build `routes/Home.tsx`:
  - [x] Giant animated title with rotating flag emoji
  - [x] "Create Game" → modal: name input + avatar picker (emoji + color grid)
  - [x] "Join Game" → input code (auto-uppercase) + name + avatar
- [x] Build `routes/Lobby.tsx`:
  - [x] Massive room code at top
  - [x] Copy-link button (writes share URL to clipboard)
  - [x] Player grid (avatars bouncing in on join via AnimatePresence)
  - [x] Settings drawer (host only)
  - [x] "START GAME" button (host, disabled until 2+ players)
- [x] Persist identity to localStorage on join
- [x] On `App` mount: if identity exists, attempt rejoin
- [x] Verify: two windows can create + join
- [x] Verify: refresh mid-lobby reconnects with same identity
- [x] Verify: looks good at 375px mobile width
- [x] Commit

### Notes

Also fixed server bug: `room:create`, `room:join`, `room:rejoin` handlers now always call `cb()` on error (using `fail()`) so the client acknowledgement never hangs.

---

## Phase 5.5 — Feature: Assigned Red Flags (shared + server retrofit)

> **Goal:** Add the "call out other players" feature to the data model + server, retrofitting the already-committed shared/server code from Phases 1–4. Must land before the Phase 6 submit UI.
> **Phase status:** Complete
> **Commit message when done:** `feat(phase-5.5): assigned red flags (schema + server)`

### Tasks

- [x] `packages/shared/src/types.ts`: add `subjectId: PlayerId` to `RedFlag`
- [x] `packages/shared/src/constants.ts`: add `MAX_FLAGS_ASSIGNED_PER_TARGET = 5`
- [x] `packages/shared/src/events.ts`: add `flags:assign` event + `FlagsAssignPayload` + `FlagsAssignResponse`
- [x] `packages/shared/src/schemas.ts`: add `FlagsAssignSchema` (subjectId uuid; flags 1..5; each 3–200 chars, trimmed)
- [x] Server `GameEngine.makeFlag(text, authorId, subjectId)` — thread subjectId through
- [x] Server `GameRoom`: scope self-flag replacement to `authorId === subjectId === player`; add assigned-flag set scoped to `(author, target)`; `allPlayersHaveMinFlags()` counts SELF flags only
- [x] Server `flags:submit` / `flags:import`: pass `playerId` as subjectId (self)
- [x] Server `flags:assign` handler: SUBMITTING only; subject must be a real player and ≠ author; cap 5; emit `game:updated`
- [x] Server `vote:cast`: **already correct, verify only** — it blocks `flag.authorId === voter` (author-only) and has no self-pick guard, which is exactly the new rule. Do NOT change the block to `subjectId`.
- [x] Server `computeScoreDeltas`: answer = `subjectId`; correct → voter; wrong & guess ≠ voter → guessed player; wrong & guess === voter → nobody (the only behavioral change to existing scoring)
- [x] Server `llm/prompts.ts`: send `subjectId` (not authorId); keep same-subject flags apart
- [x] Update/extend the socket test script: assigned flag + subject self-scores + wrong self-vote awards nobody
- [x] Verify: `pnpm -r typecheck` + `pnpm -r build` pass
- [x] Verify: assigning to self / non-player / a 6th flag is rejected
- [x] Verify: author can't vote; subject can and scores on a correct self-pick; wrong self-vote = no points
- [x] Commit

### Notes

_(executor adds notes here as needed)_

---

## Phase 6 — Client: Submit Flags Screen

> **Goal:** Players add / import their own red flags, and optionally plant flags on other players.
> **Phase status:** Not started
> **Commit message when done:** `feat(phase-6): submit flags screen`

### Tasks

- [ ] Build `routes/SubmitFlags.tsx`:
  - [ ] **"Your Red Flags"** section (required): big input field + "ADD" button
  - [ ] List of own flags with delete buttons (animated entry/exit)
  - [ ] Counter chip: "5 / 5 ✓" (green when ≥min)
  - [ ] **"Call Out Others"** section (optional): pick a player → add up to 5 flags for them, "X / 5" counter, remove buttons; copy makes clear it's hidden from the target
  - [ ] Wire `flags:assign` per target; block a 6th flag and block assigning to self
  - [ ] "Import .txt" button → file picker (own flags only)
  - [ ] "READY" button (active at min SELF count, disabled below)
  - [ ] Live progress sidebar/bar showing other players' SELF counts (call-outs not surfaced)
- [ ] Create `src/lib/fileImport.ts` — parse, trim, dedupe, validate length
- [ ] Wire to `flags:submit`, `flags:import`, and `flags:assign` socket events
- [ ] When all players ready, host sees "START GAME" override
- [ ] Show loading state "Shuffling the deck…" during GENERATING
- [ ] Verify: typed entry works
- [ ] Verify: file import accepts a 10-line `.txt`
- [ ] Verify: can assign up to 5 flags to another player; 6th and self-assign blocked
- [ ] Verify: cannot ready below minimum
- [ ] Commit

### Notes

---

## Phase 7 — Client: Game Screen

> **Goal:** Active gameplay with all 4 round sub-states.
> **Phase status:** Not started
> **Commit message when done:** `feat(phase-7): active game screen`

### Tasks

- [ ] Build `components/RedFlagCard.tsx` — bold card, theme banner above
- [ ] Build `components/Timer.tsx` — countdown ring/bar, pulses when low
- [ ] Build `components/VotingPanel.tsx` — grid of player avatars; if YOU authored the flag the whole panel is disabled ("You wrote this one"); otherwise every avatar is enabled **including your own** (never disable self — it would leak the answer)
- [ ] Build `components/RoundResults.tsx` — animated vote bars; highlight the **subject** (correct answer); for assigned flags also reveal the author ("…and {author} planted it 👀")
- [ ] Build `components/Scoreboard.tsx` — sorted list with animated `+100` deltas
- [ ] Build `routes/Game.tsx` — switches sub-view by `currentRound.status`:
  - [ ] PRESENTING: card with reveal animation, host sees "OPEN VOTING"
  - [ ] VOTING: card + voting panel + timer
  - [ ] REVEAL: vote breakdown + correct answer
  - [ ] SCOREBOARD: leaderboard with deltas, host sees "NEXT FLAG"
- [ ] Host-only controls; non-host shows "Waiting for host…"
- [ ] Round counter ("Round 5 / 23")
- [ ] Framer Motion transitions between sub-views
- [ ] Sound hook stub (`src/lib/sounds.ts`) — call for vote / reveal / score / win
- [ ] Verify: end-to-end playable on mobile
- [ ] Verify: author of a flag cannot vote; everyone else can, self-pick allowed
- [ ] Verify: reveal shows the subject as the answer + the author for assigned flags
- [ ] Verify: host controls disabled when not allowed
- [ ] Commit

### Notes

---

## Phase 8 — Client: Final Results

> **Goal:** End-of-game celebration screen.
> **Phase status:** Not started
> **Commit message when done:** `feat(phase-8): final results screen`

### Tasks

- [ ] Build `routes/Results.tsx`:
  - [ ] Top 3 podium with staggered entrance
  - [ ] Full ranked list below
  - [ ] Confetti for #1 (use `canvas-confetti` or framer)
  - [ ] "PLAY AGAIN" (host) — resets game, returns to SUBMITTING
  - [ ] "BACK TO HOME" — leaves room
- [ ] Server: handle `game:playAgain` event — keep players, clear flags/scores/rounds
- [ ] Add to shared events + schemas
- [ ] Verify: winner correct
- [ ] Verify: confetti fires once
- [ ] Verify: Play Again keeps lobby intact
- [ ] Commit

### Notes

---

## Phase 9 — Polish

> **Goal:** Feel finished and "Jackbox loud."
> **Phase status:** Not started
> **Commit message when done:** `feat(phase-9): polish, pwa, sounds`

### Tasks

- [ ] Vite PWA plugin: manifest + icons + service worker
- [ ] Generate icons (192, 512) — bold red-flag motif
- [ ] Implement `src/lib/sounds.ts` with real audio (CC0 SFX)
- [ ] Haptic feedback on vote + reveal (`navigator.vibrate`)
- [ ] Error boundaries on every route
- [ ] Loading states: "Shuffling the deck…", "Waiting for players…", "Reconnecting…"
- [ ] Empty/edge: single player can't start, etc.
- [ ] Accessibility pass: keyboard nav, ARIA, contrast (test with `axe`)
- [ ] Test devices: iOS Safari, Android Chrome, desktop Chrome/Firefox
- [ ] Lighthouse PWA ≥ 90
- [ ] No console errors in `pnpm build` preview
- [ ] Commit

### Notes

---

## Phase 10 — Deployment

> **Goal:** Live and playable from anywhere.
> **Phase status:** Not started
> **Commit message when done:** `chore(phase-10): production deployment`

### Tasks

- [ ] Deploy `apps/server` to Railway
  - [ ] Set `OPENAI_API_KEY`
  - [ ] Set `CORS_ORIGIN` to web URL
  - [ ] Set `NODE_ENV=production`
- [ ] Deploy `apps/web` to Vercel
  - [ ] Set `VITE_SOCKET_URL` to Railway URL
- [ ] End-to-end smoke test on production
- [ ] (Optional) Custom domain
- [ ] (Optional) UptimeRobot monitor
- [ ] Update `README.md` with live URL
- [ ] Commit

### Notes

---

## Global Blockers

_(executor lists anything blocking forward progress; user reviews)_

—
