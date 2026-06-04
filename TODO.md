# Whose Flag Is It Anyway? — Build Progress

> **Active phase:** Phase 10 (not started)
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
> **Phase status:** Complete
> **Commit message when done:** `feat(phase-6): submit flags screen`

### Tasks

- [x] Build `routes/SubmitFlags.tsx`:
  - [x] **"Your Red Flags"** section (required): big input field + "ADD" button
  - [x] List of own flags with delete buttons (animated entry/exit)
  - [x] Counter chip: "5 / 5 ✓" (green when ≥min)
  - [x] **"Call Out Others"** section (optional): pick a player → add up to 5 flags for them, "X / 5" counter, remove buttons; copy makes clear it's hidden from the target
  - [x] Wire `flags:assign` per target; block a 6th flag and block assigning to self
  - [x] "Import .txt" button → file picker (own flags only)
  - [x] "READY" button (active at min SELF count, disabled below)
  - [x] Live progress sidebar/bar showing other players' SELF counts (call-outs not surfaced)
- [x] Create `src/lib/fileImport.ts` — parse, trim, dedupe, validate length
- [x] Wire to `flags:submit`, `flags:import`, and `flags:assign` socket events
- [x] When all players ready, host sees "START GAME" override
- [x] Show loading state "Shuffling the deck…" during GENERATING
- [x] Verify: typed entry works
- [ ] Verify: file import accepts a 10-line `.txt`
- [x] Verify: can assign up to 5 flags to another player; 6th and self-assign blocked
- [x] Verify: cannot ready below minimum
- [x] Commit

### Notes

Bug fixed: `Lobby.tsx` had no game status watcher, so non-host players were never auto-navigated to the submit screen. Added `useEffect` watching `game.status` (same pattern as `SubmitFlags.tsx`).

### Notes

---

## Phase 7 — Client: Game Screen

> **Goal:** Active gameplay with all 4 round sub-states.
> **Phase status:** Complete
> **Commit message when done:** `feat(phase-7): active game screen`

### Tasks

- [x] Build `components/RedFlagCard.tsx` — bold card, theme banner above
- [x] Build `components/Timer.tsx` — countdown ring/bar, pulses when low
- [x] Build `components/VotingPanel.tsx` — grid of player avatars; if YOU authored the flag the whole panel is disabled ("You wrote this one"); otherwise every avatar is enabled **including your own** (never disable self — it would leak the answer)
- [x] Build `components/RoundResults.tsx` — animated vote bars; highlight the **subject** (correct answer); for assigned flags also reveal the author ("…and {author} planted it 👀")
- [x] Build `components/Scoreboard.tsx` — sorted list with animated `+100` deltas
- [x] Build `routes/Game.tsx` — switches sub-view by `currentRound.status`:
  - [x] PRESENTING: card with reveal animation, host sees "OPEN VOTING"
  - [x] VOTING: card + voting panel + timer
  - [x] REVEAL: vote breakdown + correct answer
  - [x] SCOREBOARD: leaderboard with deltas, host sees "NEXT FLAG"
- [x] Host-only controls; non-host shows "Waiting for host…"
- [x] Round counter ("Round 5 / 23")
- [x] Framer Motion transitions between sub-views
- [x] Sound hook stub (`src/lib/sounds.ts`) — call for vote / reveal / score / win
- [x] Verify: end-to-end playable on mobile (375/390px, full 11-round game via Playwright)
- [x] Verify: author of a flag cannot vote; everyone else can, self-pick allowed (author blocked 11/11 rounds)
- [x] Verify: reveal shows the subject as the answer + the author for assigned flags (planted reveal confirmed)
- [x] Verify: host controls disabled when not allowed
- [x] Commit

### Notes

