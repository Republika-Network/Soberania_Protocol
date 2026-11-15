# @aoc/protocol Quick Start

This guide takes a new consumer from zero to a compiled, running program against the real
`@aoc/protocol` package. (For the full operating reference — version pinning, upgrade and rollback
procedures, stability tiers — see [`docs/guides/CONSUMER_GUIDE.md`](../guides/CONSUMER_GUIDE.md).) Every import and symbol below is taken from the governed public surface
(`docs/protocol/PUBLIC_API.md`) and is exercised verbatim by the consumer fixtures under
`test-consumers/` on every CI run — nothing here is aspirational.

## 1. What Soberanía Protocol is

`@aoc/protocol` is the versioned, implementation-neutral contract layer of the Soberanía
architecture: capability, consent, policy-decision and audit-envelope contracts, the RFC-005
claims/evidence/attestation family, the public protocol error surface, adapter interfaces, and an
in-process adapter registry/bootstrap toolkit.

```text
Soberanía Protocol    (this package — versioned public contracts)
    ↓
Soberanía Enterprise  (proprietary implementation and runtime)
    ↓
PMFreak               (commercial vertical product)
```

## 2. What it is not

It is **not** a runtime, a hosted service, a network client, a persistence layer, or the Soberanía
Enterprise product. It ships shapes, references, adapter interfaces, and a small in-process
registry — implementations live downstream.

## 3. Install today: from a tarball

`@aoc/protocol` is **not yet published to any registry**. Today it is distributed as a checksummed
tarball built by this repository:

```bash
# In this repository — build and pack:
npm run protocol:pack
# → produces aoc-protocol-<version>.tgz (e.g. aoc-protocol-0.1.0.tgz)

# In your project — install the tarball:
npm install ./aoc-protocol-<version>.tgz
```

Verify what you received before trusting it: each candidate tarball's SHA-256/SHA-512 checksums are
recorded in `docs/release/evidence/` (see `npm run protocol:release:manifest`). Compare with:

```bash
sha256sum aoc-protocol-<version>.tgz
```

## 4. Install in the future: from a registry

If and when a founder-approved publish decision is made (see
`docs/release/PACKAGE_DISTRIBUTION_STRATEGY.md` and `docs/release/PRERELEASE_POLICY.md`),
installation will become:

the package will be published under its approved public name, **not** as `@aoc/protocol`:

```bash
# NOT AVAILABLE YET: these packages do not exist on npm today.
npm install --save-exact @soberania-protocol/protocol@<version>
```

That has **not** happened yet. Today the command returns 404. Never install `@aoc/protocol` from the
public registry: this project does not control the `@aoc` scope there. For the name mapping and the
migration steps, see [PACKAGE_IDENTITY.md](PACKAGE_IDENTITY.md).

## 5. Import from the root

The root export is an alias of `./contracts` — type-only contract shapes:

```ts
import type {
  CapabilityToken,
  ConsentGrant,
  ScopedAccessRequest,
  AuditEventEnvelope,
} from '@aoc/protocol';
```

## 6. Use each public subpath

These six paths are the entire supported import surface. Deep imports
(`@aoc/protocol/dist/...`, `@aoc/protocol/src/...`) are blocked and unsupported.

```ts
// ./contracts — stable, type-only (same symbols as the root)
import type { AuditEventEnvelope, PolicyDecision } from '@aoc/protocol/contracts';

// ./errors — stable, type-only
import type { ProtocolError } from '@aoc/protocol/errors';

// ./claims — stable, mixed: contract shapes are types, enums are runtime values
import { ClaimType } from '@aoc/protocol/claims';
import type { CanonicalClaim } from '@aoc/protocol/claims';

// ./adapters — experimental, type-only interfaces
import type { RevocationLookup, AuditEventSink } from '@aoc/protocol/adapters';

// ./runtime-registry — experimental, runtime classes and tokens
import { AdapterRegistry, AdapterTokens } from '@aoc/protocol/runtime-registry';
```

(`@aoc/protocol/package.json` is also exported, for tooling.)

## 7. Compile and run a complete example

`example.ts` — this is the same program shape as the CI fixture
`test-consumers/typescript-cjs/src/index.ts`:

```ts
import type { CapabilityToken } from '@aoc/protocol';
import { ClaimType } from '@aoc/protocol/claims';
import { AdapterRegistry, AdapterTokens } from '@aoc/protocol/runtime-registry';

const token: CapabilityToken = {
  schemaVersion: '1.0.0',
  tokenId: 'tok-1',
  issuer: 'issuer-1',
  subject: 'subject-1',
  resource: { kind: 'document', id: 'doc-1' },
  scope: ['read'],
  expiresAt: new Date().toISOString(),
  proof: { proofType: 'jwt', issuedAt: new Date().toISOString() },
};

const registry = new AdapterRegistry();
registry.register(
  AdapterTokens.AuditEventSink,
  { recordAuditEvent: () => undefined },
  { implementation: 'noop', source: 'quick-start', version: '0.0.0' },
);

console.log(`ok: token=${token.tokenId} claimType=${ClaimType.Identity}`);
```

Compile and run (TypeScript, CommonJS):

```bash
npx tsc example.ts --module nodenext --moduleResolution nodenext --strict --outDir dist
node dist/example.js
# → ok: token=tok-1 claimType=Identity
```

Use `"moduleResolution": "nodenext"` (or `"bundler"`) so the `exports` subpaths resolve; classic
`"node"` resolution predates `exports` and will not see the subpaths.

## 8. CommonJS and ESM

The package declares `"type": "commonjs"` and ships CommonJS-only output. Both module systems are
tested end-to-end against a real `npm pack` tarball:

- **CommonJS**: `const { ClaimType } = require('@aoc/protocol/claims');`
- **ESM**: `import { ClaimType } from '@aoc/protocol/claims';` — works because Node's ESM loader
  statically detects the emitted CommonJS named exports (`cjs-module-lexer`); there is no separate
  ESM build and no `import`/`require` export conditions. This is not a declared dual package.

## 9. Supported versions

- **Node.js `>=20`** (`engines` in `packages/protocol/package.json`; CI runs Node 20).
- **TypeScript**: fixtures compile with TypeScript 6.x under `strict`; `moduleResolution` must be
  `nodenext` or `bundler`.
- Zero runtime dependencies.

## 10. Stability model

Per `docs/versioning-and-stability.md`:

| Subpath | Stability |
| --- | --- |
| root, `./contracts`, `./errors`, `./claims` | Stable |
| `./adapters`, `./runtime-registry` | Experimental — may change shape while so marked |

Semver intent: patch = non-breaking clarifications/packaging; minor = additive, backwards-compatible
contract surface; major = breaking change to a stable export. Versions are computed exclusively by
Changesets; prerelease channels are governed by `docs/release/PRERELEASE_POLICY.md`.
