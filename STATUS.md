# Grort — Status

**Last updated:** 2026-05-12 by Claude
**Phase:** Production (PWA live, mobile app store launch pending)
**Hosting:** Hetzner shared droplet (spahndigital.com), Docker Compose + nginx, accessible at grort.app

## Current Focus

PWA is live and feature-complete for MVP; next priority is app store submission (iOS + Android) to unlock the $3.99 one-time purchase revenue tier.

## Project Map

Grort is a personal receipt-scanning and grocery price-tracking app. Users photograph receipts, AI extracts items and prices, and the app tracks spending trends, price history by store, and household-shared data.

**Stack:** Expo SDK 55 (React Native Web) frontend served as static files from Express 5 + Node 22; PostgreSQL 16; Anthropic Claude AI (switchable to OpenAI/Gemini via `AI_PROVIDER`); DigitalOcean Spaces for receipt image storage. Deployed as a single Docker image.

**Key directories:**
- `backend/` — Express API, routes, repositories, AI parser adapter, migrations, 98 tests (25 files)
- `mobile/` — Expo app (web + native shared codebase), screens, API client, service worker
- `docs/` — status files, design specs, plans
- `docker-compose.yml` / `Dockerfile` — local dev and production container config
- `.github/workflows/` — deploy pipeline

## Next Steps

- [ ] Submit to Apple App Store and Google Play Store ($3.99 one-time — Tier 1 revenue opportunity)
- [ ] Replace placeholder Expo assets (`android-icon-*`) with Grort-branded icons (required for app store submission)
- [ ] Complete Google OAuth — wire up client-side sign-in button on web; current backend only verifies tokens
- [ ] Add store/product management UI (merge/edit endpoints exist on backend; no frontend screens yet)
- [ ] Add web-native charts (trends screen uses list fallbacks on web instead of visual charts)
- [ ] Test PWA install flow on mobile browsers (Chrome and Safari) ahead of app store submission
- [ ] Create a `CLAUDE.md` for this repo

## Blockers

No hard blockers. App store submission requires branded assets and a polished PWA install flow — neither is started.

## Recent Decisions

- 2026-04-05: Fixed Expo web build hardcoding local IP as API URL in Docker; now uses relative URLs via empty `EXPO_PUBLIC_API_URL`
- 2026-04-04: Switched deployment from GHCR to direct SCP transfer (Docker image as tarball) to avoid GitHub Packages permission issues
- 2026-04-04: Shipped PWA branch — service worker, web manifest, offline banner, mascot evolution (Baby/Cyber/Mecha Grort tiers), receipt photo thumbnails, trends drill-down modals
- 2026-04-04: Resolved CSP issues for blob URIs, DigitalOcean Spaces image loading, and React Native Web inline styles

## Links

- Repo: `/Users/kevinspahn/Grort`
- GitHub: https://github.com/kevspahn/Grort
- Production: https://grort.app
- SSH: `deploy@spahndigital.com` (Hetzner shared droplet, ed25519 key)
- NAS bare repo: `Kevin@10.0.0.135:/volume1/Dev/repos/Grort.git`