**Server addition:** `SCOREBOARD` was an unreachable `RoundStatus` — the server flow stopped at `REVEAL`, advanced by `round:next`. Added a minimal host-only `round:scoreboard` event (REVEAL → SCOREBOARD) in `events.ts` + `handlers.ts` so the scoreboard is a real, server-synced beat rather than client-local (which would desync players). `round:next` already works from any PLAYING sub-state, so it needed no change.

**Score deltas:** `gameStore` gained `lastDeltas`, populated by a `round:revealed` listener and cleared on `round:started`, feeding the scoreboard's animated `+N` badges. Scores are applied server-side at REVEAL, so SCOREBOARD shows final totals + the delta badge.

---

## Phase 8 — Client: Final Results

> **Goal:** End-of-game celebration screen.
> **Phase status:** Complete
> **Commit message when done:** `feat(phase-8): final results screen`

### Tasks

- [x] Build `routes/Results.tsx`:
  - [x] Top 3 podium with staggered entrance
  - [x] Full ranked list below
  - [x] Confetti for #1 (canvas-confetti, fires twice for flair)
  - [x] "PLAY AGAIN" (host) — resets game, returns to SUBMITTING
  - [x] "BACK TO HOME" — leaves room
- [x] Server: handle `game:playAgain` event — keep players, clear flags/scores/rounds
- [x] Add to shared events + schemas
- [x] Verify: winner correct — ranked by game.scores descending; confirmed in code
- [x] Verify: confetti fires once — guarded by confettiFired.current ref; fires twice for flair (intentional)
- [x] Verify: Play Again keeps lobby intact — resetForPlayAgain() → SUBMITTING; Results route navigates automatically
- [x] Commit

### Notes

---

## Phase 9 — Polish

> **Goal:** Feel finished and "Jackbox loud."
> **Phase status:** Complete
> **Commit message when done:** `feat(phase-9): polish, pwa, sounds`

### Tasks

- [x] Vite PWA plugin: manifest + icons + service worker (generateSW, precaches 12 entries)
- [x] Generate icons (192, 512) — bold red-flag motif (SVG → PNG via ImageMagick)
- [x] Implement `src/lib/sounds.ts` with Web Audio API synthesis (no external files)
- [x] Haptic feedback on vote + reveal + win (`navigator.vibrate`)
- [x] Error boundaries on every route (`ErrorBoundary` wraps each `<Route>`)
- [x] Reconnecting banner (animated yellow bar when socket disconnects)
- [x] Loading states: all routes already have LoadingScreen; GENERATING has its own screen
- [x] Accessibility pass: Modal gets `role="dialog"`, `aria-modal`, `aria-labelledby`, Escape key; VotingPanel gets `aria-pressed`, `aria-label` per button; RedFlagCard gets `role="article"`, `aria-label`; round counter gets `aria-live`
- [x] Tick sound + haptics on last 5s of voting timer
- [ ] Test devices: iOS Safari, Android Chrome (requires physical device)
- [ ] Lighthouse PWA ≥ 90 (requires deployed URL)
- [x] No console errors in `pnpm build` — clean build confirmed
- [ ] Commit

### Notes

---

## Phase 9.5 — Hardening: Abuse Protection & QA

> **Goal:** Make the server safe to expose publicly. OpenAI key is server-side only — the real risk is **cost abuse / resource exhaustion**, not key theft. Must land before Phase 10 puts a public URL on the server. See `IMPLEMENTATION_PLAN.md` Phase 9.5 for the full threat model (T1–T8).
> **Phase status:** Complete
> **Commit message when done:** `feat(phase-9.5): abuse protection and qa hardening`

### Tasks

**A. LLM cost controls (primary)**
- [x] `GameRoom.llmCallCount` + per-room cap (default 20) → shuffle past cap (T1)
- [x] Per-room start cooldown (default 10s between GENERATING transitions) (T1)
- [x] Global concurrency semaphore in `questionGen` (max 3 in-flight) → shuffle on excess (T2)
- [x] Global LLM budget: calls/min token-bucket + daily ceiling (`LLM_DAILY_CALL_LIMIT`) (T1, T2)
- [x] Input guard: > `LLM_MAX_FLAGS` (default 300) → skip LLM, shuffle (T3)

