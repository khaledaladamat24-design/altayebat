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

### Git hooks (auto-formatting)

- A husky `pre-commit` hook runs `lint-staged` (`prettier --write --ignore-unknown` on staged files only) so commits are auto-formatted and the CI `format:check` gate stays green. **Why**: CI fails a push if any file isn't Prettier-formatted; the hook fixes style locally instead of pushing the cleanup burden to CI.
- Setup activates automatically: the root `prepare` script runs `husky` after every `pnpm install`. No manual step needed.
- Hook lives at `.husky/pre-commit`; lint-staged config is the `lint-staged` block in root `package.json`.

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
- Online/Offline toggle in the dashboard header → `PATCH /api/vendors/:id {isOnline}`. When offline, the vendor's products are excluded from `/api/products`, `/api/products/featured`, and `/api/products/bestsellers` via `or(isNull(productsTable.vendorId), eq(vendorProfilesTable.isOnline, true))`. Single-product GET and category endpoints are _not_ filtered, so existing carts/checkouts keep working.
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

## Offers / Deals (العروضات)

- Products carry an `is_on_sale` boolean (default `false`, NOT NULL) — `lib/db/src/schema/products.ts` (indexed via `products_on_sale_idx`). The existing `original_price` column drives the strikethrough display (current `price` is the discounted price, `originalPrice` is the higher pre-discount price).
- `GET /api/products` accepts `?onSale=true` (combinable with `?foodType=`). Implemented in `products.ts` via `eq(productsTable.isOnSale, true)` pushed into the `conditions[]` array. `isOnSale` is included in every product row (`buildProductRow`) and in the OpenAPI `Product` schema.
- Home (`pages/home.tsx`) prepends a virtual **Offers** pill (BadgePercent icon, rose gradient) to the categories rail — it is NOT a DB category. Label is zone-aware: "عروض صحية" (healthy) / "عروض وتخفيضات" (regular). It links to `/offers/:zone`.
- `pages/offers.tsx` (route `/offers/:zone` in `App.tsx`, inside the `SplashGate`/`AppLayout` group) calls `useListProducts({ foodType: zone, onSale: true })` and renders a `ProductCard` grid with an empty-state when no offers exist.
- Product card (`components/product-card.tsx`) computes `hasDiscount = originalPrice != null && originalPrice > price`. The "عرض" badge shows when `isOnSale || hasDiscount`; the strike-through original price renders only when `hasDiscount` (never when `originalPrice <= price`, avoiding a misleading strike-through).
- Admin product form (`pages/admin.tsx`) has an "عرض / تخفيض" checkbox (`isOnSale`) alongside كيتو/عضوي/مميز/الأكثر مبيعاً; admin POST/PUT routes persist `isOnSale`. To show a strikethrough, set both `isOnSale` and a higher `original_price`.
- **Sale-integrity validation** (server-side, `admin.ts`): both POST and PUT reject (`400`, Arabic message) when `isOnSale` is true but there is no `original_price` strictly greater than `price`. PUT computes effective values from the existing row when fields are omitted from the partial payload.
- **Empty-state discoverability**: home's zone-empty state still links to `/offers/:zone` (BadgePercent), so offers stay reachable even when a zone has no categories/featured/bestsellers.

## Bilingual UI (AR/EN) + category seed

- Language is handled by `artifacts/al-tayebat/src/contexts/language.tsx` (`useLanguage()` → `{ lang, dir, setLang, toggle, tr(ar, en) }`), persisted to `localStorage` key `al_tayebat_lang` (default `ar`). `dir`/`lang` are applied to `<html>`.
- **Language Toggle button**: `artifacts/al-tayebat/src/components/language-toggle.tsx` — compact pill on the deep-green header (`primary-foreground/15` surface). Shows the language you can switch TO (`EN` when Arabic, `ع` when English). Placed in the Home header top row and the Categories page header.
- Categories carry both `name` (EN) and `nameAr` (AR). All UI renders `lang === "en" ? (cat.name || cat.nameAr) : cat.nameAr`.
- **Both zones' categories (canonical bilingual list)**: Healthy → keto, vegetables, pantry, drinks, dairy, nuts, sweets, meat. Regular → feasts (عزائم ووجبات), fastfood (وجبات سريعة), pastries (معجنات), sweets-cakes (حلويات وكيك), appetizers (مقبلات وتجهيز مسبق). The Home Regular Zone rail renders these 5 dynamically from `GET /api/categories?foodType=regular`.
- **Startup seed (production-safe)**: `artifacts/api-server/src/lib/seed-categories.ts` is invoked from `index.ts` after `app.listen`. It does an idempotent insert-if-missing (`onConflictDoNothing` keyed on `slug`) of the canonical category list. **Why**: Replit's publish copies schema but NOT row data, and production previously had only the 8 healthy categories — the 5 regular ones were missing, so the Regular Zone rail was empty in production. The startup seed guarantees both dev and prod have all categories without clobbering operator-customized rows. Seed failures are logged and never block startup.
- **Manual seed script**: `pnpm --filter @workspace/scripts run seed:categories` (`scripts/src/seed-categories.ts`) does an upsert (force-corrects names/icons/sort order) against whatever `DATABASE_URL` points to — use it to repair drifted category metadata.

