---
name: Path-less router.use guard leaks across siblings
description: Why an admin/auth guard 403'd unrelated public routes, and the rule for scoping guards in this api-server
---

# Path-less `router.use(guard)` leaks onto sibling routers

In `artifacts/api-server/src/routes/index.ts` every sub-router is mounted
**path-less and in sequence**: `router.use(categoriesRouter); router.use(adminRouter);
router.use(authRouter); ...`. Each sub-router also declares its own _full_ paths
internally (e.g. `/admin/products`, `/auth/check`, `/users/profile`).

If any sub-router puts a **path-less** middleware at its top —
`router.use(requireAdmin)` — that middleware runs for **every request that reaches
that router's position in the chain**, not just that router's own routes. A request
to `/auth/check` falls through the earlier routers (no match → `next()`), hits the
admin router, and the path-less `requireAdmin` 403s it before the real public
handler downstream ever runs.

**Symptom seen in production:** `/api/auth/check`, `/api/users/profile`,
`/api/vendors/by-user`, `/api/wallet` all returned `403 {"error":"Forbidden"}`
(fast, pre-handler) and broke phone signup/login — while `/api/products`,
`/categories`, `/cart`, `/orders` worked because they are mounted _before_ the
admin router and matched first.

**Why this is easy to miss:** unit tests that mount a single router in isolation
(`app.use("/api", walletRouter)`) never exercise the cross-router ordering, so the
leak passes every per-router test. Only a composed-router test catches it — see
`__tests__/router-composition.test.ts`.

## Rule

- Never put a path-less `router.use(requireX)` at the top of a sub-router that is
  mounted path-less in `routes/index.ts`. Scope it to the shared prefix:
  `router.use("/admin", requireAdmin)` (all admin routes are `/admin/*`), or apply
  the guard per-route (`router.get("/admin/x", requireAdmin, handler)` — the
  pattern wallet.ts and vendors.ts already use).
- When adding any broad middleware to a route module, assume it will see sibling
  traffic unless it is path-scoped.
