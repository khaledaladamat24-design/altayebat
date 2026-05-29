# الطيبات — Al-Tayebat

تطبيق ويب لطلب الأكل الصحي والكيتو والمؤونة البلدية في الأردن — مستوحى من هيكل تطبيق كيتا.

## Run & Operate

- `pnpm --filter @workspace/al-tayebat run dev` — run the frontend (port assigned by workflow)
- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS (Arabic RTL, Cairo/Tajawal font)
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — API contract source of truth
- `lib/db/src/schema/` — DB schema (categories, products, carts, orders, banners)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/al-tayebat/src/` — React frontend (Arabic RTL)

## Architecture decisions

- Session-based guest cart/orders using `localStorage` sessionId — no auth required
- RTL-first layout with Arabic as the primary language
- Free delivery above 20 JD, 1.5 JD fixed fee below
- COD only (الدفع عند الاستلام) — payment to be added later
- OpenAPI-first contract with Orval codegen for type-safe hooks

## Product

- الصفحة الرئيسية: بانرات ترويجية، أقسام، منتجات مميزة، الأكثر مبيعاً
- أقسام المنتجات: الكيتو، الخضروات العضوية، المؤونة الصحية، المشروبات، الألبان، المكسرات، الحلويات الطبيعية، اللحوم
- السلة والدفع: إتمام الطلب بالاسم والهاتف والعنوان، الدفع عند الاستلام
- طلباتي: تتبع الطلبات حتى لغير المسجلين عبر sessionId

## User preferences

- Primary colors: Deep green + rose/pink accent
- Full Arabic RTL layout
- No ads inside the app
- No auth required — app works fully as guest
- Jordan market focus (JD currency, د.أ)
- Payment integration to be added later

## Auth flows

- **Email:** Clerk handles password + email_code OTP. Re-login uses password (no fresh OTP).
- **Phone:** Firebase OTP is used **only for new accounts** to prove ownership. Right after OTP verify, the user is taken to a "Set Password" screen which `POST /api/auth/set-password`s a bcrypt hash into `users.password_hash`. Subsequent logins go through `POST /api/auth/phone-login` (phone + password) — **no OTP on returning logins**.
- `lib/db/src/schema/users.ts` has `passwordHash` column (added 2026-05).
- Phone numbers are normalized server-side: `0791234567`, `+962791234567`, and `00962791234567` all resolve to the same account (`07XXXXXXXX` canonical form).
- `GET /api/auth/check?phone=...` returns `{exists, hasPassword}` so the UI can decide whether to show password vs OTP.

## Vendor dashboard (live orders)

- `/vendor-dashboard` polls `GET /api/vendors/:id/orders?status=pending` every 5 s and shows them in a new "الطلبات" tab. Each card has Accept (→ `PATCH /api/orders/:id/status {status:"preparing"}`) and Reject (→ `cancelled`).
- An audio alert loops every 1.4 s using the Web Audio API (synthesised ding-dong, no mp3 asset, Capacitor/iOS friendly) while there are pending orders. It stops the instant the last pending order is accepted/rejected or the user toggles mute. Mute pref persists in `localStorage` key `al_tayebat_vendor_muted`.
- Online/Offline toggle in the dashboard header → `PATCH /api/vendors/:id {isOnline}`. When offline, the vendor's products are excluded from `/api/products`, `/api/products/featured`, and `/api/products/bestsellers` via `or(isNull(productsTable.vendorId), eq(vendorProfilesTable.isOnline, true))`. Single-product GET and category endpoints are *not* filtered, so existing carts/checkouts keep working.
- New orders' `vendorId` is set from the first cart item's product (single-vendor cart assumption). Pre-existing orders have NULL `vendorId` and won't appear in any vendor's dashboard.
- **Authz**: `GET /api/vendors/:id/orders`, `PATCH /api/vendors/:id`, and `PATCH /api/orders/:id/status` are gated by `requireVendorOwner` / `requireOrderVendorOwner` (in `artifacts/api-server/src/lib/vendor-auth.ts`). Caller must be the signed-in Clerk user whose `users.id` matches the vendor's `userId`. Super-admin email + `x-admin-key` bypass. Same-origin fetches from the dashboard send the Clerk session cookie automatically.
- **Status transitions** are server-enforced (atomic conditional UPDATE): `pending→preparing|cancelled`, `preparing→ready|cancelled`, `ready→out_for_delivery`, `out_for_delivery→delivered`. Returns 409 on stale/invalid transitions so a late "accept" can't overwrite a "delivered" state.

## Zones (Healthy vs Regular)

- Products and categories carry a `food_type` column (`'healthy' | 'regular'`, default `'healthy'`) — `lib/db/src/schema/products.ts` (indexed via `products_food_type_idx`) and `lib/db/src/schema/categories.ts`.
- `food_type` is anchored on the **product** (a single vendor may sell both zones), and also on categories so the home categories rail can be filtered per zone.
- API filtering: `GET /api/products`, `/api/products/featured`, `/api/products/bestsellers`, and `/api/categories` all accept an optional `?foodType=healthy|regular` query param. Invalid/missing values return everything. Implemented via `foodTypeCondition()` in `products.ts` (drizzle `and()` ignores the `undefined` condition).
- Home (`pages/home.tsx`) has a sticky top toggle (الصحي / العادي) that passes `foodType` to all four hooks so the other zone is fully filtered out. Selection persists in `localStorage` key `al_tayebat_zone`; default is `healthy`. Shows an empty-state when the selected zone has no content.
- Admin product form (`pages/admin.tsx`) has a "المنطقة" selector; admin POST/PUT product routes accept `foodType`. There is no category-CRUD admin UI — category `food_type` is set via DB/seed.
- **Drift is allowed by design**: a product's `food_type` is independent of its category's `food_type` (a single vendor/category may legitimately span both zones), so there is intentionally no DB constraint forcing them to match. Product filtering always uses the product's own `food_type`. `/categories` `productCount` is NOT zone-aware (counts all products in the category).
- Always run codegen after spec changes here too: `pnpm --filter @workspace/api-spec run codegen`.

## Gotchas

- Always run codegen after spec changes: `pnpm --filter @workspace/api-spec run codegen`
- Products route must declare `/featured` and `/bestsellers` BEFORE `/:id` to avoid routing conflicts
- Cart uses sessionId from localStorage key `al_tayebat_session`
- **Admin password is the `ADMIN_PASSWORD` Replit Secret.** Backend falls back to legacy `tayebat2024` with a console warning if the secret is unset. Frontend never hardcodes it — the user types it on the `/admin` login page and it's cached in `sessionStorage` under `al_tayebat_admin_pw`. The super-admin email (`khaledaladamat24@gmail.com`) still bypasses the password.
- **Checkout payment info** (CliQ alias + wallet number) is fetched live from the vendor of the first product in the cart via `/api/products/:id` → `/api/vendors/:vendorId`. If the vendor hasn't set them, the corresponding payment options are shown as disabled and only "الدفع عند الاستلام" remains available. This assumes single-vendor carts.
- **Internal wallet** (`/wallet`): users top up via CliQ/e-wallet to platform numbers `PLATFORM_CLIQ_ALIAS` / `PLATFORM_WALLET_NUMBER` (env), upload a screenshot, admin approves in the "المحفظة" tab of `/admin`. Approved top-ups increase `wallets.balance`. Checkout adds a 4th payment method "الدفع من رصيد محفظتي" — disabled when balance < total. Balance deduction uses an atomic conditional UPDATE (`balance >= amount`) for race-safety, and is idempotent per `orderId` so a double-submit can't double-charge. `/api/wallet/:userId/*` endpoints are gated by Clerk session check that resolves the signed-in Clerk userId → `users.clerkId` → DB id and rejects mismatched access (admins bypass via `x-admin-email`).

## Android (Capacitor)

- Native shell config: `artifacts/al-tayebat/capacitor.config.ts` (appId `com.altayebat.app`, name "الطيبات")
- CI: `.github/workflows/android-build.yml` builds a debug APK on every push to `main` and is downloadable from the workflow run's Artifacts panel
- For native builds, `VITE_API_BASE_URL` must point to the deployed Replit API (e.g. `https://<your-app>.replit.app/api`) — relative `/api` URLs won't reach the backend from the device filesystem
- Required GitHub repo secrets: `VITE_API_BASE_URL`, `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_FIREBASE_*` (6 values)
- Local Android build (needs Android Studio + JDK 21): `pnpm --filter @workspace/al-tayebat cap:add:android` once, then `pnpm --filter @workspace/al-tayebat cap:sync` before each rebuild
- For Play Store release: generate a keystore, add 4 keystore secrets to the repo, then uncomment the "signed release build" block in the workflow

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
