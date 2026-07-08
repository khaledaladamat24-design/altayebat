# الطيبات — Al-Tayebat

تطبيق ويب لطلب الأكل الصحي والكيتو والمؤونة البلدية في الأردن — مستوحى من هيكل تطبيق كيتا.

## Run & Operate

- `pnpm --filter @workspace/al-tayebat run dev` — frontend (port assigned by workflow)
- `pnpm --filter @workspace/api-server run dev` — API server
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks + Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts run seed:categories` — repair/upsert canonical categories
- Required env: `DATABASE_URL`
- A husky `pre-commit` hook runs `lint-staged` (prettier on staged files) so the CI `format:check` gate stays green; it self-installs via the root `prepare` script.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind (Arabic RTL, Cairo/Tajawal font)
- API: Express 5 · DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`) + `drizzle-zod` · API codegen: Orval · Build: esbuild (CJS)
- Native: Capacitor (Android)

## Where things live

- `lib/api-spec/openapi.yaml` — API contract source of truth
- `lib/db/src/schema/` — DB schema
- `artifacts/api-server/src/routes/` — Express route handlers (shared helpers in `src/lib/`)
- `artifacts/al-tayebat/src/` — React frontend (Arabic RTL)

## Architecture decisions

- Session-based guest cart/orders via `localStorage` sessionId (key `al_tayebat_session`) — browsing/cart need no auth
- RTL-first, Arabic primary; bilingual AR/EN toggle (`al_tayebat_lang`, default `ar`)
- Delivery: free above 20 JD, otherwise 1.5 JD fixed fee
- OpenAPI-first contract with Orval codegen for type-safe hooks
- Single-vendor cart **enforced**: `POST /cart` rejects a different-vendor add with `409 {code:"DIFFERENT_VENDOR"}` unless `replace:true` (then it clears the cart first). The client `CartActionsProvider` catches the 409, shows a confirm dialog ("إفراغ وإضافة"), and retries with `replace:true`. Vendor of the cart drives order vendorId + checkout payment info.

## User preferences

- Primary colors: deep green + rose/pink accent
- Full Arabic RTL layout, no ads inside the app
- Jordan market focus (JD currency, د.أ)
- Browsing/cart work as guest, but **placing an order requires a phone already registered in the `users` table** (anti-fraud — see Order placement gate)
- Payment integration to be added later (currently COD + manual CliQ / IBAN bank transfer / e-wallet; no internal wallet/balance)

## Auth flows

- **Email:** Clerk handles password + email OTP; re-login uses password; reset via Clerk's reset-password OTP.
- **Phone:** Firebase OTP is used **only for new accounts** to prove ownership, then a "Set Password" screen stores a bcrypt hash (`users.password_hash`). Returning logins use phone + password (`POST /api/auth/phone-login`) — **no OTP**.
- **Phone password reset** is reset-only: refuses unregistered numbers (redirects to signup), verifies via Firebase OTP, then sets a new password. A client `isPhoneReset` flag swaps the copy and is cleared on signup/back.
- Phones are normalized server-side to canonical `07XXXXXXXX` (`+962…`/`00962…`/`07…` all resolve to one account) via `lib/phone.ts`. `GET /api/auth/check?phone=` returns `{exists, hasPassword}`.
- **Native phone OTP** uses `@capacitor-firebase/authentication` (NOT the web `RecaptchaVerifier`, which froze the WebView). Requires `google-services.json`, SHA-1/256 in Firebase, and Play Integrity. Real-number SMS works only in a native build, never the browser preview.

## Order placement gate (anti-fraud)

- **Every order (including COD) is rejected unless `customerPhone` resolves to an existing `users` row.** Enforced in `POST /api/orders` before any charge logic. Matched in canonical form via `normalizePhone`.
- **Exception — signed-in phone claim:** if the caller is a signed-in user (Clerk/Firebase via `getActingDbUserId`) whose `users.phone` is empty, the entered phone is claimed onto their profile (atomic conditional UPDATE `phone IS NULL`) and the order proceeds, linked to that user. Users with a different phone on file, and guests, still get 403.
- Rejections: invalid phone → `400 {code:"INVALID_PHONE"}`; unregistered → `403 {code:"PHONE_NOT_REGISTERED"}` (Arabic message). Checkout detects `PHONE_NOT_REGISTERED`, stashes the form + `returnTo`, and routes to `/auth` (cart preserved via sessionId).
- Phone accounts are created via the Firebase-OTP signup flow; email-only (Clerk) signups store no phone, so they still hit the gate until they register one.

## Zones (Healthy / Regular / Grocery)

- Products and categories carry a `food_type` (`healthy | regular | grocery`, default `healthy`; products indexed).
- `food_type` is anchored on the **product** (a vendor may span zones), and on categories for the home rail. **Drift is intentional** — no constraint forces product↔category to match; filtering always uses the product's own `food_type`.
- `GET /api/products` (+ `/featured`, `/bestsellers`) and `/api/categories` accept optional `?foodType=`; invalid/missing returns everything.
- Home has a sticky zone toggle (`al_tayebat_zone`, default `healthy`) with an empty-state per zone.
- The categories page (`/categories`) prepends an **Offers** card (rose accent) → `/offers/:zone`, mirroring the home offers pill.
- **Vendor registration store name:** Arabic name required, English optional; server accepts either and falls back `storeName = enName || arName` (legacy rows unaffected). Enabling the vendor delivery toggle requires a confirm dialog + persistent warning that delivery is the vendor's own responsibility (no app delivery company yet — also stated in the privacy policy).
- **Vendor specialty** in registration (`register.tsx`) is the 3 zones (`healthy/regular/grocery`), **multi-select**, stored comma-separated in the existing single `vendor_profiles.category` text column (e.g. `healthy,grocery`) — no DB change. Treated as opaque text elsewhere; product-add category dropdowns are unchanged.

