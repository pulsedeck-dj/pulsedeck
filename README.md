# PulseDeck

PulseDeck is a full party request platform:
- Web app for DJ auth, party creation, guest join, and Apple Music song requests
- Node + Socket.IO API with Postgres + Prisma persistence
- macOS Electron DJ desktop app that receives requests in realtime and saves them to Desktop

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
- Optional auto-download command in DJ app for Apple Music URLs

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

Before enabling Pages, set repository variable:
- `PULSE_API_BASE` = your public backend URL (for example your Render app URL).

Without `PULSE_API_BASE`, the GitHub Pages frontend will load but API calls will fail.

## DJ Auto-Download Command (Optional)

In DJ app settings, enable **Auto-download Apple Music requests** and set a command template.

Available placeholders:
- `{{url}}`
- `{{outputDir}}`
- `{{cookieFile}}`
- `{{title}}`
- `{{artist}}`
- `{{seqNo}}`

Example template:
```bash
gamdl --cookie-file {{cookieFile}} --output {{outputDir}} {{url}}
```

The app also exposes env vars to the command:
- `PULSE_URL`
- `PULSE_OUTPUT_DIR`
- `PULSE_COOKIE_FILE`
- `PULSE_TITLE`
- `PULSE_ARTIST`
- `PULSE_SEQ_NO`
- `PULSE_SERVICE`
- `PULSE_PARTY_CODE`

For each request folder, the app writes:
- `request.json`
- `song-url.txt`
- `download.log` or `download-error.log` (if auto-download is enabled)

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
- This system stores metadata and URLs; make sure your download workflow complies with local law and platform terms.
