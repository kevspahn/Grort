# Grort — Master Review Blueprint

**Created:** 2026-07-11 by Claude
**Scope:** Full-stack review of the Grort app (backend, mobile/web, infra) plus an audit of live production user data.
**Mode:** Read-only review. No production writes, no repo changes, until Kevin approves a fix list.

---

## 1. System under review

Grort is a receipt-scanning / grocery price-tracking app.

- **Backend:** Express 5 + Node 22, TypeScript, PostgreSQL 16, Zod validation, JWT auth.
- **AI:** Claude (switchable to OpenAI/Gemini via `AI_PROVIDER`) parses receipt photos into structured items.
- **Frontend:** Expo SDK 55 (React Native Web), served as static files by the same Express process.
- **Storage:** DigitalOcean Spaces (S3-compatible), `STORAGE_MODE=s3` in prod.
- **Prod:** Hetzner shared droplet, `spahndigital-grort-1` container, nginx + certbot, shared Postgres. Live at grort.app.

**Production access (verified):**
`ssh -i ~/.ssh/spahndigital_deploy deploy@87.99.136.148` — note the `hetzner` block in `~/.ssh/config` has **no `IdentityFile`**, so plain `ssh hetzner` fails. Worth fixing.

**Production scale (as of 2026-07-11):** 4 users, 39 receipts, 424 receipt items, 243 products, 13 stores, 1 household.

---

## 2. Confirmed findings (established before fan-out)

These are verified against live production data and source. They are the anchor for the review.

### 2.1 CRITICAL — A user without a household cannot scan a receipt at all

`backend/src/services/receiptProcessingService.ts` → `resolveStore()`:

```ts
if (!householdId) {
  // For users without a household, create a temporary store record
  return storeRepository.create({ ..., householdId: householdId! });  // <-- null!
}
```

The `householdId!` non-null assertion is applied to a value the branch just proved is `null`. It is
inserted into `stores.household_id`, declared `UUID NOT NULL REFERENCES households(id)`. Postgres
raises a not-null violation, the route catches it and returns a generic **500 "Failed to process
receipt. Please try again."** Retrying can never succeed.

**Registration does not create a household** (`authService.register` inserts a user with no household),
and the *only* household-creation UI is buried in the **Profile tab**. Nothing on the Scan screen tells
a new user they need a household first.

**Production evidence:** user "Joanne" registered 2026-04-04 and has **0 receipts**. Kevin (the only user
with a household) has all 39. Two other accounts are test accounts. This is a 100% funnel kill for every
organic signup.

**Why tests missed it:** `tests/scenarios/onboarding-flow.test.ts` creates a household in step 2, so the
null-household path is never exercised.

### 2.2 HIGH — Store records fragment badly; price history is silently broken

The app's core value ("track price history by store") depends on one store = one row. Production has 13
store rows for roughly 6 real stores:

| Real store | Rows in prod |
|---|---|
| Lunds & Byerlys | **4** (`LUNDS&BYERLYS`, `LUND'S & BYERLYS WAYZATA`, `LUNDS & BYERLYS WAYZATA`, `Lunds & Byerlys`) |
| Target | **3** |
| Wayzata Muni / "Unknown Store" | 2 (same address, `747 MILL ST`) |

Causes, all in `storeRepository` / `resolveStore`:
- `findByBrandAndAddress` requires an **exact** string match on both fields — any AI whitespace,
  apostrophe, or casing difference creates a new store.
- `findByNameFuzzy` is not fuzzy; it is `LOWER(name) = LOWER($2)`, an exact match.
- The `UNIQUE(brand, address, household_id)` constraint **never fires when brand or address is NULL**,
  because Postgres treats NULLs as distinct. So null-brand stores pile up freely.

### 2.3 HIGH — AI mis-assigns store brands (cross-contamination)

Production rows where name and brand disagree, in ways that can only come from the parser:
- store named **`Target`** carries brand **`Hy-Vee`**
- store named **`Lunds & Byerlys`** carries brand **`Cub Foods`**

This corrupts brand-level price comparisons.

### 2.4 HIGH — Line items do not sum to the receipt subtotal on ~half of receipts

Comparing `SUM(receipt_items.total_price)` against `receipts.subtotal`:

- **18 receipts match** (within $0.02)
- **17 receipts do NOT match** — discrepancies up to **$11.93**
- 4 receipts have **neither subtotal nor tax** captured

Discrepancies run in *both* directions, so it is not a simple missing-tax bug. Hypotheses to test:
dropped line items, mishandled weighted/by-the-pound items (`quantity` is `DECIMAL(10,3)`), and
uncaptured coupons/discounts (there is no discount field in the schema at all).

Nothing in the app validates that items reconcile to the total, so the user is never told the data is wrong.

### 2.5 MEDIUM — Test accounts live in the production database

`Claude Test <cla***@grort.app>` and `Debug <tes***@test.com>` are real rows in the prod `users` table.

### 2.6 Security observations to verify under fan-out

- `app.use(cors())` — **fully open CORS**, every origin allowed.
- `JWT_SECRET` falls back to the hardcoded `'dev-secret-change-me'` if the env var is missing. Prod does
  set a real secret (verified), so this is latent, not live — but it is one bad deploy away from
  universally forgeable tokens.
- **No rate limiting** on `/auth/login` or `/auth/register` — unlimited credential stuffing.
- CSP allows `'unsafe-inline'` for `scriptSrc`.
- `/uploads` is served by `express.static` with **no auth** — receipt images are readable by anyone who
  knows the UUID. (Prod uses S3, so this mainly affects local/dev mode — confirm.)
- Zod v4 renamed `error.errors` → `error.issues`; `routes/auth.ts` still reads `err.errors`, which likely
  serialises as `undefined` in validation responses.

---

## 3. Review dimensions (fan-out plan)

Each dimension gets a dedicated agent. Every finding must be **verified against real code or real prod
data** and include a concrete failure scenario. Speculation is rejected.

| # | Dimension | Focus |
|---|---|---|
| 1 | **Auth & access control** | JWT lifecycle, household authorization (IDOR: can user A read user B's receipts?), password policy, Google OAuth completeness, rate limiting |
| 2 | **Backend correctness** | Routes, repositories, SQL, transaction boundaries, error handling, N+1 queries, Express 5 pitfalls |
| 3 | **AI pipeline & data integrity** | Prompt, parse/validate, store+product matching, the subtotal reconciliation bug, cost/latency, failure modes |
| 4 | **Frontend / UX** | Expo web app, the onboarding dead-end, error surfaces, offline, accessibility, the scan→review flow |
| 5 | **Infra, deploy & secrets** | Dockerfile, compose, nginx, CSP, backups, migrations-on-boot, CI, secret hygiene |
| 6 | **Tests & quality** | Coverage gaps (esp. the null-household path), test quality, what a bug like 2.1 says about the suite |

---

## 4. Prioritization rubric

- **P0** — Data loss, security breach, or a user cannot complete the core loop. (2.1 is P0.)
- **P1** — Core value prop silently degraded. (2.2, 2.3, 2.4.)
- **P2** — Real bug, workaround exists.
- **P3** — Polish, tech debt, opportunity.

---

## 5. Rules of engagement

1. **Read-only.** No writes to prod DB, no code changes, until Kevin signs off on a fix list.
2. **Evidence required.** Every finding cites `file:line` or a prod query result.
3. **No duplicate rediscovery.** Section 2 is settled; go deeper, don't re-derive.
4. Production data is real personal data (grocery history, emails). Mask PII in all output.

---

## 6. Findings log

_Populated by the fan-out. See `docs/REVIEW-FINDINGS.md` for the full verified set._
