---
"@aoc-runtime/consent-runtime": patch
"@aoc-runtime/capability-runtime": patch
"@aoc-runtime/authorization-runtime": patch
"@aoc-runtime/portable-cognition": patch
"@aoc-runtime/provider-interfaces": patch
"@aoc-runtime/vault-runtime": patch
"@aoc-runtime/pmfreak-adapter": patch
---

Package entry points now load the current build. These packages compiled to `dist/src/` while `main`, `types` and `exports` pointed at `dist/index.*`, which were bootstrap artifacts from May. Importing them by package name (outside the Jest and TypeScript path mappings) loaded stale code that did not match the reviewed sources. Each package now sets `rootDir: "src"`, emits `dist/index.*`, and the stale artifacts (including compiled copies beside the sources) are removed. `scripts/check-package-entrypoints.mjs` (`validate:release`) rebuilds, checks that the committed `dist` matches, loads every workspace by name in plain Node and runs security smoke tests through the real entry points.

Release blocker, unchanged by this change: the root `aoc-runtime` package declares `exports` (`./index.js`, `./runtime/*.js`) that are never built. It is not distribution-ready, and the packaging gate reports it as such rather than certifying it.