## Gotchas

- Always run codegen after spec changes: `pnpm --filter @workspace/api-spec run codegen`
- Products route must declare `/featured` and `/bestsellers` BEFORE `/:id` to avoid routing conflicts
- Cart uses sessionId from localStorage key `al_tayebat_session`
- **Admin password is the `ADMIN_PASSWORD` Replit Secret.** Backend falls back to legacy `tayebat2024` with a console warning if the secret is unset. Frontend never hardcodes it — the user types it on the `/admin` login page and it's cached in `sessionStorage` under `al_tayebat_admin_pw`. The super-admin email (`khaledaladamat24@gmail.com`) still bypasses the password.
- **Checkout payment info** (CliQ alias + wallet number) is fetched live from the vendor of the first product in the cart via `/api/products/:id` → `/api/vendors/:vendorId`. If the vendor hasn't set them, the corresponding payment options are shown as disabled and only "الدفع عند الاستلام" remains available. This assumes single-vendor carts.
- **Internal wallet** (`/wallet`): users top up via CliQ/e-wallet to platform numbers `PLATFORM_CLIQ_ALIAS` / `PLATFORM_WALLET_NUMBER` (env), upload a screenshot, admin approves in the "المحفظة" tab of `/admin`. Approved top-ups increase `wallets.balance`. Checkout adds a 4th payment method "الدفع من رصيد محفظتي" — disabled when balance < total. Balance deduction uses an atomic conditional UPDATE (`balance >= amount`) for race-safety, and is idempotent per `orderId` so a double-submit can't double-charge. `/api/wallet/:userId/*` endpoints are gated by Clerk session check that resolves the signed-in Clerk userId → `users.clerkId` → DB id and rejects mismatched access (admins bypass via `x-admin-email`).

## Android (Capacitor)

- Native shell config: `artifacts/al-tayebat/capacitor.config.ts` (appId `com.altayebat.app`, name "الطيبات")
- CI: `.github/workflows/main.yml` ("Build Android App") runs on every push to `main` (paths-filtered) and on `workflow_dispatch`. It now builds a **signed release APK + AAB** (`al-tayebat-release-apk` / `al-tayebat-release-aab`) downloadable from the workflow run's Artifacts panel. It falls back to an unsigned debug APK only if `ANDROID_KEYSTORE_BASE64` is unset.
- For native builds, `VITE_API_BASE_URL` must point to the deployed Replit API — relative `/api` URLs won't reach the backend from the device filesystem. Production deploy is live at `https://al-tayebat-nour.replit.app`, so the `VITE_API_BASE_URL` GitHub secret is set to `https://al-tayebat-nour.replit.app/api`. The privacy-policy URL for the Play Console listing is `https://al-tayebat-nour.replit.app/privacy-policy`.
- Required GitHub repo secrets: `VITE_API_BASE_URL`, `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_FIREBASE_*` (6 values)
- Local Android build (needs Android Studio + JDK 21): `pnpm --filter @workspace/al-tayebat cap:add:android` once, then `pnpm --filter @workspace/al-tayebat cap:sync` before each rebuild

### Play Store signing (configured 2026-05)

- A release keystore (`PKCS12`, RSA 2048, alias `altayebat`, 10000-day validity, `CN=Al-Tayebat`) was generated and the 4 signing secrets are set on GitHub Actions: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. The workflow decodes the keystore, injects a `signingConfigs.release` block into `android/app/build.gradle`, and runs `assembleRelease` + `bundleRelease`.
- Verified: a `workflow_dispatch` run produced both signed artifacts (the debug-fallback steps were skipped).
- **Keystore backup**: the keystore + its passwords live (gitignored) at `.local/android-signing/release.keystore` and `.local/android-signing/CREDENTIALS.txt`. **Back these up offline** — Google Play requires the _same_ signing key for every future update; losing it blocks updates to the listing. (Alternatively enroll in Google Play App Signing and let Google manage the upload→app key.)

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
