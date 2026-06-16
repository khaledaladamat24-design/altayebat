---
name: Orval path+query param name clash
description: Why an OpenAPI op with BOTH a path and query param breaks the api-zod barrel, and the fix.
---

# Orval path+query param name clash

When an OpenAPI operation has **both** a path param and a query param, codegen
breaks `lib/api-zod`'s barrel with TS2308 ("already exported a member named
`<Op>Params`").

**Why:** the zod client names the path-param validator `<Op>Params`, while the
TypeScript schema types name the query-param type `<Op>Params` too. Both get
re-exported by `lib/api-zod/src/index.ts` (`export * from ./generated/api` +
`export * from ./generated/types`), so they collide. Query-only ops (e.g.
getCart) don't clash because zod emits only `<Op>QueryParams` for them.

**How to apply:** the server consumes no path-param zod schemas, so set
`override.zod.generate.param: false` in `lib/api-spec/orval.config.ts`. That
stops the path-param zod schema from being emitted and the clash disappears.
Watch for this whenever you add a query param to a path that already has an `id`
(or vice-versa).
