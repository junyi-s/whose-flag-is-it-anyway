# Smoke Test Findings — 2026-05-31

## Critical

### ANTHROPIC_API_KEY not set in Railway
LLM falls back to shuffle mode on every round. Flag ordering is random, not AI-ranked.
**Fix:** Add `ANTHROPIC_API_KEY` to Railway environment variables.

---

## Bugs

### Double socket connection on page load
Every time a player navigates back to the app, the server logs **two** `Socket connected` events instead of one. Only one socket rejoins the room; the other is an orphan that never authenticates but stays connected. On final page leave, both fire a `disconnect` event (visible as the double-disconnect at end of session).

**Root cause (suspected):** `socket.connect()` is called in both `App.tsx` and `Home.tsx` before the first connection completes, creating a second logical socket.io connection.

**Impact:** Orphan sockets inflate per-IP connection counts, can prematurely trigger `MAX_CONNS_PER_IP` for users who rejoin multiple times. Ghost connections persist in the room until the socket times out.

**Note:** Rejoin flow itself works correctly — player successfully re-enters room both times tested.

---

### Broken footer text on round results page
The footer area on the "It's [name]'s flag!" results screen displays broken/garbled text.

---

## Feature Requests

### Streaming / Cast Mode (Jackbox-style)
A second game mode where the host casts the game to a shared screen (TV/monitor) and players use their phones purely as controllers — similar to Jackbox Party Pack.

**Concept:**
- Host opens a "Cast View" URL that displays the current game state full-screen on the TV (flags, votes, scoreboard, results)
- Players join on their phones as normal but their screens show only the input relevant to them (submit flags, vote, wait screen)
- The cast screen drives the narrative — players watch the TV, not their own phones
- Host advances rounds from their phone; the cast screen updates in real time via the existing socket connection

**Scope (high level):**
- New `/cast/:code` route — read-only game view, no player identity, subscribes to `game:updated`
- Existing game state is already broadcast to all clients; cast view just renders it differently
- Player phone screens simplified to action-only (no spectating the full board)
- QR code on cast screen for easy phone joining
- Host UI gets a "Start Cast" button that opens the cast URL

---

### Flags per player limit + pre-game agreement disclaimer
Current max is 50 flags per player — way too high for a party game.

**Changes:**

**Shared (`packages/shared/src/constants.ts`)**
- `MAX_FLAGS_PER_PLAYER`: 50 → **5**
- `DEFAULT_GAME_SETTINGS.maxFlagsPerPlayer`: updates automatically since it references the constant

**Shared (`packages/shared/src/schemas.ts`)**
- `minFlagsPerPlayer` Zod schema: `.max(50)` → `.max(5)`
- `maxFlagsPerPlayer` Zod schema: `.max(50)` → `.max(5)`
- This ensures any `settings:update` event from a client that tries to set a value above 5 is rejected at the validation layer before hitting the server

**Frontend (`apps/web/src/routes/Lobby.tsx`)**
- The `SettingsPanel` already renders `minFlagsPerPlayer` as a slider/input — its upper bound will naturally clamp to 5 once the constant changes
- Add a static disclaimer below the settings panel (visible to all players, not just host): *"Agree on how many flags everyone will add before starting — once the game begins you can't change it."*
- Disclaimer should only show during `LOBBY` status, disappear once the game starts

---

### End game while session is in progress
Host should be able to end the game at any point during `SUBMITTING`, `GENERATING`, or `PLAYING` and go straight to `FINAL_RESULTS`.

**Scope:**
- New `game:end` socket event (host-only, no payload) in shared types
- Server handler: validate host, cancel any active voting timer, transition to `FINAL_RESULTS`, broadcast `game:updated`
- Frontend: "End Game" button visible to host during active session, behind a confirmation prompt to prevent accidents

---

## Resolved / Not a Bug

- Player reconnections during smoke test were intentional (user navigated away and back), not crashes.
- Scores page already shows per-player correct/incorrect breakdown — no additional display needed on results page.
