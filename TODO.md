# Whose Flag Is It Anyway? — Build Progress

> **Active phase:** Phase 3 (in progress)
> **Last updated:** 2026-05-22
> **Updated by:** Claude Sonnet 4.6

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
- [~] Commit

### Notes

---

## Phase 4 — Server: LLM Integration

> **Goal:** OpenAI orders + themes flags when game starts.
> **Phase status:** Not started
> **Commit message when done:** `feat(phase-4): openai flag ordering`

### Tasks

- [ ] Install `openai` SDK in `apps/server`
- [ ] Create `src/llm/openai.ts` — singleton OpenAI client reading `OPENAI_API_KEY`
- [ ] Create `src/llm/prompts.ts` — `SYSTEM_PROMPT` constant + `buildUserPrompt(flags)` fn
- [ ] Create `src/llm/questionGen.ts` — `orderFlags(flags): Promise<LlmOrderingResult>`
- [ ] Zod schema for `LlmOrderingResult` in `packages/shared/src/schemas.ts`
- [ ] On call: `response_format: { type: 'json_object' }`, model from env
- [ ] 20-second timeout via `AbortController`
- [ ] One retry on rate-limit (exponential backoff: 2s)
- [ ] On any failure → fall back to `randomShuffleFlags`, log warning
- [ ] Call from `game:start` handler when transitioning to GENERATING
- [ ] Apply ordering: set `theme` and `orderIndex` on each `RedFlag`
- [ ] Build `Game.rounds` from ordered flags before transitioning to PLAYING
- [ ] Verify: with valid `OPENAI_API_KEY`, flags get themed
- [ ] Verify: with invalid key, game still starts with shuffle, warning logged
- [ ] Commit

### Notes

---

## Phase 5 — Client: Home & Lobby

> **Goal:** Create/join room, see lobby with avatars.
> **Phase status:** Not started
> **Commit message when done:** `feat(phase-5): home and lobby screens`

### Tasks

- [ ] Install client deps: `socket.io-client`, `zustand`, `react-router-dom`, `framer-motion`, `nanoid`
- [ ] Create `src/lib/socket.ts` — singleton socket connection (lazy connect)
- [ ] Create `src/lib/avatars.ts` — emoji list + color palette (loud, bright)
- [ ] Create `src/stores/gameStore.ts` — Zustand store with `game`, `playerId`, `setGame`, etc.
- [ ] Create `src/hooks/useGameSocket.ts` — subscribes store to socket events
- [ ] Create `src/hooks/usePersistedIdentity.ts` — read/write `playerId`+`code` to localStorage
- [ ] Set up React Router with all 5 routes
- [ ] Build `src/components/ui/Button.tsx` (loud Jackbox: chunky, drop-shadowed, springy hover)
- [ ] Build `src/components/ui/Input.tsx` (bold border, large text)
- [ ] Build `src/components/PlayerAvatar.tsx` (emoji on colored circle, big)
- [ ] Build `routes/Home.tsx`:
  - [ ] Giant animated title "RED FLAGS" (rotating/bouncing emojis)
  - [ ] "Create Game" → modal: name input + avatar picker (emoji + color grid)
  - [ ] "Join Game" → input code (auto-uppercase) + name + avatar
- [ ] Build `routes/Lobby.tsx`:
  - [ ] Massive room code at top
  - [ ] Copy-link button (writes share URL to clipboard)
  - [ ] Player grid (avatars bouncing in on join)
  - [ ] Settings drawer (host only)
  - [ ] "START GAME" button (host, disabled until 2+ players)
- [ ] Persist identity to localStorage on join
- [ ] On `App` mount: if identity exists, attempt rejoin
- [ ] Verify: two windows can create + join
- [ ] Verify: refresh mid-lobby reconnects with same identity
- [ ] Verify: looks good at 375px mobile width
- [ ] Commit

### Notes

---

## Phase 6 — Client: Submit Flags Screen

> **Goal:** Players add / import their red flags.
> **Phase status:** Not started
> **Commit message when done:** `feat(phase-6): submit flags screen`

### Tasks

- [ ] Build `routes/SubmitFlags.tsx`:
  - [ ] Big input field + "ADD" button
  - [ ] List of own flags with delete buttons (animated entry/exit)
  - [ ] Counter chip: "5 / 5 ✓" (green when ≥min)
  - [ ] "Import .txt" button → file picker
  - [ ] "READY" button (active at min, disabled below)
  - [ ] Live progress sidebar/bar showing other players' counts
- [ ] Create `src/lib/fileImport.ts` — parse, trim, dedupe, validate length
- [ ] Wire to `flags:submit` and `flags:import` socket events
- [ ] When all players ready, host sees "START GAME" override
- [ ] Show loading state "Shuffling the deck…" during GENERATING
- [ ] Verify: typed entry works
- [ ] Verify: file import accepts a 10-line `.txt`
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
- [ ] Build `components/VotingPanel.tsx` — grid of player avatars, disabled = self
- [ ] Build `components/RoundResults.tsx` — animated vote bars, correct author highlight
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
- [ ] Verify: cannot vote for own flag
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
