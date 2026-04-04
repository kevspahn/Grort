# Grort Web PWA Design

**Date:** 2026-04-03
**Goal:** Serve the Expo web app as a PWA from the same origin as the Express API, with an evolving mascot system.

---

## 1. Build & Serve Architecture

### Overview

Single Docker container serves both the Express API and the Expo web frontend. API routes take precedence; all other routes fall through to the Expo client-side app.

### Build Pipeline

Multi-stage Dockerfile at the repo root:

1. **Stage `web-build`**: Node 22, installs `mobile/` dependencies, runs `npx expo export --platform web`. Output lands in `mobile/dist/`.
2. **Stage `backend`**: Node 22-slim, installs `backend/` dependencies, copies backend source and the web build output into `/app/public/`.
3. **CMD**: `npx tsx src/db/migrate.ts && npx tsx src/index.ts` (unchanged).

### Express Static Serving

In `backend/src/index.ts`:

- `express.static('public')` serves the Expo web output (JS bundles, CSS, assets, manifest, service worker).
- Cache headers middleware:
  - Files with hashed filenames (`*.HASH.js`, `*.HASH.css`): `Cache-Control: public, max-age=31536000, immutable`
  - `index.html`, `manifest.json`, service worker: `Cache-Control: no-cache`
- All existing API routes (`/auth`, `/health`, `/receipts`, `/households`, `/upload`, `/products`, `/stores`, `/analytics`) registered before the static middleware.
- Catch-all `GET {*path}` route (Express 5 syntax) after static middleware serves `index.html` for client-side routing.

### API URL Configuration

The Expo app's `src/api/client.ts` uses:

```typescript
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || '';
```

- **Production web**: `EXPO_PUBLIC_API_URL` is not set, so axios uses relative URLs (same origin).
- **Local dev / mobile**: `EXPO_PUBLIC_API_URL` is set to `http://localhost:3001` or the device-reachable IP.

---

## 2. PWA Configuration

### Web App Manifest

Configured via `app.json` web section:

```json
{
  "web": {
    "name": "Grort",
    "shortName": "Grort",
    "favicon": "./assets/favicon.png",
    "themeColor": "#2E7D32",
    "backgroundColor": "#F5F5F5",
    "display": "standalone",
    "icon": "./assets/grort-v1.png"
  }
}
```

Expo's web export generates the manifest and icon sizes automatically from these fields.

### Service Worker

A hand-written service worker (`mobile/public/sw.js`) copied into the web build output:

- **Install**: Pre-caches the app shell (index.html, JS/CSS bundles).
- **Fetch strategy**: Network-first for all requests. On network failure, serve cached app shell.
- **Offline UX**: The app shell loads, and the app detects `navigator.onLine === false` to show an "You're offline" banner. No offline data access.

Registration via a small inline script in the Expo web entry or a custom `index.html` template.

### Favicon & Icons

- Replace `mobile/assets/favicon.png` with a version derived from `grort-v1.png`.
- Replace `mobile/assets/icon.png` with `grort-v1.png`.
- Replace `mobile/assets/splash-icon.png` with `grort-v1.png` (or a padded version suitable for splash).

---

## 3. Mascot Evolution System

### Tiers

| Tier | Receipt Count | Asset          | Display Name |
|------|---------------|----------------|--------------|
| 1    | 0-9           | `grort-v1.png` | Baby Grort   |
| 2    | 10-49         | `grort-v2.png` | Cyber Grort  |
| 3    | 50+           | `grort-v3.png` | Mecha Grort  |

### Backend Change

Add `receipt_count` to the `/auth/me` response. Query:

```sql
SELECT COUNT(*) FROM receipts WHERE user_id = $1
```

Returned alongside existing user fields. No new tables or migrations.

### Frontend Hook

`useGrortMascot(receiptCount: number)` returns `{ source, tierName }`:

```typescript
function useGrortMascot(receiptCount: number) {
  if (receiptCount >= 50) return { source: require('../../assets/grort-v3.png'), tierName: 'Mecha Grort' };
  if (receiptCount >= 10) return { source: require('../../assets/grort-v2.png'), tierName: 'Cyber Grort' };
  return { source: require('../../assets/grort-v1.png'), tierName: 'Baby Grort' };
}
```

### Usage Locations

- **Profile screen**: Prominent mascot display with tier name below it.
- **Loading/splash states**: Mascot shown while data loads (e.g., receipt list, analytics).
- **Empty states**: Mascot with contextual message (e.g., "Scan your first receipt!" on empty receipt list).

---

## 4. Deployment Changes

### Dockerfile

Moves from `backend/Dockerfile` to repo root `Dockerfile`.

```dockerfile
# Stage 1: Build Expo web
FROM node:22 AS web-build
WORKDIR /mobile
COPY mobile/package.json mobile/package-lock.json ./
RUN npm ci
COPY mobile/ .
RUN npx expo export --platform web

# Stage 2: Backend + static files
FROM node:22-slim
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/ .
COPY --from=web-build /mobile/dist /app/public
RUN mkdir -p uploads
EXPOSE 3001
ENV PORT=3001
CMD ["sh", "-c", "npx tsx src/db/migrate.ts && npx tsx src/index.ts"]
```

### GitHub Actions Workflow

The deploy workflow (`.github/workflows/deploy.yml`) builds the image in CI, saves it as a gzipped tarball, SCPs it to the droplet, and loads it with `docker load`. This bypasses GHCR entirely.

Steps:
1. `docker build -t ghcr.io/kevspahn/grort:latest .` (image name matches droplet's compose config)
2. `docker save | gzip > grort.tar.gz`
3. SCP tarball to droplet `/tmp/`
4. SSH: `docker load`, `docker compose up -d grort`

### No Other Infrastructure Changes

The droplet's `docker-compose.yml` references `ghcr.io/kevspahn/grort:latest` as the image name (kept for compatibility). The container still exposes port 3001.

---

## 5. App Identity Cleanup

Update `app.json`:

- Change `name` from `"mobile"` to `"Grort"`.
- Change `slug` from `"mobile"` to `"grort"`.
- Update `splash.backgroundColor` to `"#F5F5F5"`.

---

## Out of Scope

- Offline data access (receipts, analytics cached for offline viewing).
- Push notifications.
- Full native app store deployment.
- Chart rendering on web (existing list fallbacks are retained).
