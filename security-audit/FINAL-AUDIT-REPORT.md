# Hormang Platform — Comprehensive Security & SEO Audit Report

**Target Branch:** `main`  
**Repository:** `https://github.com/shuhrat1234/hormang-demo-main.git`  
**Latest Head Commit:** `484db3b`  
**Audit Date:** October 30, 2026  
**Audited Subsystems:** `@workspace/api-server`, `@workspace/hormang-landing`, `@workspace/db`

---

## 1. Executive Summary

This report delivers the complete engineering audit and verification record for the Hormang platform. Two parallel operational workstreams were planned, executed, tested, and pushed to the upstream `main` branch:

1. **Adversarial Security Remediation (Cloudflare Deep Audit Scope):**
   * Systematic resolution of critical, high, medium, and low severity vulnerabilities across administrative authentication, wallet concurrency, OTP bypass vectors, proposal limit racing, and PII exposure.
   * Per explicit directive from project stakeholders, **Item 8** (`click.ts`, `payme.ts`, and `admin.ts` timing-safe comparison) was deferred for internal team review and preserved unmodified. All other items (Items 1–7) were fully resolved.

2. **Search Engine Appearance & Technical SEO Overhaul (Google & Yandex):**
   * Transformation of the platform's public search presence from an unindexed, generic globe-icon listing to an enterprise-grade search snippet featuring brand favicons, multilingual meta descriptions, OpenGraph social cards, Schema.org JSON-LD structured data, and search engine directives (`sitemap.xml`, `robots.txt`).

All builds compile cleanly with zero errors. All patches have been merged and pushed to `origin/main`.

---

## 2. Git Commit Record

The following commits record the work delivered on branch `main`:

| Commit Hash | Workstream | Description |
| :--- | :--- | :--- |
| `dbc10cf` | Security (P1) | `fix(security): resolve P1 vulnerabilities (items 2, 3, 4, 5)` |
| `10635fa` | Security (P0) | `fix(security): resolve P0 vulnerability (item 1)` |
| `4cd2820` | Security (P2) | `fix(security): resolve P2 vulnerabilities (items 6, 7)` |
| `fb45163` | SEO / Snippet | `feat(seo): enhance Google search snippet, favicons, structured data and sitemap` |
| `484db3b` | Documentation | `docs(audit): add final comprehensive audit and remediation report` |

---

## 3. Security Audit & Vulnerability Remediation Ledger

### Summary Status Table

| Item | Priority | Vulnerability ID | Impacted Component | Status |
| :--- | :--- | :--- | :--- | :--- |
| **1** | **P0 (Critical)** | `auth.admin.hardcoded_password_bypass` | `artifacts/api-server/src/routes/admin-auth.ts` | **RESOLVED** |
| **2** | **P1 (High)** | `wallet.claim_free.concurrency_race_condition` | `artifacts/api-server/src/routes/wallet.ts` | **RESOLVED** |
| **3** | **P1 (Medium)** | `auth.reviewer.static_otp_production_bypass` | `artifacts/api-server/src/routes/auth.ts` | **RESOLVED** |
| **4** | **P1 (Medium)** | `offers.submit.active_limit_concurrency_bypass` | `artifacts/api-server/src/routes/offers.ts` | **RESOLVED** |
| **5** | **P1 (Medium)** | `requests.details.unauthenticated_pii_disclosure` | `api-server/requests.ts`, `landing/requests-client.ts` | **RESOLVED** |
| **6** | **P2 (Low)** | `reports.count.unauthenticated_enumeration` | `api-server/reports.ts`, `landing/report-store.ts` | **RESOLVED** |
| **7** | **P2 (Low)** | `client.localstorage.phone_registry_leak` | `artifacts/hormang-landing/src/contexts/auth-context.tsx` | **RESOLVED** |
| **8** | — | `crypto.timing_attack.string_comparison` | `click.ts`, `payme.ts`, `admin.ts` | **DEFERRED (Team Discussion)** |

---

### Detailed Vulnerability Breakdown

#### Item 1: `auth.admin.hardcoded_password_bypass`
* **Severity:** **CRITICAL (P0)**
* **Component:** `artifacts/api-server/src/routes/admin-auth.ts`
* **Vulnerability Description:** The administrator login endpoint (`POST /api/admin/login`) included a hardcoded fallback check:
  ```typescript
  password === "hormang2024"
  ```
  Any unauthenticated actor possessing this credential could bypass environment-defined secrets (`ADMIN_PASSWORD` or `ADMIN_API_KEY`) and obtain a 12-hour administrative JSON Web Token granting unrestricted root privileges over orders, users, tariffs, and databases.
* **Remediation Implemented:**
  1. The static fallback password was purged completely from the codebase.
  2. Input validation now rejects empty or non-string passwords with `400 Bad Request`.
  3. Authentication is strictly evaluated against `process.env.ADMIN_PASSWORD` and `process.env.ADMIN_API_KEY`.
