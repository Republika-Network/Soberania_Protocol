# @aoc/protocol Consumer Guide

The complete guide for teams consuming `@aoc/protocol` as an external dependency. For a shorter
first-run walkthrough see [`docs/getting-started/QUICK_START.md`](../getting-started/QUICK_START.md);
this guide is the reference for everything a consumer needs to operate the dependency over time,
including pinning, upgrades, and rollback. Every symbol shown here is part of the governed public
surface (`docs/protocol/PUBLIC_API.md`) and is exercised by CI consumer fixtures — none are
invented.

## Package identity

| Field | Value |
| --- | --- |
| Name | `@aoc/protocol` |
| Current version | `0.2.0-rc.0` (release candidate; cut by Changesets pre mode, tag `rc`. Not published to any registry) |
| License | Apache-2.0 (relicensed from MIT by PR #319; the tarball ships the official Apache-2.0 `LICENSE` and the `NOTICE` attribution) |
| Repository | `Architects-of-Change-Protocol/Architects_of_Change_Protocol`, directory `packages/protocol` |
| Module system | CommonJS (`"type": "commonjs"`), single build |
| Runtime dependencies | None |
| Registry status | **Not published to any registry.** `"private": true` until a founder-approved publish decision |

> **Binding terms.** What may be depended on, in which install forms, and what a consuming
> repository owes in return, is frozen in
> [`docs/integration/CROSS_REPO_INTEGRATION_CONTRACT.md`](../integration/CROSS_REPO_INTEGRATION_CONTRACT.md)
> and shipped inside the package as the unexported metadata file `integration-contract.json` (read it
> by path, not by import). This guide explains how to operate the dependency; the contract governs
> what the dependency is.

## Installation today: internal tarball

The only supported distribution mechanism today is a checksummed tarball built by the Protocol
repository. `npm run protocol:rc:artifact` is the recommended entry point — it emits the tarball
together with a ready-to-vendor `protocol-consumer.lock.json` and `SHA256SUMS` into `dist-rc/`:

```bash
# In the Protocol repository:
npm run protocol:rc:artifact    # → dist-rc/aoc-protocol-<version>.tgz + lock + checksums
npm run protocol:pack           # → aoc-protocol-<version>.tgz

# In your project:
npm install ./aoc-protocol-<version>.tgz
```

**Always verify the checksum before installing.** Every candidate's SHA-256/SHA-512 is recorded in
[`docs/release/evidence/`](../release/evidence/):

```bash
sha256sum aoc-protocol-<version>.tgz
# must equal the value recorded in the release manifest for that build, e.g.
# docs/release/evidence/aoc-protocol-0.1.0-release-manifest.json
```

Note that the checksum is per-build: the artifact Soberanía Enterprise pinned hashes
`4e5289b7…96b27` (pre-relicense), while the current Apache-2.0 RC build hashes
`7d0d42a5…d9841` — always compare against the manifest entry for the build you were handed
(full history in [`docs/release/RELEASE_CANDIDATE_READINESS.md`](../release/RELEASE_CANDIDATE_READINESS.md)).

Vendor the tarball in your repository (as Frontera does under `vendor/`) so installs are
reproducible and auditable.

## Installation in the future: registry

**Unavailable today.** If a founder-approved decision publishes the package (see
[`docs/release/REGISTRY_READINESS.md`](../release/REGISTRY_READINESS.md)), installation would become
`npm install @soberania-protocol/protocol` under the approved public name; see
[`docs/getting-started/PACKAGE_IDENTITY.md`](../getting-started/PACKAGE_IDENTITY.md). That package does
not exist on npm yet. Do not write tooling that assumes it exists, and never resolve `@aoc/*` from the
public registry: this project does not control the `@aoc` scope there.

## The root export

The root import is an alias of `./contracts` — stable, type-only contract shapes:

```ts
import type {
  CapabilityToken,
  ConsentGrant,
  PolicyDecision,
  ScopedAccessRequest,
  AuditEventEnvelope,
  ResourceRef,
} from '@aoc/protocol';
```

## Supported subpaths — the entire import surface

| Import path | Stability | Runtime/type | Representative symbols |
| --- | --- | --- | --- |
| `@aoc/protocol` | Stable | Type-only | alias of `./contracts` |
| `@aoc/protocol/contracts` | Stable | Type-only | `CapabilityToken`, `ConsentGrant`, `PolicyDecision`, `ScopedAccessRequest`, `AuditEventEnvelope`, `ResourceRef`, `CanonicalId`, `UtcDateTime`, `TrustDomainIdentifier` |
| `@aoc/protocol/errors` | Stable | Type-only | `ProtocolError` and related error types |
| `@aoc/protocol/claims` | Stable | Mixed | `CanonicalClaim`, `CanonicalAttestation`, `CanonicalVerification`; runtime enums `ClaimType`, `EvidenceType`, `AttestationType`, `VerificationStatus` |
| `@aoc/protocol/adapters` | Experimental | Type-only | `RevocationLookup`, `AuditEventSink`, `PolicyDecisionProvider`, `VerificationKeyResolver`, `TrustRegistryProvider` |
| `@aoc/protocol/runtime-registry` | Experimental | Runtime | `AdapterRegistry`, `AdapterTokens`, `RuntimeAdapterBootstrap`, `createAdapterToken`, `AdapterNotRegisteredError` |

(`@aoc/protocol/package.json` also resolves, for tooling.)

## TypeScript

Fixtures compile under `strict` with TypeScript 6.x. Use `"moduleResolution": "nodenext"` (or
`"bundler"`) — classic `"node"` resolution predates `exports` maps and will not resolve the
subpaths. Declarations (`.d.ts`) ship in the package and resolve without any `paths` aliases,
ambient shims, or `declare module` blocks. If you find yourself writing
`declare module '@aoc/protocol'`, stop: that is how contract drift starts (see the migration
guide).

```ts
import { ClaimType } from '@aoc/protocol/claims';
import type { CanonicalClaim } from '@aoc/protocol/claims';
```

## JavaScript

Plain JavaScript consumers work without a build step:

```js
'use strict';
const { ClaimType } = require('@aoc/protocol/claims');
const { AdapterRegistry, AdapterTokens } = require('@aoc/protocol/runtime-registry');
```

## CommonJS and ESM interoperability

The package ships CommonJS-only output; it is **not** a declared dual package (no
`import`/`require` export conditions).

- **CommonJS**: `require('@aoc/protocol/...')` — native.
- **ESM**: `import { ClaimType } from '@aoc/protocol/claims'` — works because Node's ESM loader
  statically detects the emitted CommonJS named exports (`cjs-module-lexer`).

Both paths are validated end-to-end against a real `npm pack` tarball by
`npm run protocol:consumer:check` (fixtures: `test-consumers/typescript-cjs`,
`test-consumers/javascript-cjs`, `test-consumers/typescript-esm`).

## Deep imports are prohibited

Only the subpaths in the table above are public. Deep imports —
`@aoc/protocol/dist/...`, `@aoc/protocol/src/...`, `@aoc/protocol/internal/...` — are unsupported
**even if they happen to resolve in a given bundler**, are actively blocked by
`scripts/assert-invalid-imports.mjs`, and may break in any release without a semver signal. If a
symbol you need is not reachable from a public subpath, it is internal; request its promotion
through the governance process in `docs/protocol/PUBLIC_API.md` instead of reaching around the
boundary.

## Version pinning

- **Tarball consumers (today):** pin by vendored file **and checksum**, and record the Protocol
  source commit you built from. Soberanía Enterprise's `protocol-consumer.lock.json` (commit, expected
  version, tarball SHA-256, verified export list) is the reference pattern.