**B. Connection & room abuse**
- [x] `MAX_ROOMS` global cap in `roomManager.create` (T2, T4)
- [x] Per-IP room-creation rate limit (~5 / 10 min) (T2)
- [x] Per-IP concurrent-connection cap (~30) (T4)
- [x] Per-socket inbound event throttle (vote/submit/assign/import) (T5)
- [x] Idle-room GC (`ROOM_IDLE_TTL` ~30 min) + `ROOM_MAX_LIFETIME` cap (T6)

**C. Transport hardening**
- [x] `helmet` security headers
- [x] `express.json({ limit: '32kb' })`
- [x] Lower Socket.io `maxHttpBufferSize` (128 KB)
- [x] `express-rate-limit` on REST routes

**D. Identity — rejoin secret (resolved: build it)**
- [x] `GameRoom.rejoinSecrets` Map (server-only, never snapshotted) + `getSecret`/`verifySecret`
- [x] shared: create/join responses gain `rejoinSecret`; rejoin payload + schema gain `secret`
- [x] server `room:rejoin` verifies secret (reject `BAD_SECRET`); client stores+sends it (no UI change)

**E. QA / automated tests (Vitest → `pnpm test`)**
- [x] `GameEngine` unit tests (scoring all branches, nextRoundIndex, shuffle) — 13 tests
- [x] Zod validation tests (malformed/oversized payloads rejected) — 24 tests
- [x] Rate-limit / budget / cooldown / semaphore + rejoin secret unit tests — 15 tests
- [ ] Promote `test-phase*.ts` scripts → one headless full-game integration test (deferred)
- [x] Root `pnpm test` runs all suites — 52/52 passing

**F. Observability**
- [x] Structured per-LLM-call log (room, flag count, timing, outcome) — in `questionGen.ts`
- [x] `/health` counters: active rooms, active/daily/limit LLM calls, per-minute bucket

### Notes

_(executor adds notes here as needed)_

### Resolved Decisions (2026-05-29)

- **Identity (T7):** ✅ build server-only rejoin secret (Task D)
- **Budget posture:** ✅ soft throttle + generous daily ceiling; over budget → shuffle, never error
- **Caps:** ✅ generous tier, all env-overridable. Defaults:
  - per-room LLM cap **20** · start cooldown **10s** · concurrency **3** · calls/min **10** · daily **500** · max flags/call **300**
  - MAX_ROOMS **200** · per-IP conns **30** · per-IP room create **5/10min** · per-socket events **~30 burst, 5/s** · idle TTL **30min** · max lifetime **6h**
  - worst-case LLM ceiling ≈ **$10/day**, typical ≈ $2/day

---

## Phase 10 — Deployment

> **Goal:** Live and playable from anywhere.
> **Phase status:** Complete
> **Commit message when done:** `chore(phase-10): production deployment`

### Tasks

- [x] Push all local commits to origin/main (done 2026-06-04)
- [x] Implement Cast Mode (/cast/:code route + room:watch server event + QR code in PresenterView)
- [x] Deploy `apps/server` to Railway
  - [x] `CORS_ORIGIN` → https://whose-flag-is-it-anyway.vercel.app
  - [x] `NODE_ENV=production`
  - [ ] `ANTHROPIC_API_KEY` — skipped; server falls back to shuffle mode without it
- [x] Deploy `apps/web` to Vercel
  - [x] `VITE_SOCKET_URL` → https://server-production-5b58.up.railway.app
- [x] End-to-end smoke test: /health → ok, Vercel → 200
- [ ] (Optional) Custom domain
- [ ] (Optional) UptimeRobot monitor
- [ ] Update `README.md` with live URL
- [x] Commit

### Notes

---

## Global Blockers

_(executor lists anything blocking forward progress; user reviews)_

—
