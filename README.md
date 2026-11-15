# Soberanía Protocol

Soberanía Protocol defines the semantic contract layer for programmable authority.

This repository contains protocol-level concepts such as:

- capability semantics
- delegation semantics
- policy decision contracts
- actor and subject models
- audit lineage contracts
- SDK/API interface types

This repository is not the enterprise runtime implementation.

## Layering

- Soberanía Protocol: contracts, semantics, interfaces. It has no runtime dependencies and does not
  require Frontera Systems or any hosted service.
- Frontera Systems: an optional commercial product built on the protocol (it replaced the retired
  "Soberanía Enterprise" brand).
- Other consumers adopt individual capabilities through the package's declared entry points.

### Technical namespace

Soberanía Protocol preserves the existing `aoc` technical namespace for compatibility. Protocol
identifiers (for example `aoc-canonical-json/1`), URI schemes and public API symbols using `aoc` or
`AOC` remain unchanged unless explicitly versioned otherwise. This is intentional and does not affect
the Soberanía Protocol product identity.

**Package names are the exception.** The approved public distribution names are
`@soberania-protocol/protocol` and `@soberania-protocol/sdk`, under the project's npm organization.
They are **prepared for publication, not published**: no install command works yet. Until then, the
workspace package is `@aoc/protocol` and is consumed as a local tarball. Never resolve `@aoc/*` or
`@aoc-runtime/*` from the public npm registry; this project does not control those scopes there. See
[`docs/getting-started/PACKAGE_IDENTITY.md`](docs/getting-started/PACKAGE_IDENTITY.md).

## Soberanía Protocol package (`packages/protocol`)

The versioned, publishable slice of this layering is the `@aoc/protocol` npm workspace package at
[`packages/protocol/`](packages/protocol/). (This is distinct from the top-level [`protocol/`](protocol/)
directory, which is unversioned source feeding the private root `aoc-runtime` package — the two are
unrelated despite the shared name.)

`@aoc/protocol` is validated as an external dependency through real tarball installs, not just unit
tests: `npm run protocol:pack` builds and packs it, and `npm run protocol:consumer:check` installs the
resulting tarball into isolated TypeScript/CommonJS, JavaScript/CommonJS, and TypeScript/ESM consumer
fixtures under [`test-consumers/`](test-consumers/) and runs them. Publication to a package registry is
a separate, not-yet-made release decision — see
[`docs/release/PACKAGE_DISTRIBUTION_STRATEGY.md`](docs/release/PACKAGE_DISTRIBUTION_STRATEGY.md).

### Quick start

```bash
npm ci
npm run build --workspace @aoc/protocol
npm test                         # repo-wide jest suite, includes protocol architecture boundary tests
npm run protocol:pack            # npm pack ./packages/protocol
npm run protocol:pack:check      # build + pack + install into a fixture + typecheck + import-boundary checks
npm run protocol:consumer:check  # install the tarball into test-consumers/* and run them
npm run protocol:release:check   # all of the above + tarball reproducibility check
npm run protocol:release:manifest # record checksums, file list, and SPDX SBOM under docs/release/evidence/
```

New consumers should start at
[`docs/getting-started/QUICK_START.md`](docs/getting-started/QUICK_START.md); the complete
operating reference (pinning, upgrades, rollback, stability tiers) is
[`docs/guides/CONSUMER_GUIDE.md`](docs/guides/CONSUMER_GUIDE.md).

### Release process

Changes to `@aoc/protocol`'s public contracts are tracked with [Changesets](.changeset/). Run
`npm run changeset` to record a change, `npm run release:status` to preview the version impact, and
`npm run validate:release` (also run in CI) before merging. No publish, tag, or GitHub release is
performed automatically — see `.changeset/README.md` and
[`docs/release/PACKAGE_DISTRIBUTION_STRATEGY.md`](docs/release/PACKAGE_DISTRIBUTION_STRATEGY.md) for
the sequencing this repository intends to follow before any registry publish. Prerelease channels,
rollback, and version-immutability rules are governed by
[`docs/release/PRERELEASE_POLICY.md`](docs/release/PRERELEASE_POLICY.md); the current
release-candidate evidence and the publication approval gate live in
[`docs/release/RELEASE_CANDIDATE_READINESS.md`](docs/release/RELEASE_CANDIDATE_READINESS.md).

## Current status

`packages/protocol/src` has been audited for runtime independence: it has no imports reaching
Enterprise, PMFreak, other runtime packages, or infrastructure/persistence/transport code. This is
enforced automatically by `__tests__/architecture/protocol-purity.test.ts` and
`__tests__/architecture/protocol-enterprise-boundary.test.ts`, and by `scripts/check-version-graph.mjs`
(which rejects `workspace:` dependency specifiers and PMFreak-named dependencies repo-wide). The
package is packable, installable from a tarball, and importable via its declared `exports` map without
any monorepo-only paths or aliases — see `packages/protocol/README.md` for consumer-facing usage and
compatibility details.

## License

Except where expressly stated otherwise, Soberanía Protocol is licensed under the
Apache License, Version 2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).

The contents of [`enterprise/`](./enterprise/) are proprietary, are expressly
excluded from the Apache License, Version 2.0, and may not be used, copied,
modified, distributed, sublicensed, published, or commercialized without a
separate written agreement with the copyright owner. See
[`enterprise/LICENSE`](./enterprise/LICENSE).