- **Registry consumers (future):** pin **exact** versions of prereleases (`0.2.0-rc.0`, never
  `^0.2.0-rc.0`). For stable 0.x versions, remember that pre-1.0 minors may add surface: prefer
  tilde (`~0.2.0`) or exact pins over caret ranges if you need maximal predictability.

## Upgrade procedure

1. Read the release notes and migration guide for the target version
   (`docs/release/RELEASE_NOTES_<version>.md`, `docs/release/MIGRATION_GUIDE_<minor>.md`).
2. Obtain the new tarball and verify its SHA-256 against the recorded evidence
   (`docs/release/evidence/aoc-protocol-<version>-release-manifest.json`).
3. Install into an isolated copy of your project first; run your full typecheck/build/test battery
   there (Enterprise automates exactly this in its `protocol-tarball-consumption` CI job).
4. Update your pin (vendored tarball + lock record, or exact registry version) in one reviewed
   commit, together with any migration changes.
5. Re-run your validation battery on the tracked tree before merging.

## Rollback procedure

Rollback is **pin-based** — published or distributed artifacts are never mutated (see
[`docs/release/ROLLBACK_PLAN.md`](../release/ROLLBACK_PLAN.md)):

1. Reinstall the previous known-good tarball (you vendored it) or previous exact version.
2. Verify its checksum against the recorded evidence for that version.
3. Revert the pin/lock record in one commit; revert migration changes if they depended on the new
   surface.
4. Report the defect upstream; the fix will arrive as a **new** version — never as a mutated
   re-release of the version you rolled back from.

## Stability classifications

Per [`docs/versioning-and-stability.md`](../versioning-and-stability.md):

- **Stable** (root, `./contracts`, `./errors`, `./claims`): changes follow semver intent — additive
  in minors, breaking only in majors. Deprecated symbols are retained at least one minor cycle.
- **Experimental** (`./adapters`, `./runtime-registry`): public, but may change shape without a
  major bump while so marked. Every change still requires a Changeset. Pin exactly and re-validate
  on every upgrade if you depend on these.
- **Pre-1.0 caveat:** no 1.0 compatibility guarantee exists anywhere yet — see
  [`docs/release/KNOWN_LIMITATIONS.md`](../release/KNOWN_LIMITATIONS.md).

## Supported Node.js versions

| Environment | Node version | Evidence |
| --- | --- | --- |
| Declared minimum (`engines`) | `>=20` | `packages/protocol/package.json` |
| Protocol CI | 20 | every workflow (`ci.yml`, `publishability.yml`, `changeset-validation.yml`, `release-validation.yml`, `rc-validation.yml`) pins `node-version: 20` |
| Additional validation | 22 (v22.22.2) | this sprint's local validation battery, and Soberanía Enterprise's CI (`node-version: '22'`) and adoption-sprint evidence |

Versions other than 20 and 22 have not been tested and are not claimed.
