# RC Artifact Evidence — `@aoc/protocol@0.2.0-rc.2` (SOBE-SEC-01F)

**Status: NOT PUBLISHED, NOT HANDED OVER.** No `npm publish`, no registry configuration, no
dist-tag, no git tag, no GitHub Release, no `private: false`, no security advisory, no downstream
handover. `packages/protocol/package.json` remains `"private": true`. This document records the
identity of a produced **internal** release-candidate artifact; it authorizes nothing.

This candidate exists for one reason: **`0.2.0-rc.1` is burned** for security defect SOBE-SEC-01.
See [`RELEASE_CANDIDATE_READINESS.md`](../RELEASE_CANDIDATE_READINESS.md) §10 and the founder
authorization in [`RELEASE_AUTHORITY.md`](../RELEASE_AUTHORITY.md).

## Candidate identity — the complete chain

| Field | Value |
| --- | --- |
| **RC source commit** | `9f495f3c195f140afcb8dabda236aebda42fbf7d` |
| **Evidence commit** | the evidence-only commit carrying this file (a document cannot contain its own hash — verify with `git log -1 --format=%H`) |
| Package | `@aoc/protocol` |
| Version | `0.2.0-rc.2` |
| **Tarball filename** | `aoc-protocol-0.2.0-rc.2.tgz` |
| **SHA-256** | `9f81f112a7c391dc781cb831e01a645e9330408d5e67d27df118887de58c4104` |
| **SHA-512** | `4bfa5995661ae8cfebbcb56f0a0b9b6e8a97a7ccaaa5462a85ebb95ddd9d9f7601ba2e77f8b91ea670006ab3b431905600d2ef319cc7cb2f7fdf913cb0d42197` |
| npm integrity | `sha512-S/pZlWYa6M/rvLVvCgubboqXp8yqpUYqheu5Xd2dn3YBui53+LkepnAAarO0MZBWANLvMZzHyy9/35E8sNQhlw==` |
| **Size** | 287,895 bytes |
| **File count** | 410 |
| **Exports fingerprint** | `a67d65b17dcb34c7da84d9a07cb893e073e21e9edbbc621bcae649afa5cdeb45` (15 export keys) — **identical to rc.0 and rc.1** |
| Runtime symbols | `5df05c3ad68322da6b3913687995ad40ac651109f9c8c5730aec8b0e325d0d9e` (260; rc.1 had 259 — `deriveSovereignKeyId` added) |
| Public surface digest | `8ca7482a21288745c4cfa648b08244ae4f7c6600487975f55c85cf7e1f6e3734` |
| **`protocolWorkspaceClean`** | **`true`** |
| **Reproducibility** | Two consecutive packs are byte-identical, and a fresh clone of the RC source commit, packed without building, reproduces the same SHA-256 |
| License | Apache-2.0 (`LICENSE` + `NOTICE` shipped) |
| Runtime dependencies | none |
| Integration contract | `aoc.cross-repository-integration@1.0.2`, `frozen`, shipped as unexported metadata |

`git show 9f495f3c195f140afcb8dabda236aebda42fbf7d:packages/protocol/package.json` reports
`"name": "@aoc/protocol"` and `"version": "0.2.0-rc.2"` — the recorded source commit builds the
recorded artifact.

## Why this candidate exists: rc.1 is burned

`@aoc/protocol@0.2.0-rc.1` (`sha256:b0d6ee6f…3f60`) — like `0.2.0-rc.0` before it — could report a
manifest or claim issuer binding as verified without cryptographically tying the signing key to the
registered issuer key (SOBE-SEC-01). The fix is commit `2402b3a`; the compatibility consequences are
in the `0.2.0-rc.2` entry of `packages/protocol/CHANGELOG.md`.

Per `PRERELEASE_POLICY.md`, a candidate that fails validation is **abandoned, not patched in
place**, and version numbers are never reused.

## rc.0 and rc.1 evidence is untouched

| File | State |
| --- | --- |
| `aoc-protocol-0.2.0-rc.0-release-manifest.json`, `aoc-protocol-0.2.0-rc.0.sbom.spdx.json`, `aoc-protocol-0.2.0-rc.0-consumer.lock.json`, `rc-artifact-0.2.0-rc.0.md` | unmodified |
| `aoc-protocol-0.2.0-rc.1-release-manifest.json`, `aoc-protocol-0.2.0-rc.1.sbom.spdx.json`, `aoc-protocol-0.2.0-rc.1-consumer.lock.json`, `rc-artifact-0.2.0-rc.1.md` | unmodified |

Each was hashed before and after this increment and is identical.

## What moved, and what did not

| | rc.1 | rc.2 |
| --- | --- | --- |
| Version | `0.2.0-rc.1` | `0.2.0-rc.2` (derived by `changeset version`, never hand-edited) |
| SHA-256 | `b0d6ee6f…` | `9f81f112…` |
| Size / files | 280,149 B / 407 | 287,895 B / 410 (adds internal `dist/canonical/snapshot.*`, not an export) |
| contractVersion | `1.0.1` | `1.0.2` (`editorialOrMetadataOnly` — identity moved, export set did not) |
| **Export map digest** | `a67d65b1…` | `a67d65b1…` — **unchanged** |
| **Export keys** | 15 | 15 — **unchanged** |
| Runtime symbols | 259 | 260 (`deriveSovereignKeyId`, additive, founder-authorized) |
| Prerelease family | `rc` | `rc` — unchanged |
| `private` | `true` | `true` — unchanged |

## The artifact itself was verified, not just the source

The packed tarball was installed into a clean-room consumer and exercised through declared exports
only: `deriveSovereignKeyId` is exported from `@aoc/protocol/manifest` (CommonJS and ESM named
import) and reproduces the key id `generateSovereignKeyPair` assigns; `integration-contract.json`,
read **by path**, reports `aoc.cross-repository-integration@1.0.2` binding `0.2.0-rc.2` with
`0.2.0-rc.1` and `0.2.0-rc.0` recorded as burned; importing the contract or a `dist/` path as a
module specifier fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`. The repository's own fixtures
(`npm run protocol:consumer:check`) install the artifact and compile and execute TypeScript/CJS,
JavaScript/CJS, TypeScript/ESM and contract-verification consumers.

## Reproducibility environment

Packed in a clean POSIX clone with Node `v22.23.1` / npm `10.9.8` — the same toolchain recorded for
rc.1. Every tar entry is mode `0644` and `LICENSE`, `NOTICE` and `README.md` have LF line endings.
As documented for rc.1, packing from a Windows drive mounted into WSL produces different tar headers
from identical source; that difference is environmental, not a tamper signal.

## Handover

**Not authorized.** The artifact is written to the git-ignored `dist-rc/` directory alongside
`protocol-consumer.lock.json` and `SHA256SUMS`; the bytes are reproducible from the recorded commit,
so the commit plus this evidence is the record. Handing it to any downstream repository requires a
separate founder authorization.

## What this document does not authorize

Registry publication, dist-tag creation or movement, `npm publish`, `private: false`, git tags,
GitHub Releases, a security advisory, deployment, a stable `0.2.0`, General Availability, or any
downstream handover or repinning. `0.2.0-rc.2` closes SOBE-SEC-01 only; it does not make the
authorization layer production-safe.