* **Verification:** Verified that login attempts with `"hormang2024"` receive `401 Unauthorized` unless explicitly configured in `.env`.

---

#### Item 2: `wallet.claim_free.concurrency_race_condition`
* **Severity:** **HIGH (P1)**
* **Component:** `artifacts/api-server/src/routes/wallet.ts`
* **Vulnerability Description:** The promotional free tier claim logic evaluated `paidOrders.length >= tier.perUserLimit` outside a database transaction and without row locks. An adversary issuing concurrent HTTP requests could trigger race conditions where all threads read zero previous claims, resulting in multiple free Tanga token credits.
* **Remediation Implemented:**
  1. All limit evaluations (`perUserLimit` and `saleLimit`) were relocated inside `db.transaction(async (tx) => { ... })`.
  2. Added pessimistic row-level locking (`.for("update")`) on the user record in `usersTable`.
  3. Added row-level locking on the promotion record in `pricingTiersTable`.
  4. Concurrently dispatched requests are serialized; subsequent requests encounter updated order counts and fail with `"Ushbu bepul tarifdan foydalanish limiti tugagan"`.
* **Verification:** End-to-end transaction isolation validated under concurrent simulation.

---

#### Item 3: `auth.reviewer.static_otp_production_bypass`
* **Severity:** **MEDIUM (P1)**
* **Component:** `artifacts/api-server/src/routes/auth.ts`
* **Vulnerability Description:** A static OTP backdoor implemented for Google Play Console app review (`REVIEWER_TEST_PHONE_DIGITS = "998901234567"` with static OTP `"123456"`) was evaluated unconditionally in production environments. Any party aware of this test phone number could log in without SMS verification.
* **Remediation Implemented:**
  1. Guarded `isReviewerPhone()` and `verifyOtp()` with an environment check:
     ```typescript
     const isReviewerBypassAllowed = !env.isProduction || process.env.ENABLE_REVIEWER_BYPASS === "true";
     if (!isReviewerBypassAllowed) return false;
     ```
  2. In production, this bypass is permanently inactive by default. It can only be activated temporarily via explicit environment variable injection during Google Play review cycles.
* **Verification:** Confirmed standard authentication flow is enforced in production mode.

---

#### Item 4: `offers.submit.active_limit_concurrency_bypass`
* **Severity:** **MEDIUM (P1)**
* **Component:** `artifacts/api-server/src/routes/offers.ts`
* **Vulnerability Description:** The business rule limiting customer requests to at most 5 active provider offers (`MAX_ACTIVE_OFFERS = 5`) was verified asynchronously prior to opening a database transaction. Concurrent bids submitted simultaneously could bypass the cap, debiting provider wallets and creating 6 or more proposals.
* **Remediation Implemented:**
  1. Acquired an exclusive row lock on the target request (`requestsTable ... for("update")`) inside `db.transaction`.
  2. Re-calculated active offer counts and duplicate submission checks under the active lock prior to wallet deduction.
  3. If the cap is reached, the transaction aborts and returns `"active_limit"` without deducting Tanga.
* **Verification:** Concurrency safety enforced by Postgres row-level locks.

---

#### Item 5: `requests.details.unauthenticated_pii_disclosure`
* **Severity:** **MEDIUM (P1)**
* **Components:**
  * `artifacts/api-server/src/routes/requests.ts`
  * `artifacts/hormang-landing/src/lib/requests-client.ts`
* **Vulnerability Description:** `GET /api/requests/:id` was an unauthenticated public route. Anyone possessing or guessing a request UUID could retrieve sensitive customer Personally Identifiable Information (PII), including full customer names, districts, questionnaire answers, and uploaded media attachments.
* **Remediation Implemented:**
  1. Applied `requireAuth` middleware to `GET /:id`.
  2. Enforced Role-Based Access Control (RBAC): only the customer who authored the request (`customerId === req.user.id`), platform administrators (`role === "admin"`), or registered service providers (`role === "provider"`) are authorized. Unauthorized parties receive `403 Forbidden`.
  3. Updated the frontend client (`fetchRequestById`) to supply valid Bearer credentials.
* **Verification:** Unauthenticated and unauthorized callers are blocked with `401` and `403` respectively.

---

#### Item 6: `reports.count.unauthenticated_enumeration`
* **Severity:** **LOW (P2)**
* **Components:**
  * `artifacts/api-server/src/routes/reports.ts`
  * `artifacts/hormang-landing/src/lib/report-store.ts`
* **Vulnerability Description:** `GET /api/reports/count/:userId` allowed unauthenticated enumeration of abuse report counts against any user on the platform.
* **Remediation Implemented:**
  1. Applied `requireAuth` middleware.
  2. Enforced access restrictions so only administrators or the targeted user themselves can view their report count.
  3. Updated client store to send authenticated requests.
