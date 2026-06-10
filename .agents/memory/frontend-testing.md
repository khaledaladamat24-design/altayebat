---
name: Frontend component testing
description: How the al-tayebat web app runs Vitest + Testing Library component/page tests.
---

# al-tayebat frontend component tests

The web app's `vitest.config.ts` uses `environment: "jsdom"`, the `@vitejs/plugin-react`
plugin (so `.tsx`/JSX transforms work), the `@` → `src` resolve alias, and a global setup
file (`src/test/setup.ts`) that wires `@testing-library/jest-dom` matchers and runs
`cleanup()` + `localStorage.clear()` after each test.

**How to test a page/component here:**

- Mock the Orval data hooks from `@workspace/api-client-react` with `vi.mock(...)` and return
  `{ data, isLoading }` shapes. This is the cleanest seam — no network/QueryClient needed for
  pages whose only API access is via those hooks (e.g. Home, Offers).
- A page that calls `useQueryClient()` directly (e.g. Checkout) still needs a real
  `QueryClientProvider` wrapper even when its data hooks are mocked.
- Mock heavy/native-ish components (e.g. `@/components/map-picker`, which imports Leaflet/CSS)
  to a stub via `vi.mock`.
- Mock `@/hooks/use-session` to a fixed session id; stub `global.fetch` with `vi.stubGlobal`
  for pages that fetch directly (Checkout looks up the cart vendor's payment info — CliQ
  alias / IBAN bankAccount / wallet number).
- Cart mock fields must be numbers (`subtotal`, `deliveryFee`, `total`, item `totalPrice`) —
  `formatPrice` calls `.toFixed(3)` and throws on strings.
- Always wrap rendered UI in `LanguageProvider` (`useLanguage` throws otherwise); query Arabic
  copy since `ar` is the default language.

**Why:** these tests run in CI via `pnpm -r --if-present run test`, so a broken UI test blocks
the Checks workflow.
