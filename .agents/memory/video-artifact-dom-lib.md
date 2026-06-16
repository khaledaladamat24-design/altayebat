---
name: Video artifact needs DOM lib in tsconfig
description: video-js scaffold tsconfig omits the DOM lib, which fails root typecheck for the whole artifact in a misleading way
---

The repo's `tsconfig.base.json` sets `lib: ["es2022"]` only (no DOM) and `types: []`. The video-js scaffold's `artifacts/<name>/tsconfig.json` does NOT add DOM, so out of the box the video artifact fails `tsc` on `window`, `document`, `HTMLAudioElement`, `Node`, `pointerType`, etc.

The misleading part: the **framer-motion** `motion.*` components also throw `TS2322 ... not assignable to type 'undefined'` on `exit`/`animate`/`variants` props. These are NOT framer-motion version problems — they collapse purely because JSX/DOM element types are unavailable without the DOM lib. Adding the DOM lib fixes the framer-motion errors too.

**Fix:** add `"lib": ["ES2022", "DOM", "DOM.Iterable"]` to the video artifact's `tsconfig.json` `compilerOptions`.

**Why it matters:** vite/esbuild ignore types, so the dev server/preview run fine even while typecheck is broken. But the root `pnpm run typecheck` validation gate includes every artifact with a `typecheck` script, so a freshly scaffolded video artifact silently breaks the whole repo's typecheck until DOM lib is added.

**How to apply:** after scaffolding a video-js (or any browser) artifact, if root typecheck reports `Cannot find name 'window'`/`'document'` plus framer-motion `not assignable to 'undefined'` errors clustered in one artifact, add the DOM lib to that artifact's tsconfig rather than touching the scenes or chasing framer-motion types.