* **Verification:** Verified protection against unauthorized user enumeration.

---

#### Item 7: `client.localstorage.phone_registry_leak`
* **Severity:** **LOW (P2)**
* **Component:** `artifacts/hormang-landing/src/contexts/auth-context.tsx`
* **Vulnerability Description:** On shared devices (e.g., internet cafes, family computers), logging out or switching accounts failed to clear `hormang_phone_registry` and `hormang_customer_registry` from browser `localStorage`, leaking historical phone numbers and names.
* **Remediation Implemented:**
  1. Appended both registry keys to `GLOBAL_KEYS_TO_CLEAR_ON_USER_SWITCH`.
  2. Ensured immediate purging during both explicit logout (`logout()`) and user identity transitions (`handleUserSwitch()`).
* **Verification:** Local storage inspections confirm complete data sanitation upon session termination.

---

## 4. Search Engine Snippet, Branding & Technical SEO Overhaul

### Problem Definition
In search engine results (Google and Yandex), queries for `hormang.co.uz` previously returned:
* A generic fallback browser globe icon.
* Missing or malformed meta description.
* No brand recognition or rich snippet elements.
* Complete absence of sitelinks (sub-navigation links like those seen on established platforms such as Facebook, Uzum, etc.).

### Technical Implementations (`fb45163`)

#### 1. High-Resolution Favicon Suite & Mobile Icons
Added comprehensive brand icon assets in `artifacts/hormang-landing/index.html`:
* `favicon-192x192.png`: High-density icon for Google Mobile SERP snippets.
* `favicon-512x512.png`: PWA manifest icon.
* `favicon.svg`: Scalable vector icon for modern desktop browser tabs.
* `apple-touch-icon.png`: iOS home screen bookmark icon.

#### 2. Multilingual Search Descriptions & OpenGraph Protocols
* Configured canonical `<meta name="description">` and `<meta name="keywords">` in both Uzbek and Russian, clearly describing Hormang as the verified marketplace for domestic masters and specialized home services across Tashkent and Uzbekistan.
* Integrated OpenGraph (`og:title`, `og:description`, `og:image`, `og:site_name`, `og:locale`) and Twitter Card specifications for link previews across Telegram, Instagram, and web chats.

#### 3. Schema.org JSON-LD Structured Data
Implemented machine-readable semantic schemas:
* **`WebSite` Schema:** Declares the site name, URL, and internal search potential.
* **`Organization` Schema:** Declares the official logo, operating domain, customer service contact, and operational territory (`UZ`).
* **`SiteNavigationElement` Schema:** Explicitly defines platform navigation routes (*Mijozlarga*, *Ijrochilarga*, *Xizmatlar*, *Biz haqimizda*). This provides the structural signals search engine algorithms (Google PageRank & Yandex TIC) use to generate **Sitelinks** underneath the main snippet.

#### 4. Search Engine Directives & Verification
* **Google Verification Tag:** Embedded `<meta name="google-site-verification" content="lqTPfTe0bbFgq4cprOyBcCwXPRYuFaFVMfk7LP67aFo" />` directly in `<head>`.
* **Robots Configuration (`public/robots.txt`):** Configured permissive crawler guidelines and explicit sitemap reference.
* **XML Sitemap (`public/sitemap.xml`):** Generated a multi-language XML sitemap covering all canonical landing pages and service category routes with change frequencies and priorities.

---

## 5. Build & Compilation Verification

Prior to pushing to `origin/main`, both primary production workspaces were compiled from source:

* **Backend (`@workspace/api-server`):**
  ```bash
  pnpm --filter @workspace/api-server build
  # Done in 314ms -> dist/index.cjs (1.5mb) | Exit Code: 0
  ```
* **Frontend (`@workspace/hormang-landing`):**
  ```bash
  pnpm --filter @workspace/hormang-landing build
  # 7670 modules transformed -> dist/public | Exit Code: 0
  ```

---

## 6. Actionable Operational Next Steps

1. **Google Search Console Ownership:**
   * Open the Search Console modal for `https://hormang.co.uz/`.
   * Under verification methods, select **HTML Tag** and click **Verify** (the tag is already deployed in `index.html`).
   * Navigate to **Sitemaps** ➔ submit `sitemap.xml`.
   * Use **URL Inspection** ➔ enter `https://hormang.co.uz/` ➔ click **Request Indexing** to fast-track snippet and favicon updates.

2. **Yandex Webmaster:**
   * Register `https://hormang.co.uz` at `webmaster.yandex.ru`.
   * Submit `sitemap.xml`.
   * Under **Site Information ➔ Sitelinks**, configure custom titles and visible sublinks.

3. **Deferred Security Item 8:**
   * Once team review is complete, implement `crypto.timingSafeEqual` in `click.ts`, `payme.ts`, and `admin.ts`.
