---
name: Dual category seed lists
description: Two separate category seed lists exist; the API startup one is the prod source of truth and must be edited for any category change to reach production.
---

# Two category seed lists must be kept in lockstep

There are TWO independent hardcoded category lists in the repo:

1. `scripts/src/seed-categories.ts` — the manual `seed:categories` script (run on demand).
2. `artifacts/api-server/src/lib/seed-categories.ts` — `ensureCategoriesSeeded()`, run at API startup after `app.listen`.

**The API startup list (#2) is the one that actually reaches production.** Replit publish copies schema but NOT rows, so prod relies on the startup seed to populate categories. Editing only the scripts list (#1) updates dev (when you run the script) but leaves production unchanged — the categories silently never appear in the published app.

**Why:** A grocery-category addition was made only to the scripts seed; dev showed the new categories but the published Android/web app kept showing just the old ones because prod startup seeds from the api-server list.

**How to apply:** Any add/rename/reorder of categories must be applied to BOTH files identically (same slug, nameAr, name, icon, foodType, sortOrder). Both use insert-if-missing keyed on `slug` (scripts uses `onConflictDoUpdate`, api-server uses `onConflictDoNothing` — so the startup seed will NOT overwrite renamed metadata; use the manual `seed:categories` script to force-correct drift). The grocery zone's "عروض" is the virtual Offers pill, never a DB category.
