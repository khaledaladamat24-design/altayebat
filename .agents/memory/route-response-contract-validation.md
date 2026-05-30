---
name: Route response contract validation
description: Convention for validating/serializing API route success responses against the generated Zod response schema before sending.
---

# Validate route success responses against the generated Zod schema

When an Express route's success payload is assembled from values that can drift
from the OpenAPI contract (e.g. spreading raw third-party/adapter output into the
response), run it through the matching generated Zod response schema from
`@workspace/api-zod` via `safeParse` before `res.json`:

- On success, send `parsed.data` — a default Zod object **strips unknown keys**,
  so off-contract fields (internal/raw/debug data) never leak to the client.
- On failure, log via `req.log.error(...)` and return a controlled `500`
  (`{ error: "Internal server error" }`) instead of an off-contract payload.

Reference implementation: `sendTracking()` in
`artifacts/api-server/src/routes/delivery.ts` (GET `/delivery/orders/:orderId/track`).

**Why:** Adapters/integrations can return missing, extra, or wrong-typed fields.
Spreading them straight into the response silently breaks the typed frontend that
trusts the OpenAPI contract. Zod validation turns a silent drift into either a
clean (stripped) payload or a loud, logged failure.

**How to apply:** Use for any route whose success body includes data from a
source outside your direct control (external APIs, pluggable adapters, loosely
typed DB JSON). Error responses (400/404) intentionally stay outside this helper.
Always keep the OpenAPI schema in sync with intended fields — a field missing
from the schema will be stripped even if it's legitimately new (run codegen:
`pnpm --filter @workspace/api-spec run codegen`).

**Gotcha — orval only emits a response Zod schema for the `200` response.** A
`201`-only operation (e.g. a create endpoint) generates `...Body`/`...Params`
but NO `Create...Response`. For a `201` whose body equals a `200`/array-item
shape elsewhere, reuse that shared schema (e.g. validate a created provider with
`ListDeliveryProvidersResponseItem`) rather than expecting a per-operation
constant.

**Gotcha — DB `Date` columns vs `zod.string()`.** Drizzle returns timestamp
columns as JS `Date`. The contract types them as `string` (ISO), and `res.json`
would coerce a `Date` to ISO — but if you `safeParse` _before_ sending, a raw
`Date` fails `zod.string()`. Convert dates to `.toISOString()` inside the
sanitize/builder step so the candidate already matches the contract.
