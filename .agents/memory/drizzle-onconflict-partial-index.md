---
name: Drizzle onConflict partial-index predicate + idempotency races
description: How to make ON CONFLICT match a partial unique index in drizzle, and the pattern for race-safe per-key idempotency
---

# Drizzle `onConflictDoNothing` partial-index predicate

For a **partial** unique index (e.g. `UNIQUE (order_id) WHERE type='payment'`), the
`ON CONFLICT` arbiter only matches if you pass the index predicate. In drizzle the
key differs by method:

- `onConflictDoNothing({ target, where })` — predicate key is **`where`**.
- `onConflictDoUpdate({ target, targetWhere, setWhere, set })` — predicate key is **`targetWhere`**.

**Why:** Using `targetWhere` on `onConflictDoNothing` silently drops the predicate
(it's not a valid option there, but TS object-literal excess-property checks may not
fire if the config type is permissive / via esbuild without typecheck). Drizzle then
emits `ON CONFLICT (col) DO NOTHING` with no `WHERE`, which **cannot match a partial
index** → Postgres error 42P10 ("no unique or exclusion constraint matching the ON
CONFLICT specification") → 500 at runtime. Vitest runs via esbuild and does NOT
typecheck, so this surfaces only as a runtime 500, never a compile error — always run
`pnpm run typecheck` after touching onConflict configs.

**How to apply:** When inferring a partial index, the predicate must be logically
equivalent to the stored index predicate. Both qualified (`"tbl"."type" = 'payment'`)
and bare (`type = 'payment'`) forms work in Postgres; verify with
`SELECT indexdef FROM pg_indexes WHERE tablename='...'`.

# Race-safe per-key idempotency (wallet double-charge pattern)

A SELECT-exists-then-INSERT idempotency guard is a TOCTOU race: under true
concurrency both callers read "no existing row" and both proceed. For money
operations this double-charges. The fix has two parts that must ship together:

1. A DB partial unique index that makes the canonical row's INSERT the single
   serialization point.
2. Deduct-then-insert-with-conflict logic: do the conditional deduction, then
   `INSERT ... ON CONFLICT DO NOTHING`; if it returns **zero rows** you lost the
   race after deducting → **refund** your just-applied deduction and return the
   winning row as idempotent. Also re-check for a concurrent winner before
   returning "insufficient", to cover the row-lock-release ordering.

**Why:** `ON CONFLICT DO NOTHING` does not throw on a real conflict (returns 0 rows),
and catching a unique violation inside the same `db.transaction` is unusable because
Postgres aborts the whole transaction on the error — so prefer DO NOTHING + refund
over try/catch (or use a SAVEPOINT via a nested `tx.transaction`).
