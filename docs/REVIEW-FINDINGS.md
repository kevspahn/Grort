# Grort — Comprehensive Review Findings

**Prepared:** 2026-07-11 by Claude · Read-only audit of source + live production (grort.app)
**Scope:** backend (Express 5 + TS + Postgres), mobile/web (Expo SDK 55 RN Web), infra (Hetzner shared droplet).
**Anchor:** builds on BLUEPRINT.md §2 (already-confirmed findings). Findings here are new, or explicitly sharpen a §2 item.
**Prod scale:** 4 users · 39 receipts · 424 receipt_items · 243 products · 13 stores · 1 household.

---

## Executive summary

Grort works for exactly one person — you — and only because you scan receipts one at a time and already have a household. Everyone else hits a wall. Of your 4 users, one ("Joanne") is a real organic signup who registered on 2026-04-04 and has **0 receipts**: she landed on the Scan screen, uploaded a photo, and got a raw Postgres error in a browser alert because registration never creates a household and nothing tells her she needs one (BLUEPRINT §2.1; sharpened in findings #11, #10). The two remaining accounts are test accounts. So the app's real-world conversion rate is 0 of 1.

Behind that funnel wall, two deeper problems quietly corrupt the one thing Grort exists to do — track grocery prices by store. First, **the AI extraction is wrong on roughly half of receipts** and the app has no way to catch it: items don't reconcile to the subtotal on 17 of 39 receipts (up to $11.93 off), driven by uncaptured coupons, AI line-duplication, and dropped items — and the schema has no discount field to even represent the truth (#2, #9). Second, **product and store matching both split and merge the wrong things**: the same salmon becomes two products, while five unrelated Target items collapse into one (#3, plus §2.2 store fragmentation). Price history built on this data is not trustworthy, and nothing warns the user. Compounding it, the review UI lets you rename and reprice items but **cannot add a dropped item, delete a hallucinated one, or fix a by-weight quantity** — so the wrong data can't even be corrected by hand (#4).

Underneath everything sits the finding that should scare you most: **the production database has zero backups** — no dump, no WAL archive, no volume snapshot, no offsite copy (#1). It is the single copy of your irreplaceable personal grocery history, and one `docker compose down -v`, disk failure, or bad boot-migration wipes it permanently — with a boot-time auto-migrate loop and only a `:latest` image standing by to make a bad day unrecoverable (#12). There is also **no test or typecheck gate before deploy** (#13) — which is precisely why the §2.1 funnel-kill and 27 live TypeScript errors shipped — and the most complex service in the app, receipt processing, is exercised by **zero tests** (#14).

The security surface is real but currently low-exploitability: two IDOR write/read paths (#5, #6) and several info leaks, all gated today only by UUID opacity — hardening, not active breaches. **Fix order: back up the database this week; then unblock onboarding; then make the AI data correctable and reconcilable; then add a deploy gate so none of this silently regresses again.**

---

## P0 — fix before anything else

### P0-1 · Production Postgres has ZERO backups (#1, infra)
The DB is the only copy of all real user data. Verified read-only on the droplet: no crontab (deploy or root), nothing in `/etc/cron.d` doing `pg_dump`, no backup systemd timer, and none of restic/borg/rclone/wal-g/pgbackrest/barman/duplicity installed. `SHOW archive_mode` = **off**, `archive_command` disabled — no WAL archiving / no PITR. Data lives in a single local docker volume `spahndigital_postgres_data` → `/var/lib/docker/volumes/.../_data` on `/dev/sda1`; `mount | grep volume` shows no Hetzner block storage to snapshot. There is no dump, no WAL archive, no volume snapshot, no offsite copy anywhere.

**Fails when:** any of — volume corruption, `/dev/sda1` failure, an accidental `docker compose down -v`, or a destructive/failed boot-migration → 100% of production data gone, no recovery path. Blast radius is 5 apps in one shared volume.

**Fix:** nightly automated `pg_dump`/`pg_dumpall` → gzip → shipped offsite (DO Spaces / Hetzner Storage Box / borg+restic with retention). Even `docker exec spahndigital-postgres-1 pg_dump -U grort_user grort | gzip > offsite` beats the current nothing. **Verify a restore actually works.** Consider WAL archiving for PITR given the shared-DB blast radius.

> Note: the §2.1 onboarding funnel-kill is the other P0 in this app. It is already CONFIRMED in the blueprint; findings #11 and #10 below sharpen its frontend half. It is not re-reported here as a new finding, but it belongs at the top of any fix list alongside P0-1.

---

## P1 — core value prop is silently degraded

These three findings explain *why* the "track price by store" promise is quietly broken, and *why the user is never told*.

### P1-1 · The item/subtotal mismatch (§2.4) is an AI + schema problem, not a persistence bug (#2, aidata)
**This sharpens §2.4 with root cause.** Prod query comparing `SUM(receipt_items.total_price)` vs `SUM(raw_ai_response->items->totalPrice)` shows `db_sum == ai_sum` and `db_item_count == ai_item_count` on **all 39 receipts** — `receiptProcessingService.ts:107` persists exactly what the AI returned. Every mismatch lives in the AI's JSONB. Three evidenced causes:
1. **Uncaptured discounts/coupons** — receipt `447bccb5` (Lunds): items sum 30.87, subtotal 24.87, gap exactly **6.00**; `8802c4e0` gap 3.00; `dcc231e4`, `0b5992be` gap 1.00; `cd77cd07` (Costco) gap 1.00. `promptTemplate.ts` rule 10 says "do NOT include coupons, discounts as items" and there is **no discount column** — items can never reconcile.
2. **AI line duplication** — `7761cf0e` (Wayzata Muni): "BREW PUB SUPREME @11.99" listed twice; items 52.30 vs subtotal 40.31, gap = exactly 11.99.
3. **Dropped items** — `9758a935` (Target): subtotal 204.55 > item sum 200.25 (+4.30); `f5bf7c91` +3.39; `27532c2e` +2.05.

**Fails when:** user scans a Lunds receipt with a $6 coupon — 8 items at full price sum to $30.87, subtotal $24.87. App stores all 8 + subtotal, no error. Every per-item price is inflated ~24%; the core value is silently corrupted and the user is never told.

**Fix:** add a discount/adjustment representation to the schema (receipt-level discount column and/or discount line-item type); update the prompt to extract discount lines instead of dropping them; add a post-extraction reconciliation check (`|SUM(items) − subtotal| > threshold`) that flags for review rather than silently persisting.

### P1-2 · Product matching both splits and merges the wrong products; the "near" match auto-merges despite a comment claiming it flags for review (#3, aidata)
`productMatchService.ts:32` `similarity()` = 1 − Levenshtein/maxLen over the **whole string** — word-order-sensitive, token-blind.
- **False negatives (duplicate products):** 'Oak Smoked Salmon Pieces' vs 'Salmon Oak Smoked Pieces' = **0.417**; 'Alfredo Pasta Sauce' vs 'Pasta Sauce Alfredo' = **0.158**; 'Grapes' vs 'Fresh Grapes' = **0.500** — all below the 0.6 NEAR threshold, each spawns a duplicate. (243 products for 424 items, with pairs like Grapes+Fresh Grapes, Frozen Bagels+Large Plain Bagels, President Cheese+President Brand Product.)
- **False positives (distinct products merged):** five raw strings — STILLWAYS LADERS / ON LEADER / ON MILK / ON PERMS / NO — all collapsed into ONE product 'Stillways on Perms'. `sim('STILLWAYS ON MILK','STILLWAYS ON PERMS')=0.722`, inside the 0.6–0.9 NEAR band.
- **Silent auto-merge:** the NEAR branch (`receiptProcessingService.ts:91`) whose comment says "Flag for review" actually sets `productId = matchResult.product.id` and creates **no review record** — the merge is permanent and invisible.
- **Root driver:** the AI generates a fresh, nondeterministic canonical name per scan (same Chesters item became both "Chester's Hot Fries" and "Chesters Snacks"), so string-similarity on AI names is structurally unreliable.

**Fails when:** same salmon scanned twice → 0.417 < 0.6 → second product row → price history split, trend broken. Two different "STILLWAYS ON …" items → >0.6 → merged → their prices averaged into meaningless history.

**Fix:** token-based similarity (token-set/Jaccard + normalized edit distance) with apostrophe/case/whitespace normalization; gate the NEAR band behind a real persisted review flag on `receipt_item` (honor the existing intent); prefer matching on normalized `name_on_receipt` (stable across scans) over the AI canonical name; add a merge/split admin path.

### P1-3 · The scan→review UI cannot add, delete, or re-quantify items — so the ~half of receipts the AI gets wrong can never be corrected (#4, frontend)
`mobile/app/(tabs)/receipt-review.tsx`: the only mutations are `saveEdits()` (PUT name + totalPrice, lines 62-65) and `saveStoreName()` (line 43). There is **no "Add item" control, no per-item delete**, and quantity is read-only (`Qty: {item.quantity}`, line 107); the edit form exposes only `editedName` and `editedPrice` (lines 96-97). §2.4 confirms 17/39 receipts don't reconcile, including dropped items and mishandled by-weight quantities.

**Fails when:** AI drops the milk line and splits a by-the-pound produce item into two wrong rows. In review the user can rename/reprice the bad rows but cannot delete the phantom, add the missing milk, or fix the weight — the receipt saves with permanently wrong data feeding price history and spend totals.

**Fix:** add "Add item" + per-item delete (swipe or button) + editable quantity in `receipt-review.tsx`, wired to POST/DELETE/PUT on `/receipts/:id/items`. This is the hand-correction path that makes P1-1's reconciliation actionable.

---

## P2 / P3 — everything else

### Security & authorization (P2/P3)

**P2 · IDOR write — PUT /receipts/:id/items/:itemId is scoped only by item id (#5, auth).** `routes/receipts.ts:187-211` verifies ownership of the receipt in `:id` (192-201) but then calls `updateItem(req.params.itemId, ...)`; the SQL at `receiptRepository.ts:244-247` is `UPDATE receipt_items SET ... WHERE id = $idx` — no `receipt_id`/household binding, so the item written need not belong to the receipt in the URL. Two bypasses: (1) attacker passes a receipt they own as `:id` + any victim `:itemId`; (2) a **no-household** account hits the guard `if (req.householdId && receipt.household_id !== req.householdId)` at line 197 — false when `householdId` is null — and unlike GET (126) and DELETE (167) there is **no `receipt.user_id === req.user.id` fallback**, so no ownership check runs at all. Prod has 3 no-household accounts. Gated today only by UUID opacity; **P0 the moment an item id leaks** (logs, export, multi-household). **Fix:** `WHERE id = $itemId AND receipt_id = $receiptId`; add the missing no-household branch `if (!req.householdId && receipt.user_id !== req.user!.id) return 404`; validate body `productId`/`categoryId` belong to `req.householdId`.

**P2 · IDOR read — GET /households/:id/members leaks any household's roster (#6, auth).** `routes/households.ts:60-72` → `getMembers(req.params.id)` → `householdRepository.ts:32-38` `SELECT id, email, name, household_role FROM users WHERE household_id = $1` on the URL param. `requireHousehold` (`middleware/auth.ts:41-47`) only asserts the caller belongs to *some* household; never checks `req.params.id === req.householdId`. Any authenticated member can read another household's member emails (PII) and roles. Gated only by knowing the victim UUID. **Fix:** reject unless `req.params.id === req.householdId`, or drop `:id` and always use `req.householdId`. Apply the same to `POST /:id/invite` and `DELETE /:id/members/:userId` (currently re-validated inside the service, but the GET is not).

**P3 · Unscoped product-name read in analytics (#15, auth).** `analyticsService.ts:180-183` and `:218-221` do `SELECT canonical_name FROM products WHERE id = $1` on a caller-supplied `productId` with no household scope (`routes/analytics.ts:55`). Data rows are scoped (empty dataPoints for foreign products) but the returned `productName` leaks another household's product naming. **Fix:** `... WHERE id = $1 AND household_id = $2`, 404 on empty.

**P3 · No JWT revocation / logout / password-change; 7-day stateless tokens (#16, auth).** `authService.ts:6` `JWT_EXPIRES_IN = '7d'`; `verifyToken` only checks signature/expiry; no logout/revoke/blacklist/changePassword/resetPassword anywhere. Household removal *does* take effect immediately (middleware reloads the user row), but a leaked token can't be killed for 7 days and users can't change a password. **Fix:** token-version column checked in `authMiddleware` (or short access + revocable refresh) plus a password-change endpoint that bumps it.

**P3 · Password policy is length-only, min 8 (#17, auth).** `shared/schemas.ts:6` `password: z.string().min(8)`, login `min(1)` — no complexity, no denylist, no max. **Additive to §2.6** (no rate limiting on `/auth/login|register`, confirmed). The load-bearing fix is `express-rate-limit` on the `/auth` router; optionally a zxcvbn/common-password check on register.

**P3 · grort_user can enumerate sibling galerie88 / jobcostplus databases (#22, infra).** As grort_user: `SELECT current_database()` succeeds against both siblings; schema USAGE on `galerie88.public` and table enumeration via `pg_tables` (saw User, Account, Session, VerificationToken, AuditEvent…). **Data read is blocked** (`SELECT count(*) FROM "User"` → permission denied). `\l` shows galerie88 and grort with empty ACL (PUBLIC CONNECT default) while jobcostplus alone is locked down — inconsistent. Metadata disclosure + connection-exhaustion DoS + latent read risk if any sibling ever `GRANT … TO PUBLIC`. **Fix:** `REVOKE CONNECT ON DATABASE galerie88, grort FROM PUBLIC;` grant CONNECT only to each app's own role.

### Backend correctness (P2/P3)

**P2 · Receipt write + item loop has NO transaction — a mid-loop failure leaves a committed partial receipt (#7, backend).** `receiptProcessingService.ts:55-129`: step 3 commits the receipt row, then step 4 loops `productRepository.create` + `createItem`, all via `pool.query` directly. `grep -rn 'BEGIN|COMMIT|ROLLBACK|pool.connect|transaction'` = **zero matches** — nothing ever opens a transaction. `products` has `UNIQUE(household_id, canonical_name)` (`001_initial_schema.sql:54`) and `productRepository.create` is a plain INSERT with no ON CONFLICT. Prod check: all 39 receipts currently have `stored_items == jsonb_array_length(raw_ai_response->items)`, so it hasn't fired (serial scanning). **Fails when:** two concurrent scans share a new product name → second INSERT raises unique_violation mid-loop → receipt + items 1..k-1 already committed, route returns 500, user re-scans → duplicate receipt + orphaned partial. **Fix:** wrap steps 3-4 in `BEGIN/COMMIT/ROLLBACK` on a single `pool.connect()` client; make `productRepository.create` idempotent with `ON CONFLICT (household_id, canonical_name) DO …`.

**P2 · NODE_ENV unset in prod → Express 5 leaks full stack traces + absolute paths (#8, backend).** `docker inspect spahndigital-grort-1` env has no `NODE_ENV` line → Express defaults to development. Reproduced with the project's own express@5.2.1: an async handler that throws returns HTTP 500 with `<pre>Error: … at …/backend/node_modules/router/lib/layer.js:152 …</pre>` — message + stack + absolute paths. `routes/auth.ts:79-97` (`GET /auth/me`) is async with **no try/catch**: `await pool.query(...)` propagates straight to the default handler. **Fails when:** the pool is exhausted / DB briefly errors during `GET /auth/me` → the client gets internal error message + server filesystem layout. Systemic: every future async route without try/catch leaks the same way. **Fix:** set `NODE_ENV=production`; add a global error-handling middleware at the end of `index.ts` returning generic JSON; wrap `/auth/me` in try/catch.

**P3 · Every Zod error response omits `details` — 12 handlers read `err.errors`, undefined in Zod v4 (#18, backend).** **Sharpens §2.6** (which flagged only `auth.ts` and said "likely undefined"). Empirically confirmed against installed zod 4.3.6: `e.errors === undefined`, only `e.issues` is populated; `JSON.stringify(e.errors)` is `undefined` so the key drops from the body. Pattern `details: err.errors` at `auth.ts:12`, `receipts.ts:105 & 214`, `analytics.ts:27/71/103`, `products.ts:74/103`, `stores.ts:54/83`, `households.ts:18/36` — **12 sites**, not just auth. **Fails when:** the Expo app POSTs an invalid body → API returns `{"error":"Validation failed"}` with no `details` → frontend can't show which field failed. **Fix:** `details: err.issues` at all 12 sites (or a shared `handleZodError`); add a test asserting `response.body.details` is a non-empty array.

**P3 · matchProduct is an N+1 full-table scan + O(N·P) Levenshtein inside the per-item loop (#19, backend).** `receiptProcessingService.ts:70-82` calls `matchProduct` once per item; `matchProduct` (`productMatchService.ts:57`) runs `SELECT * FROM products WHERE household_id=$1` then loops all rows computing Levenshtein twice each. A 38-item receipt × 243 products = 38 queries + ~18,500 Levenshtein runs per scan. Fine today; grows linearly with receipt size and lifetime product count. **Fix:** fetch `findAllByHousehold` once before the loop, append products created mid-loop in memory; longer term use `pg_trgm` + GIN on `canonical_name` for SQL-side candidate filtering.

### AI pipeline (P2/P3)

**P2 · The prompt never asks for discounts, weight/unit-of-measure, or tax breakdown, and instructs the model to fabricate missing totals and dates (#9, aidata).** `promptTemplate.ts`: rule 10 excludes discounts (no field for them); no weight/unit-price field although `receipt_items.quantity` is DECIMAL(10,3); rule 4 defaults quantity to 1; **rule 9** "total must always be provided — estimate from item sum if needed" *fabricates* a total, masking dropped items; **rule 7** "if the receipt date is not visible, use today's date" fabricates dates. Prod: receipt `447bccb5` has "LARGE LEMONS qty 1 @1.10" and "JALAPENO PEPPER qty 1 @2.03" — weighted produce forced to qty 1; 6+ receipts dated exactly 2024-01-15 and two dated 2020, consistent with date defaulting. **Fails when:** 1.37 lb bananas @ $0.59/lb stored as qty 1 @ $0.81 — per-unit basis lost, cross-store banana comparison meaningless. **Fix:** add prompt fields + schema columns for discount lines, weight/UoM with unit-price basis, and captured-vs-estimated flags; change rule 9 to return `total: null` and rule 7 to `date: null` when not visible.

**P3 · No reconciliation validation; parse/Zod both hide and over-reject AI output (#20, aidata).** `processReceipt` persists items + subtotal with no `|SUM(items)−subtotal|` check anywhere — why 17/35 mismatches sat undetected. `parseResponse.ts:46` does `JSON.parse(match[1])` on a fenced block with **no try/catch** → raw error instead of the intended `ReceiptParseError`. `ReceiptExtractionResultSchema` applies `items.min(1)` and per-item `quantity.positive()`/`totalPrice` required (`claudeParser.ts:57`) — a single item with quantity 0 or null totalPrice **rejects the entire receipt** with a 422, discarding all correctly-parsed items. **Fails when:** AI returns 20 good items + one with `totalPrice:null` → whole scan lost (500) instead of keeping 20 and flagging 1. **Fix:** post-parse reconciliation (soft-warn); wrap the fenced-block parse in try/catch; make per-item validation lenient (drop-and-flag one bad item) instead of rejecting the whole receipt; record captured-vs-estimated provenance.

### Frontend / UX (P2/P3)

**P2 · Login/registration errors are invisible on grort.app — auth screens still use Alert.alert (#10, frontend).** `login.tsx:22,32` and `register.tsx:24,28,32,42` use `Alert.alert`, a documented no-op on RN Web (repo memory `feedback_web_alerts.md`). Every other screen uses the `Platform.OS === 'web' ? window.alert : Alert.alert` pattern (`scan.tsx:83-89`, `receipt-detail.tsx:31-34`, `receipts.tsx:49-50`, `profile.tsx:53-55`). **Smoking gun:** commit `ed40f8d` added web-alert handling to scan/trends/product-detail/_layout in one sweep but missed the login/register hunks. **Fails when:** a returning user fat-fingers their password → 401 → `Alert.alert` renders nothing → the Sign In button just looks broken. Same for taken-email/mismatched-password/short-password on register. This sits at the very top of the funnel, in front of the §2.1 dead-end. **Fix:** use the web-aware helper, or render errors inline as red text; a shared `showAlert()` util would kill this whole regression class.

**P2 · Frontend half of the onboarding dead-end — raw Postgres constraint error shown to the user (#11, frontend). Sharpens §2.1.** Backend `receipts.ts:64-65` returns `{ error: \`Receipt processing failed: ${err.message}\` }` — for the no-household path `err.message` is the raw PG `null value in column "household_id" of relation "stores" violates not-null constraint`. Frontend `scan.tsx:116` surfaces `err?.response?.data?.error` and `showError()` **does** work on web via `window.alert`, so the raw DB string is shown verbatim. The Scan screen (`scan.tsx:37-49`) says only "Upload a receipt image to scan it" — nothing about households; the sole household-creation UI is buried in `profile.tsx:167-192`. **Fails when:** "Joanne" (0 receipts in prod) uploads a receipt and gets a browser alert reading `…null value in column "household_id"…` with no idea she must go Profile → Create Household. 100% funnel kill + actively misleading text. **Fix:** (a) backend returns a stable user-facing string, never `err.message`; (b) frontend gates the Scan screen on `householdId` (already on the auth User, `AuthContext.tsx:9`) with a first-run "Create your household to start scanning" CTA.

**P3 · Receipt delete is only reachable via onLongPress — undiscoverable on desktop web (#21, frontend).** `receipts.tsx:65` the only list delete affordance is `onLongPress`; no visible button or swipe hint. Workaround: the detail screen has an explicit Delete button (`receipt-detail.tsx:113`). **Fix:** add a visible trash icon / context menu to the card, keep long-press as a native shortcut.

### Infra & deploy (P2/P3)

**P2 · Boot-time auto-migration with no rollback, no health gate, only a `:latest` image (#12, infra).** `Dockerfile:22` CMD `sh -c "npx tsx src/db/migrate.ts && npx tsx src/index.ts"` runs migrations every start; `migrate.ts:54-57` `process.exit(1)` on any error. Restart policy `unless-stopped` → a failing migrate short-circuits the `&&`, container exits, restart loop re-runs the same failing migration each boot. No healthcheck (`Config.Healthcheck` = null); nginx `depends_on` gates on start, not health. Only one image on the droplet: single `:latest` (`3b4ddd9f1fc2`); deploy does `docker load` + `compose up` overwriting `:latest` with no versioned tag to revert to. **Amplifies P0-1:** a migration that partially mutates data before failing leaves the single copy corrupt with nothing to restore. **Fix:** run migrations as a discrete gated step; take a pre-migration dump automatically; tag images by git SHA; add a container HEALTHCHECK.

**P3 · Prod runs the TS dev toolchain via tsx on every boot; the built dist/ artifact is never shipped (#24, infra).** `Dockerfile:22` runs `npx tsx src/index.ts` (transpiles at startup). tsx/typescript/ts-node/vitest/supertest are devDependencies yet `Dockerfile:14 npm ci` installs them (no `--omit=dev`). `start: node dist/index.js` and `build: tsc` are dead — dist/ is gitignored + in `.dockerignore` and verified absent: `docker exec … ls /app/dist` → No such file. **Fix:** either commit to tsx intentionally (move it to dependencies, document it) or build with `tsc` and run `node dist/index.js` with `npm ci --omit=dev`. Don't ship vitest/supertest/ts-node to prod.

**P3 · The grort container runs as root, no healthcheck, no CPU limit (#23, infra).** `docker exec … id` → uid=0(root); no `USER` directive; `Config.Healthcheck` = null; `NanoCpus` = 0 (only Memory ~384M capped). Any RCE/dependency compromise runs as root; a hung-but-alive process is never auto-restarted; a runaway loop can starve the 2-vCPU shared host. **Fix:** non-root `USER` (chown `/app/uploads`), a HEALTHCHECK, a CPU limit, ideally read-only rootfs + tmpfs scratch.

### Tests & quality (P2/P3)

**P2 · No test or typecheck gate between commit and production deploy (#13, tests). Structural root cause of §2.1.** `.github/workflows/deploy.yml` is the only CI: checkout → `docker build` → `docker save` → scp → `compose up` (lines 11-39). No `npm test`, `vitest`, `tsc`, or lint. `Dockerfile` runs TS through tsx **without ever compiling**, so the build never typechecks. `npx tsc --noEmit` in `backend/` currently emits **27 errors across 7 files** (analytics, auth, households, products, receipts, stores, receiptProcessingService); 12 of them are the Zod-v4 `.errors` bug (#18) shipped live purely because nothing runs the compiler. The 98-test suite is irrelevant to prod because nothing runs it before deploy. **Fix:** add a `test` job (`tsc --noEmit && vitest run` with a throwaway Postgres service) and make `deploy` `needs: [test]`; add `npm run build` (tsc) to the Dockerfile and run compiled JS.

**P2 · The entire receipt-processing pipeline is invoked by ZERO tests (#14, tests).** `grep -rn 'receiptProcessingService|processReceipt' src --include=*.test.ts` → none. Tests that need receipt data call `receiptRepository.create()` directly with hand-crafted valid rows (`routes/receipts.test.ts:43`: `// Create a receipt directly (bypassing AI)`). `resolveStore`/`findByBrandAndAddress`/`findByNameFuzzy` are imported by no test. So store dedup (§2.2), AI brand assignment (§2.3), the null-household path (§2.1), and reconciliation (§2.4) all live in untested code — which is exactly why 98 tests missed a total funnel-kill. **Fix:** integration tests calling `processReceipt()` with a stubbed AI extraction (inject via parserFactory) for: (a) a user with NO household, (b) two receipts from one store with whitespace/case/apostrophe variance asserting ONE store row, (c) an extraction whose items don't sum to subtotal.

**P3 · Reconciliation (§2.4) is asserted by zero tests, and the fixtures themselves violate it (#25, tests).** No test computes `SUM(items.total_price)` vs `receipts.subtotal`. `routes/receipts.test.ts:49-77` inserts subtotal 10.00 with items summing to 5.99+0.87 = **6.86** — a $3.14 mismatch baked into the fixture that no assertion catches, teaching the wrong invariant. **Fix:** add an invariant test asserting `|sum(items.total_price) − subtotal| <= 0.02` (or that the API surfaces a reconciliation-warning field); fix the fixture so items sum to subtotal.

---

## Recommended fix order

Two separate jobs run in parallel throughout: **fix the code** (stops new bad data) and **repair the existing production data** (cleans up the mess already there). They are different work — fixing the matcher does not merge the 4 Lunds store rows already in prod, and merging them does not stop the next scan from creating a 5th.

### Phase 0 — Stop the bleeding (this week, hours not days)
1. **Backups (P0-1, #1).** Nightly `pg_dump | gzip` shipped offsite + a tested restore. ~½ day. Unblocks: everything else can proceed without existential risk. *Do this before touching migrations or prod data.*
2. **`NODE_ENV=production` + global error middleware (#8).** ~1 hr. Stops stack-trace leaks; also improves the raw-error UX in #11.

### Phase 1 — Unblock onboarding (the funnel is 0-of-1)
3. **Backend: stop echoing `err.message`; return stable user strings (#11 part a).** ~1 hr.
4. **Frontend: gate Scan on `householdId` with a "Create household" CTA (#11 part b, §2.1).** ~½ day. Unblocks: every organic signup can now complete the core loop.
5. **Fix Alert.alert on login/register (#10).** ~1 hr. Users can finally see auth errors. Bundle a shared `showAlert()` util to prevent recurrence.

### Phase 2 — Make the AI data correctable and trustworthy (the actual value prop)
6. **Add schema discount field + weight/UoM + captured-vs-estimated flags; update the prompt (#2, #9).** ~1-2 days. Unblocks reconciliation being *possible*.
7. **Post-extraction reconciliation check that flags rather than silently stores (#2, #20).** ~½ day. Depends on 6.
8. **Review UI: add/delete item + editable quantity (#4).** ~1 day. Depends on the `/receipts/:id/items` POST/DELETE routes existing. Makes 7's flags actionable.
9. **Token-based product matching + honor the review flag instead of auto-merging (#3).** ~1-2 days. Stops new duplicate/merged products.

### Phase 3 — Harden the pipeline & deploy
10. **Wrap receipt write+items in a transaction; make product create idempotent (#7).** ~½ day.
11. **Add CI test+tsc gate; fix the 27 tsc errors incl. the 12 Zod `.errors` sites (#13, #18).** ~1 day. Unblocks: nothing silently regresses to prod again.
12. **Integration tests for processReceipt incl. no-household + store-variance + reconciliation (#14, #25).** ~1 day. Depends on 11.
13. **IDOR fixes (#5, #6, #15), migration/rollback + image SHA tags + healthcheck (#12), non-root container (#23).** ~1-2 days total. Lower urgency (UUID-gated) but cheap.

### Phase 4 — Polish / lower priority
14. Rate limiting + password policy (#17, §2.6), JWT revocation model (#16), matchProduct N+1 (#19), REVOKE sibling-DB CONNECT (#22), tsx→built-artifact (#24), discoverable receipt delete (#21).

### Data-repair jobs (parallel track — one-time cleanups, run AFTER backups exist)
- **Merge the fragmented store rows** — 4 Lunds & Byerlys → 1, 3 Target → 1, 2 Wayzata Muni → 1 (§2.2). Re-point `receipts.store_id`, then delete orphans. Requires a careful write; take a dump first.
- **Fix cross-contaminated brands** — `Target`/brand `Hy-Vee`, `Lunds & Byerlys`/brand `Cub Foods` (§2.3).
- **De-duplicate / un-merge products** — split the 'Stillways on Perms' collapse (5 raw strings → 5 products) and merge the Grapes+Fresh Grapes / bagel / President pairs (#3). This is the messiest job; do it after the matcher is fixed so it stays fixed.
- **Backfill discounts** where recoverable, or flag the 17 non-reconciling receipts as "needs review" once the schema field exists (#2).
- **Remove the two test accounts** from prod (§2.5).

---

## What the review could NOT determine

- **Whether any partial/orphaned receipt has ever actually occurred (#7).** All 39 prod receipts currently reconcile item-count-wise, consistent with serial scanning; I could not prove it has *never* fired, only that it hasn't left evidence. The race is real in code; its historical firing is unknown.
- **Exact real-vs-fabricated split on dates (#9).** The 2024-01-15 clustering and 2020 dates are *consistent with* rule-7 date defaulting, but I cannot prove those specific receipts had unreadable dates versus genuinely being those dates. Provenance flags (recommended in #9) would make this determinable going forward.
- **True count of duplicate/merged products (#3).** I confirmed specific pairs and the 5-string 'Stillways' collapse by hand; I did not exhaustively cluster all 243 products, so the total duplicate/merge count is a lower bound, not a census.
- **Whether prod S3 (`/uploads`) is actually locked down (§2.6 open item).** Prod uses `STORAGE_MODE=s3`; I did not test DO Spaces object ACLs or bucket policy from outside, so whether receipt images are publicly fetchable by UUID on Spaces is unverified (the express.static no-auth issue is local/dev-mode only).
- **Google OAuth completeness (dimension 1).** The auth findings cover JWT/password/IDOR; I did not exercise the Google OAuth flow end-to-end, so its completeness/security is not assessed here.
- **Actual restore integrity.** I recommend backups (#1) but by the read-only constraint could not create or test-restore a dump; "verify a restore works" remains an action item, not a verified state.
- **Frontend line/col precision.** Mobile file:line citations were read from source in this session; a few UI line numbers may drift by a line or two against the exact deployed bundle, but the referenced code and behavior are accurate.
