# 15 — Final Hardening Iteration Before PR

Follow-up to `14-independent-review.md`'s "READY WITH CONDITIONS" verdict. Scope: determine
whether the two remaining conditions could be resolved without expanding the sprint, and act only
on what the evidence actually supported. No new branch, no PR, no `AOC-REVOCATION-01` work.

## Part 1 — What is `protocol/consent/capability-authorize.ts`, exactly?

Exhaustively inspected `protocol/consent/capability-authorize.ts`, `runtime/api/server.ts`,
`runtime/index.ts`, every caller, every export, `package.json`'s `exports` map, and referenced
documentation. Evidence gathered before concluding:

- **Compile status**: isolated `tsc` compilation of `runtime/index.ts` (extending
  `tsconfig.test.json`, the only config that ever actually type-checks this tree) failed with 11
  real errors across `protocol/audit/builders.ts` (5), `runtime/api/server.ts` (2),
  `runtime/enforcement/enforceCapability.ts` (2), and `runtime/index.ts` itself (1 — a genuinely
  broken re-export of `RUNTIME_TRANSPORT_VERSION`). None of the 11 involve
  `capability-authorize.ts`'s revocation logic itself — they're all unrelated shape/naming drift.
- **Build coverage**: `npm run build` (`tsc -b`) does not include `runtime/` in its project
  references at all (only `packages/*`, `enterprise`, `crypto`, `examples/pmfreak-adapter`).
  `.gitignore` expects `/runtime/**/*.js` and `/runtime/**/*.d.ts` as build output, but nothing in
  this repository's `build` script ever produces them. The `package.json` `exports["./runtime"]`
  entry (`./runtime/index.js`) points at files that no script here generates.
- **Consumers**: grepped every `package.json` in the repo for a dependency on `aoc-runtime` (the
  root package name) — none exists outside the root's own self-reference. Grepped every `.ts` file
  for `from 'aoc-runtime'` / `from 'aoc-runtime/runtime'` (package-style import) — zero matches.
  `createRuntimeServer`'s only callers anywhere in the repository are its own (currently
  non-compiling, CI-excluded) `runtime/__tests__/*Hosted.test.ts` / `enforcement.test.ts` suite.
- **Deployability**: no `start`/`serve`/`dev` npm script, no `bin` field, no Dockerfile, no
  Procfile anywhere in the repository that would invoke `createRuntimeServer()` as a real process.
- **Package publishability**: root `package.json` has `"private": true` — this package can never
  be `npm install`'d externally regardless of its `exports` map.

**Classification: (C) Código exportado pero imposible de ejecutar**, with the caveat that this is
not permanent — the 11 blocking errors are individually shallow (type mismatches, a missing
re-export), so a well-intentioned but security-unaware PR fixing them (plausible: they look like
routine drift-cleanup) would make this surface newly compilable without making it newly safe. That
is precisely why `14-independent-review.md` treated it as a P1 finding rather than dismissing it.
(A) dead code and (B) unused legacy don't fit — the module actively declares itself "stable" and
is wired into a real (if currently broken) HTTP dispatch path. (D) productive and (E) "minor change
away from productive" don't fit either — no build path currently produces a runnable artifact from
it, and "minor" undersells what would be required to make it *safe* (adding revocation checking),
as opposed to merely *compilable*.

## Part 2 — Decision: contain, don't implement

Given (C), implementing a `RevocationCheckPort` inside `authorizeWithCapability` would mean
designing revocation for a `capability_id` key space that has no registry, no issuance route in
this codebase, and no clear semantics yet — exactly the "authority model completo" /
"persistent revocation" scope this iteration was explicitly told not to build. Instead:

1. **Marked as internal, not deleted.** `runtime/index.ts` ("Public Runtime Surface (stable)")
   no longer exports `createRuntimeServer` or `export * from './enforcement'`. Both moved to
   `runtime/internal.ts` — a surface that already existed in this repo for exactly this purpose
   ("Internal Runtime Surface ... not part of the semver-stable SDK contract"), alongside
   `governance`, `distributed`, `capabilities`, etc. Nothing was removed; the public API surface
   shrank to match what is actually safe to call stable.
