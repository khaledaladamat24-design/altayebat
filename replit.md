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

## Gotchas

- Always run codegen after spec changes: `pnpm --filter @workspace/api-spec run codegen`
- Products route must declare `/featured` and `/bestsellers` BEFORE `/:id` to avoid routing conflicts
- Cart uses sessionId from localStorage key `al_tayebat_session`

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