## Offers / Deals (العروضات)

- Products carry `is_on_sale` (bool); `original_price > price` drives the strikethrough. `GET /api/products?onSale=true` (combinable with `?foodType=`).
- Home prepends a virtual **Offers** pill (not a DB category) → `/offers/:zone`.
- Product card shows the "عرض" badge when `isOnSale || hasDiscount`; strikethrough only when `original_price > price`.
- **Sale-integrity validation** (server, both POST/PUT admin product routes): reject `400` when `isOnSale` is true without an `original_price` strictly greater than `price` (PUT uses effective values from the existing row).

## Categories + seed

- Categories carry `name` (EN) + `nameAr` (AR); UI renders EN when `lang==="en"`, else AR.
- Canonical list — Healthy: keto, vegetables, pantry, drinks, dairy, nuts, sweets, meat. Regular: feasts, fastfood, pastries, sweets-cakes, appetizers, drinks-juices.
- **Startup seed** (`seed-categories.ts`, run after `app.listen`) idempotently inserts-if-missing (by slug). **Why:** Replit publish copies schema but NOT rows, so prod was missing the regular categories. Failures are logged, never block startup. Use the manual `seed:categories` script to force-correct drifted metadata.

## Vendor dashboard (live orders)

- `/vendor-dashboard` polls `GET /api/vendors/:id/orders?status=pending` every 5 s. Cards Accept (→ `preparing`) / Reject (→ `cancelled`). An in-app Web-Audio alert loops while there are pending orders (mute pref `al_tayebat_vendor_muted`).
- Online/Offline toggle (`PATCH /api/vendors/:id`) excludes an offline vendor's products from list/featured/bestsellers (single-product + category endpoints stay unfiltered so carts keep working).
- **Status transitions** are server-enforced via atomic conditional UPDATE; invalid/stale transitions return `409`.
- **Authz (`lib/vendor-auth.ts`):** caller must be the signed-in user owning the vendor; super-admin email + `x-admin-key` bypass. Identity resolves from the Clerk cookie or `x-firebase-uid` header (phone users) — client write calls use `authHeaders()`.
  - Owner-gated: `GET /vendors/:id/orders`, `PATCH /vendors/:id`, `PATCH /orders/:id/status`, vendor product create/update/delete, vendor ads, `DELETE /vendors/:id`.
  - Admin-only: `PATCH /vendors/:id/status` (approval state).

## Payment methods (checkout)

- Methods: `cod | cliq | iban | ewallet`. **No internal wallet/balance system** — it was fully removed (DB tables, server routes, lib, and `/wallet` UI all deleted).
- **Checkout payment info** is fetched live from the cart's vendor: CliQ alias (`cliqAlias`), bank/IBAN (`bankAccount`), and e-wallet number (`walletNumber`). Unset options are disabled, leaving COD always available.
- The three **manual-transfer methods (cliq/iban/ewallet)** show an educational banner ("💡 تنويه: الدفع يتم يدوياً…") and **require a receipt screenshot upload before Confirm**. This is enforced **both** client-side and server-side: `POST /api/orders` rejects an unknown method (`400 INVALID_PAYMENT_METHOD`) and a manual method missing a receipt (`400 RECEIPT_REQUIRED`). `paymentStatus` is derived from the method (`pending` for manual, `cod` for COD), not from screenshot presence.

## Vendor push notifications (FCM) — looping new-order alarm

- New orders fire an FCM push to the vendor's `device_tokens` (`sendPushToUser`, lazy Firebase Admin from `FIREBASE_SERVICE_ACCOUNT`). Client registration is native-only.
- **The alert sound LOOPS until stopped manually**, even when the app is closed — implemented natively (a notification-channel sound only plays once). Server sends a **data-only** high-priority message so `onMessageReceived` fires when backgrounded/killed; a foreground service loops the alarm + vibration with an "إيقاف الصوت" stop action; opening the app stops it. Skipped while the app is foreground (the in-app loop handles that). A try/catch fallback notification covers Android 12+ FGS-start denial.
- Real push + looping sound fire only in a native Android build, never the browser preview. See `.agents/memory/android-notification-channel.md` for the wiring constraints.

## Android (Capacitor)

- Shell config: `capacitor.config.ts` (appId `com.altayebat.app`).
- CI `.github/workflows/main.yml` builds a **signed release APK + AAB** on push to `main` + `workflow_dispatch` (falls back to unsigned debug if `ANDROID_KEYSTORE_BASE64` is unset).
- Native builds need `VITE_API_BASE_URL` pointing at the deployed API (relative `/api` won't reach the backend from the device). Prod: `https://al-tayebat-nour.replit.app`; privacy policy at `/privacy-policy`.
- GitHub secrets: `VITE_API_BASE_URL`, `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_FIREBASE_*` (6), and the 4 `ANDROID_*` signing secrets.
- **Keystore backup:** the release keystore + passwords live gitignored at `.local/android-signing/`. **Back these up offline** — Play requires the same signing key for every update; losing it blocks updates.

## Gotchas

- Always run codegen after OpenAPI spec changes.
- Products route must declare `/featured` and `/bestsellers` BEFORE `/:id`.
- **Admin password** is the `ADMIN_PASSWORD` secret (backend falls back to legacy `tayebat2024` with a warning if unset). Frontend never hardcodes it — typed on `/admin`, cached in `sessionStorage`. Super-admin email bypasses the password.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