2. **Documented as legacy/unsafe at the point of use.** Added explicit `SECURITY WARNING`
   docblocks directly on `authorizeWithCapability` (`protocol/consent/capability-authorize.ts`)
   and `enforceCapabilityAccess` (`runtime/enforcement/enforceCapability.ts`), and an explanatory
   comment in both `runtime/index.ts` (why it's absent) and `runtime/internal.ts` (why it's there
   and what's missing).
3. **Protected by an architecture gate.** `scripts/check-runtime-export-governance.mjs`'s
   `disallowedPublicExports` list now includes `"export * from './enforcement'"` and
   `"export { createRuntimeServer }"`. Verified this actually fails CI: temporarily re-added
   `export { createRuntimeServer } from './api/server';` to `runtime/index.ts` and reran
   `npm run check:runtime-exports` — it failed with `Disallowed exports present in
   runtime/index.ts: - export { createRuntimeServer }`. Reverted before proceeding.
4. **Not eliminated.** `authorizeWithCapability`, `enforceCapabilityAccess`, and
   `createRuntimeServer` all still exist, still work as before (signature/hash/expiry validation
   only), and remain reachable via `runtime/internal.ts` for whatever internal composition purpose
   they were built for. No public API was deleted without analysis — the analysis is this
   document.

**Side effect, verified**: fixing the one-line `RUNTIME_TRANSPORT_VERSION` re-export bug in
`runtime/index.ts` (it tried to re-export a constant that `runtime/types/transport.ts` only
imports, not re-exports — trivial, unambiguous, in the exact file this change was already
touching) means **`runtime/index.ts` — the package's actual stable surface — now compiles cleanly
for the first time** (`npx tsc` against it in isolation: 0 errors, confirmed twice). This was not
attempted as a general "fix unrelated bugs" exercise; it was a one-line fix in a file this change
was already editing, needed to make the containment verifiable rather than cosmetic.

`runtime/internal.ts` (where the risky exports now live) still carries 12 pre-existing, unrelated
compile errors (the original 11 plus 2 more surfaced by its own pre-existing `distributed`/
`execution-fabric` re-exports that weren't reachable through `runtime/index.ts` before) —
confirmed unchanged in kind and count before/after this session's edits. This is expected and
consistent with `internal.ts`'s own docstring: it was never claimed to be a working, semver-stable
build target.

## Part 3 — Typecheck coverage

**Root cause**: root-level `runtime/`, `protocol/`, `capability/`, `aoc/`, `consent/`, `vault/`,
`interpreter/`, `enforcement/` have **no `tsconfig.json` of their own** — `find . -maxdepth 2
-iname "tsconfig*.json"` returns only `crypto/`, `enterprise/`, and the three root configs. They
were never set up as composite projects, so `tsc -b`'s project-reference graph
(`tsconfig.json` → `packages/*`, `enterprise`, `crypto`, `examples/pmfreak-adapter`) structurally
cannot reach them — there's nothing to reference. Separately, large parts of that tree fail to
type-check today for reasons unrelated to revocation (11+ errors, catalogued in Part 1 and in
`14-independent-review.md`).

**Can this be resolved without expanding the sprint? No — not fully, with evidence:**
Wiring `runtime/` into `tsc -b` would require (a) adding `composite: true` tsconfig.json files for
every root-level source directory it transitively imports, correctly cross-referencing each other,
and (b) fixing every pre-existing compile error in that entire transitive closure first, or the
official `npm run typecheck`/`npm run build` gates would immediately start failing — which this
task explicitly forbids ("No rompas CI"). That is exactly the "amplíes significativamente el
alcance" this iteration was told to avoid, and was independently confirmed as infeasible within a
strictly limited diff.

**What was done instead, and does resolve real risk**: a new standalone, additive
`tsconfig.revocation.json` (`extends tsconfig.test.json`, `noEmit`, explicit `files` list) covering
exactly the files this sprint's safety guarantees depend on — the `protocol/revocation/` module,
the capability/consent/enforcement/execution engine files, `runtime/api/routes.ts`,
`runtime/controlPlane.ts`, `runtime/sdk/client.ts`, and the `aoc/capabilities` market-maker fix —
wired as a new npm script `check:revocation-typecheck`, appended to `check:aoc-boundaries` (the
literal command `.github/workflows/ci.yml` runs). This directly closes the exact gap
`14-independent-review.md`'s mutation testing found: a regression in `runtime/sdk/client.ts`
(dropping the mandatory `checkRevocation` argument) that neither `npm run typecheck` nor `npm test`
caught before. Verified: reintroducing that exact mutation now makes `check:revocation-typecheck`
fail with `TS2554: Expected 2 arguments, but got 1`; reverted afterward.

This does not claim full `tsc -b` coverage of the runtime tree — it claims, and demonstrates,
coverage of the specific surface this sprint's fail-closed guarantee depends on. The gap for
everything else in `runtime/`/`protocol/` (unrelated to revocation) remains open and undocumented
scope for a future, dedicated cleanup — not attempted here.

## Part 4 — Full re-verification

All commands below were run after every edit in this session, from a clean working tree, with
`npx jest --clearCache` before each `npm test` run.

```
$ npm run build            # tsc -b                                    → 0 errors
$ npm run typecheck        # tsc -b --pretty false                     → 0 errors
$ npm run check:revocation-typecheck  # new, scoped                    → 0 errors
$ npm run lint:semantic-ownership                                      → passed
$ npm run check:runtime-boundaries                                     → passed
$ npm run check:runtime-exports       # export governance, now gated   → passed
$ npm run check:aoc-boundaries        # full CI gate chain             → passed (incl. both new checks)
$ npm test                                                             → 181 suites / 813 tests passed
```

Fail-open/fail-closed/unknown/idempotency/caller-inventory/routes/write-paths re-verified by
re-running the exact regression suites that prove them, unchanged by this session's edits:
`protocol/revocation/__tests__/*`, `runtime/__tests__/controlPlaneRevocation.test.ts`,
`runtime/api/__tests__/routesRevocation.test.ts`, `protocol/{consent,enforcement,execution}/
__tests__/*` — **83/83 passing**. Caller inventory re-confirmed unchanged: `capabilityRevocationCheck`
and `consentRevocationCheck` still wired at the same call sites in `runtime/api/routes.ts` as
`14-independent-review.md` documented; `createRuntimeServer`/`enforceCapabilityAccess` confirmed
absent from `runtime/index.ts` and present in `runtime/internal.ts`.

**Process note, disclosed**: mid-session, a `git checkout -- runtime/index.ts` intended to revert a
temporary regression-test mutation instead reverted the file all the way back to its last commit
(the edit had not yet been committed), silently discarding this session's containment fix. Caught
immediately via `head -15 runtime/index.ts`, and the edit was redone and re-verified before
continuing. Disclosed here rather than omitted, consistent with this review's practice of
surfacing its own process mistakes rather than only the target code's.

## Part 5 — Verdict

**READY WITH CONDITIONS** (unchanged from `14-independent-review.md` — not upgraded, and here is
why it doesn't automatically become upgradeable):

- Both conditions from the prior verdict were investigated with evidence, not assumed resolvable.
- Condition 1 (the unrevoked HMAC surface) is **contained, not eliminated**: it is no longer
  presented as stable, is architecturally gated against silent return to the stable surface, and
  is documented at the point of use — but `authorizeWithCapability` still has zero revocation
  checking, and building that is out of scope by explicit instruction. A reviewer who reads
  `runtime/internal.ts`'s docstring or `protocol/consent/capability-authorize.ts`'s new warning
  will not be surprised by this; a reviewer who doesn't read either still won't accidentally ship
  it as part of the "stable" surface, because `runtime/index.ts` no longer offers it and CI now
  blocks it from coming back silently. That is a genuine improvement in blast radius and
  discoverability, not a fix of the underlying gap — hence the verdict does not change.
- Condition 2 (typecheck coverage) is **partially closed**: the specific gap mutation testing
  found (`runtime/sdk/client.ts`) now has real compile-time coverage. The broader claim — that
  `tsc -b` covers this sprint's surface — remains false and is now precisely documented as to why,
  rather than left as an open question.
- No new defect was found in this session that would justify NOT READY. No condition was fully
  eliminated in a way that would justify READY FOR REVIEW or READY TO MERGE without a human
  explicitly accepting the two conditions above — they are narrower and better-evidenced than in
  `14-independent-review.md`, but they still exist.

The PR should be opened when a human is ready to review it with these two conditions in hand; this
iteration does not, on its own, clear them.

## Addendum (2026-10-24): the HMAC token-use path is disabled, not just fenced

A caller that fails type checking is not a safeguard: TypeScript toolchains that skip type
checking still execute it. Item 4 above ("Not eliminated ... still work as before") therefore no
longer holds:

1. `authorizeWithCapability` never allows. It still reports shape/hash/signature/expiry failures and
   request mismatches, but a token that passes every check is denied with
   `CAPABILITY_PATH_DISABLED`. It is removed from the `protocol/consent` barrel (and so from the
   root index); only `runtime/enforcement/enforceCapability.ts` imports it, by file path.
2. `enforceCapabilityAccess` has no `soft` mode (`EnforcementMode` is `'strict'` only): no token
   → `CAPABILITY_MISSING`, any token → `CAPABILITY_DENIED`, both 403. `runtime/enforcement/index.ts`
   exports types only, so the function is on no surface; `createRuntimeServer` throws if a soft
   mode is configured by dependency or `ENFORCEMENT_MODE`. Hosted `/data/access` and
   `/payout/execute` requests that name both principals are denied.
3. `scripts/check-runtime-export-governance.mjs` checks the barrels, the enforcement index, the
   two implementation files and the root index for the names, the soft mode and any `allowed: true`
   literal, and now runs inside `check:aoc-boundaries` (CI `ci.yml` and `validate:release`).
4. `tests/contracts/hmac-capability-path-disabled.test.ts` asserts all of the above under Jest and
   again through a transpile-only loader in a child Node process (no type checking at all).

Re-enabling the path requires an authoritative `RevocationCheckPort` that denies on anything but
`verified_not_revoked`, single-use enforcement and a constant-time signature compare, and a review.
