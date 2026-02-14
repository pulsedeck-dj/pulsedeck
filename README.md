# PulseDeck

PulseDeck is a full party request platform:
- Web app for DJ auth, party creation, guest join, and Apple Music song requests
- Node + Socket.IO API with Postgres + Prisma persistence
- macOS Electron DJ desktop app that receives requests in realtime with a live queue UI

## Monorepo Apps
- `apps/server`: Express, Prisma, Postgres, Socket.IO
- `apps/web`: static frontend (served by API in production)
- `apps/dj-app`: Electron DJ desktop app and `.dmg` packaging

## Features
- DJ accounts (`register`, `login`, JWT auth)
- Persistent party/session/request storage in Postgres
- Private DJ key required to claim active DJ role
- Realtime request delivery to DJ desktop app
- Apple Music search endpoint for web picker
- Idempotent request submission (`X-Idempotency-Key`)
- Multi-window web UX (`Guest`, `DJ`, `Setup`) with runtime backend URL configuration
- DJ queue dashboard with activity log and guest QR modal
- DJ desktop tabs (`Booth`, `Requests`, `Share`) for fast live use

## Requirements
- Node.js 20+
- npm 10+
- PostgreSQL 14+
- macOS (for DJ app runtime/build)

## Local Setup

1. Create env file:
```bash
cp .env.example .env
cp .env apps/server/.env
```

2. Install dependencies:
```bash
npm install
```

3. Create DB + run migrations:
```bash
npm --workspace apps/server run prisma:generate
npm --workspace apps/server run prisma:migrate
```

4. Run apps:
```bash
npm run dev:server
npm run dev:web
npm run dev:dj
```

5. Open web UI:
- `http://localhost:5173`

## Production Deployment (Recommended)

Use **GitHub + Render**:
- GitHub: source code + downloadable DJ app releases
- Render: managed Postgres + hosted API/web

This repo includes `render.yaml` so Render can provision DB + API service.

### Deploy Steps
1. Push this repo to `main` on GitHub.
2. In Render, create a new Blueprint and point it to this repo.
3. Render will read `render.yaml` and create:
- `pulsedeck-db` (Postgres)
- `pulsedeck` (Node web service)
4. Set `WEB_ORIGIN` in Render env to your final web URL (e.g. `https://pulsedeck.onrender.com`).
5. Add `APPLE_MUSIC_DEVELOPER_TOKEN` if you want Apple Music search enabled.

The server hosts the web app in production, so one URL serves both frontend and API.

## DJ App Download For Users

This repo includes GitHub Action workflow `.github/workflows/release-dj.yml`.

- Trigger manually from GitHub Actions, or
- Push a tag like `v1.0.0`

It builds `apps/dj-app/dist/*.dmg` and attaches it to the GitHub Release.

Users then:
1. Open your Releases page.
2. Download the latest `.dmg`.
3. Install and run PulseDeck DJ.

If local mac builds fail with a `7zip-bin` `ENOENT` error, move the repo to a path without spaces before running `npm run build:dj:mac`.

## GitHub Pages Link

This repo includes `.github/workflows/pages.yml` to publish the web UI to GitHub Pages.

Expected Pages URL:
- `https://pulsedeck-dj.github.io/pulsedeck/`

Note: `https://pulsedeck-dj.github.io/` may show 404 for this project site. Use the `/pulsedeck/` path.

Before enabling Pages, set repository variable:
- `PULSE_API_BASE` = your public backend URL (for example your Render app URL).

Without `PULSE_API_BASE`, the GitHub Pages frontend will load but API calls will fail.

## DJ QR Flow

In the DJ desktop app:
- set `Guest Website URL` to your public request site (default is GitHub Pages)
- click `Show Guest QR`
- a full-screen party card opens with party code + QR

The QR opens the web page with `partyCode` prefilled in URL.

## Web Setup Window

If your GitHub Pages build has no API base configured, open `Setup Window` in the web app and set:
- `API Base URL` (your public server URL, for example Render)

The web app stores this value in browser local storage and uses it for all API calls.

## Scripts
From repo root:

- `npm run dev` - run server + web + DJ app
- `npm run dev:server`
- `npm run dev:web`
- `npm run dev:dj`
- `npm run start:server`
- `npm run start:prod`
- `npm run build:dj:mac`
- `npm run smoke:test`

## API Overview
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/music/apple/search?term=...&limit=8&storefront=us`
- `POST /api/parties` (Bearer token required)
- `POST /api/parties/:code/claim-dj`
- `POST /api/parties/:code/heartbeat` (`X-DJ-Token`)
- `POST /api/parties/:code/join`
- `POST /api/parties/:code/requests` (`X-Idempotency-Key`)
- `GET /api/parties/:code/requests` (`X-DJ-Session-ID`, `X-DJ-Token`)

## Notes
- Apple Music search requires a valid Apple Music developer token.
- This system stores request metadata and song URLs.
