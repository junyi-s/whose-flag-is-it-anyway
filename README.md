# Whose Flag Is It Anyway? 🚩

A multiplayer party game where players submit their personal red flags, then vote on whose red flag they think it is.

## Quick Start

```bash
# Install dependencies
pnpm install

# Copy env file and add your OpenAI key
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
- **LLM:** OpenAI gpt-4o-mini (themes and orders flags)
- **Monorepo:** pnpm workspaces

## Development

```bash
pnpm install       # install all workspace deps
pnpm dev           # start web (5173) + server (3001)
pnpm build         # build all packages
pnpm test          # run all tests
```

## Deployment

- **Server:** Railway (`apps/server`)
- **Web:** Vercel (`apps/web`)

See `IMPLEMENTATION_PLAN.md` for full architecture docs.
