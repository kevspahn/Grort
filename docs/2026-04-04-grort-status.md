# Grort Status

Date: 2026-04-04 (end of session)

## Summary

Grort is live at grort.app as a PWA. Users can register, log in, scan receipt photos via AI, review extracted data, browse receipts, view spending trends with category/period drill-downs, and track prices. Receipt photos are stored on DigitalOcean Spaces and viewable on each receipt's detail page.

## Current Architecture

### Stack

- **Frontend:** Expo SDK 55 (React Native Web), served as static files from Express
- **Backend:** Express 5, Node 22, TypeScript, PostgreSQL 16
- **AI:** Anthropic Claude (configurable to OpenAI/Gemini via `AI_PROVIDER` env var)
- **Storage:** DigitalOcean Spaces (S3-compatible) for receipt images
- **Hosting:** DigitalOcean Droplet, Nginx reverse proxy, Let's Encrypt SSL

### Deployment Pipeline

1. Push to `main` triggers `.github/workflows/deploy.yml`
2. GitHub Actions builds Docker image (multi-stage: Expo web export + Express backend)
3. Image saved as gzipped tarball, SCPed to droplet via `appleboy/scp-action`
4. SSH: `docker load` + `docker compose up -d grort` on droplet at `~/spahndigital`
5. Does NOT use GHCR — direct SCP transfer to avoid package permission issues

### Dockerfile (repo root)

- Stage 1 (`web-build`): `node:22`, installs mobile deps, runs `npx expo export --platform web`
- Stage 2: `node:22-slim`, installs backend deps, copies web output to `/app/public`, runs migrations + server

### Droplet Configuration

- Shared droplet with Galerie88 (Painter's Log) at `~/spahndigital`
- Single PostgreSQL container, init script creates separate databases
- Nginx routes `grort.app` → `grort:3001`, `spahndigital.com` → `galerie88:3000`
- Env vars in `~/spahndigital/.env` (Grort vars prefixed `GRORT_`, shared Spaces vars prefixed `SPACES_`)
- SSH access: `deploy@spahndigital.com` (deploy user, ed25519 key)

### What Serves What

- `grort.app/` — Expo web app (client-side routing via catch-all)
- `grort.app/health` — health check
- `grort.app/auth/*`, `/receipts/*`, `/households/*`, `/upload`, `/products/*`, `/stores/*`, `/analytics/*` — API
- `grort.app/(tabs)/*`, `/(auth)/*` — Expo router paths, served as `index.html`

### CSP Configuration

Helmet CSP allows: `blob:` for image picker, `unsafe-inline` for React Native Web styles, `*.nyc3.digitaloceanspaces.com` for receipt images, `data:` for fonts.

### Local Dev Ports

- Grort backend: `3001`, Grort db: `5433`, MinIO: `9000`/`9001`
- Painter's Log: `3000`/`5432`/`5173`

## What Is Done

### Backend (Express API)

- JWT auth: register, login, Google auth (token verification via `googleAuthService.ts`)
- `/auth/me` returns user data + `receiptCount` for mascot tier
- Household: create, invite, remove members, member listing
- Receipt: upload, AI scan, item editing, listing with pagination, detail with signed image URL, deletion
- Analytics: spending breakdown (period + category), price history, store comparison
- `GET /analytics/category-items` — items by category with product IDs, for drill-down
- Product: listing, update, merge
- Store: listing, update, merge
- AI parser adapter layer (Claude, OpenAI, Gemini) with receipt extraction + validation
- Receipt processing pipeline: parse → resolve store → resolve category → match/create product → persist
- `storeName` nullable in extraction schema — defaults to "Unknown Store" with `needsStoreName` flag
- PostgreSQL schema, migrations, analytics indexes (3 migration files)
- 98 tests passing (25 test files)

### Frontend (Expo Web + Mobile)

- Auth flow: login, register screens
- Scan: gallery upload on web (blob → FormData), camera on native
- Receipt review: edit items, edit store name (prompted when AI couldn't extract it)
- Receipt list: with pagination, pull-to-refresh, delete
- Receipt detail: items, totals, receipt photo thumbnail with tap-to-zoom modal
- Trends: spending by period (week/month), by category, spending over time
  - Category drill-down modal: tap category → item list sorted by cost, tap item → product detail
  - Period drill-down modal: tap period → receipt list, tap receipt → receipt detail
- Prices: product search with price tracking
- Product detail: price history by store
- Profile: account info with mascot, household management, member invite/remove
- Mascot evolution: Baby Grort (0-9), Cyber Grort (10-49), Mecha Grort (50+)
- Offline banner on web
- Service worker for offline app shell caching
- All `Alert.alert` calls replaced with `window.alert`/`window.confirm` on web

### PWA

- Web app manifest: standalone display, theme color `#2E7D32`
- Icons: `grort-v1.png` mascot for favicon, app icon, splash
- Service worker: network-first with offline app shell fallback

## What Still Needs To Be Done

### High Priority

1. Finish Google auth with full OAuth flow (current: token verification only, no client-side Google sign-in button wired up on web)
2. Replace default Expo placeholder assets (`android-icon-*`) with Grort-branded versions
3. Add store/product management UX (merge/edit exists on backend, no frontend screens)

### Medium Priority

4. Add web-native charts (web currently uses list fallbacks instead of visual charts)
5. Test and refine PWA install flow on mobile browsers (Chrome, Safari)
6. Verify personal-user behavior without a household (edge case in store resolution)
7. Add receipt image to receipt review screen (currently only on detail)

### Low Priority / Nice-to-Have

8. Receipt search/filter by store or date range
9. Export spending data (CSV/PDF)
10. Budget tracking / spending alerts
11. Barcode scanning for product lookup
