# Whose Flag Is It Anyway? 🚩

A multiplayer party game where players submit their personal red flags, then vote on whose red flag they think it is.

## Quick Start

```bash
# Install dependencies
pnpm install

# Copy env file and add your Anthropic key
cp .env.example apps/server/.env

# Start both apps in dev mode
pnpm dev
```

Then open http://localhost:5173 on your phone and share the room code!

## How to Play

1. Host creates a room and shares the 4-letter code
2. Players join and submit their personal red flags (2–20 players)
3. Red flags are revealed one at a time — vote on whose you think it is
4. Score points for correct guesses, and bonus points for fooling others

## Tech Stack

- **Frontend:** React 18 + Vite + Tailwind CSS + Framer Motion
- **Backend:** Express + Socket.io
- **LLM:** Anthropic claude-haiku-4-5 (themes and orders flags)
- **Monorepo:** pnpm workspaces

## Development

```bash
pnpm install       # install all workspace deps
pnpm dev           # start web (5173) + server (3001)
pnpm build         # build all packages
pnpm test          # run all tests
```

## Deployment

| Service | Platform | URL |
|---|---|---|
| Web | Vercel | _set after deploy_ |
| Server | Railway | _set after deploy_ |

### Deploy the server (Railway)

1. Go to [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo**
2. Select this repo. Railway will detect `railway.json` automatically.
3. Set these environment variables in the Railway dashboard:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   CORS_ORIGIN=https://your-vercel-url.vercel.app   ← fill after Vercel deploy
   NODE_ENV=production
   PORT=3001
   ```
4. Deploy. Note the Railway public URL (e.g. `https://your-app.up.railway.app`).
5. Verify: `curl https://your-app.up.railway.app/health` should return
   `{"ok":true,"rooms":0,"llm":{...}}`.

### Deploy the web app (Vercel)

1. Go to [vercel.com](https://vercel.com) → **Add New Project → Import Git Repository**
2. Select this repo. Vercel will detect `vercel.json` automatically.
3. **Do not change** the Framework, Build Command, or Output Directory — they are set in `vercel.json`.
4. Set this environment variable:
   ```
   VITE_SOCKET_URL=https://your-app.up.railway.app   ← your Railway URL from step 4 above
   ```
5. Deploy. Note the Vercel URL.
6. Go back to Railway and update `CORS_ORIGIN` to the Vercel URL, then redeploy.

### Smoke test

Open the Vercel URL on two devices and play one full game end-to-end.

See `IMPLEMENTATION_PLAN.md` for full architecture docs.
