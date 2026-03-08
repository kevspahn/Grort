# Grort Status

Date: 2026-03-06

## Summary

Grort is in late prototype / early MVP territory.

- Backend implementation is much farther along than the initial scaffold plan.
- Backend is currently in a good local test state on this Mac once the Grort Docker services are running.
- Mobile has the primary screens and API wiring and is now build-clean locally.
- Grort and Painter's Log are currently separated cleanly by ports, so they can run side by side.

## Verified Local Dev State

### Active port split on this Mac

- Painter's Log backend: `3000`
- Painter's Log db: `5432`
- Grort backend: `3001`
- Grort db: `5433`
- Grort MinIO: `9000` and `9001`
- Painter's Log web: `5173`

### Docker state

Grort Docker services are up:

- `grort-db-1` on `5433 -> 5432`
- `grort-minio-1` on `9000-9001`

Painter's Log containers are also up and were left untouched.

### Backend verification

Executed locally:

- `docker compose up -d`
- `cd backend && npm run migrate`
- `cd backend && npm test`

Results:

- Migrations completed successfully.
- Backend test suite is green: `25` test files, `92` tests passed.

This materially changes the earlier assessment: the backend is not currently failing on product logic in local development, it was failing only because Grort's PostgreSQL service was not running yet.

### Mobile verification

Executed locally:

- `cd mobile && ./node_modules/.bin/tsc --noEmit`
- `cd mobile && CI=1 npx expo start --web --port 8081`

Results:

- Mobile typecheck is clean.
- Expo web boots and now renders the actual Grort router app.
- Browser verification against the live backend succeeded for:
  - register
  - login
  - profile load
  - household owner state visible after household creation
  - receipts list
  - analytics trends rendering
  - prices list
  - product detail rendering
  - trends web fallback rendering without the chart stack
  - product detail web fallback rendering without the chart stack
  - scan endpoint runtime path with a non-receipt image
  - unauthenticated direct deep-link to protected routes now redirects to login

Issues found and fixed during verification:

- missing `@expo/vector-icons`
- missing Expo web runtime dependencies
- wrong mobile entrypoint was booting `App.tsx` instead of Expo Router
- direct `expo-secure-store` usage broke web auth persistence
- stale backend process on `3001` was serving older auth code without `/auth/me`
- receipt detail was missing joined `store_name`
- local upload signed URLs were using the wrong local backend port
- non-receipt scan responses from AI providers were falling through to generic `500` errors instead of a user-facing `422`
- React Native Web chart pages were using `react-native-chart-kit`, which was the source of the earlier web-only chart warnings

Additional current verification:

- A non-receipt image now returns `422 Unprocessable Entity` with:
  - `Image does not appear to be a grocery receipt`
- Trends and product detail now render list-style web fallbacks instead of chart components on web.
- The previous React Native Web `props.pointerEvents` deprecation warning has been eliminated.
- Web now uses a Grort-owned tab shell and gallery-only scan flow instead of the default native tab/camera components.

## What Is Already Done

### Backend

Implemented and wired:

- Express app bootstrapping and route mounting
- JWT auth with register, login, and Google auth route shape
- Household creation, invite, removal, and member listing
- Receipt upload, scan, item editing, listing, detail, and deletion
- Analytics endpoints for spending, price history, and store comparison
- Product listing, updating, and merge API
- Store listing, updating, and merge API
- PostgreSQL schema, migrations, and analytics indexes
- AI parser adapter layer for Claude, OpenAI, and Gemini
- Receipt processing pipeline:
  - parse receipt
  - resolve store
  - resolve category
  - match or create product
  - persist receipt and items

### Test coverage

Implemented and now verified passing:

- unit tests
- repository tests
- route tests
- holdout-style scenario tests for:
  - onboarding flow
  - household sharing
  - invalid upload handling
  - price history
  - product matching
  - receipt deletion
  - spending trends

### Mobile

Implemented screens and navigation:

- auth flow
- scan screen with camera and gallery import
- receipt review
- receipt list
- receipt detail
- trends dashboard
- prices list
- product detail
- profile / household management

Implemented mobile auth storage and API client token injection, including web-safe token persistence.

## What Still Needs To Be Done

### Immediate blockers

1. Verify more of the authenticated mobile flows against the live local backend on `3001`.
   - receipt scan with an actual grocery receipt image
   - receipt review after AI extraction/edit

### Product and engineering gaps

1. Harden Google auth.
   - The route now validates Google token claims against the submitted user fields, but it still does not perform full signature verification with Google's official libraries.

2. Improve household UX on mobile.
   - Household creation now refreshes local auth/user state, but the wider authenticated flows still need broader verification on device and web.

3. Fill out missing management UX.
   - Product merge/edit exists on the backend, but there is no real mobile management flow for it.
   - Store merge/edit exists on the backend, but there is no mobile store management screen.

4. Verify personal-user behavior without a household.
   - This path needs explicit manual verification because store resolution for non-household users is a likely schema/logic edge case.

5. Remove local/dev rough edges.
   - Docker compose still has the obsolete `version` field warning.
   - There is an untracked `backend/Dockerfile` that should either be finished and committed intentionally or discarded later.
   - There is a local modification in `mobile/src/api/client.ts` changing the default API port to `3001`; this is correct for the current Mac setup but should be folded in intentionally.

### Security cleanup

1. Rotate secrets if needed.
   - `backend/.env` currently contains a live-looking Anthropic API key.
   - Treat that as sensitive and rotate it if it has been exposed anywhere beyond local-only use.

## Recommended Next Execution Order

1. Verify receipt scan and review with a real grocery receipt image.
2. Finish Google auth with real signature verification.
3. Add missing store/product management UX if that is still in scope for this iteration.

## Current Local Notes

- Grort is intentionally offset from Painter's Log and should continue to use:
  - API: `3001`
  - Postgres: `5433`
- Do not move Grort onto `3000` or `5432` on this machine unless Painter's Log is stopped first.
