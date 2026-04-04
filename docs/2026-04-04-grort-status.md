# Grort Status

Date: 2026-04-04

## Summary

Grort is now serving a web frontend at grort.app as a PWA, in addition to the API backend. The Expo web app and Express API run from the same container on the same origin.

## What Changed Since 2026-03-06

### Web PWA (new)

- Expo web app is built and served from the Express backend at grort.app
- PWA support: web manifest, service worker for offline app shell, standalone display mode
- Offline banner ("You're offline") shown on web when connectivity is lost
- Service worker registered from the root layout on web platform

### Mascot Evolution System (new)

- Three mascot tiers based on receipt count:
  - Baby Grort (0-9 receipts): `grort-v1.png`
  - Cyber Grort (10-49 receipts): `grort-v2.png`
  - Mecha Grort (50+ receipts): `grort-v3.png`
- `/auth/me` now returns `receiptCount` (COUNT from receipts table)
- `useGrortMascot` hook + `GrortMascot` component
- Mascot shown on: profile screen (with tier name), loading states, empty states (receipts, trends)

### App Identity

- app.json updated: name "Grort", slug "grort"
- Icon and splash use `grort-v1.png` mascot
- PWA theme color: `#2E7D32` (primary green), background: `#F5F5F5`

### Deployment

- Dockerfile moved from `backend/Dockerfile` to repo root (multi-stage build)
- Stage 1: builds Expo web app (`npx expo export --platform web`)
- Stage 2: Express backend + web build output in `/app/public`
- Deploy workflow: builds image in CI, SCPs tarball to droplet, `docker load` + `docker compose up -d grort`
- No longer uses GHCR for image storage — direct SCP transfer
- API URL defaults to same-origin (empty string) in production web; mobile/dev uses `EXPO_PUBLIC_API_URL` env var

### Backend

- Express serves static files from `/app/public` when the directory exists
- Hashed assets: `Cache-Control: public, max-age=1y, immutable`
- `index.html` and `sw.js`: `Cache-Control: no-cache`
- Catch-all `GET {*path}` serves `index.html` for client-side routing (Express 5 syntax)
- API routes registered before static middleware, so they take precedence
- Google auth service added (`googleAuthService.ts`) with token verification

## Current Architecture

### Deployment pipeline

1. Push to `main` triggers `.github/workflows/deploy.yml`
2. GitHub Actions builds Docker image (multi-stage: Expo web + Express backend)
3. Image saved as tarball, SCPed to droplet
4. `docker load` + `docker compose up -d grort` on droplet

### What serves what

- `grort.app/` — Expo web app (client-side routed)
- `grort.app/health` — health check endpoint
- `grort.app/auth/*`, `/receipts`, `/households`, `/upload`, `/products`, `/stores`, `/analytics` — API routes
- `grort.app/(tabs)/*`, `/(auth)/*` — Expo router paths, served via catch-all as `index.html`

### Local dev ports (unchanged)

- Grort backend: `3001`
- Grort db: `5433`
- Grort MinIO: `9000` / `9001`
- Painter's Log: `3000` / `5432` / `5173`

## What Is Done

Everything from the 2026-03-06 status, plus:

- Web PWA served at grort.app
- Mascot evolution system (3 tiers)
- Offline banner for web
- Service worker for offline app shell caching
- Google auth token verification
- `/auth/me` includes `receiptCount`

## What Still Needs To Be Done

### From previous status (still applicable)

1. Verify receipt scan and review with a real grocery receipt image
2. Finish Google auth with full signature verification (partially done — `googleAuthService.ts` added)
3. Add missing store/product management UX on mobile
4. Verify personal-user behavior without a household

### New items

1. Replace default Expo placeholder assets (`android-icon-*`, `splash-icon.png`) with Grort-branded versions
2. Consider adding web-native charts (the web still uses list fallbacks instead of visual charts)
3. Test PWA install flow on mobile browsers (Chrome, Safari)
