# RC Artifact Evidence — `@aoc/protocol@0.2.0-rc.3` (SOBE-SEC-01T)

**Status: NOT PUBLISHED, NOT HANDED OVER.** No `npm publish`, no registry configuration, no
dist-tag, no git tag, no GitHub Release, no `private: false`, no downstream handover.
`packages/protocol/package.json` remains `"private": true`. This document records the identity of a
produced **internal** release-candidate artifact; it authorizes nothing.

This candidate exists for one reason: **`0.2.0-rc.2` is burned** for a further SOBE-SEC-01 defect
(N1). See [`RELEASE_CANDIDATE_READINESS.md`](../RELEASE_CANDIDATE_READINESS.md) §11 and the founder
authorization in [`RELEASE_AUTHORITY.md`](../RELEASE_AUTHORITY.md).

## Candidate identity — the complete chain

| Field | Value |
| --- | --- |
| **RC source commit** | `fd705f689e04781748e308368a10e52ae32af079` — see "Source availability" below |
| **Evidence commit** | the evidence-only commit carrying this file (a document cannot contain its own hash — verify with `git log -1 --format=%H`) |
| Package | `@aoc/protocol` |
| Version | `0.2.0-rc.3` |
| **Tarball filename** | `aoc-protocol-0.2.0-rc.3.tgz` |
| **SHA-256** | `3d17beff5a0538172f3d888184459511c44540332ccde51a30da32afa1b358f4` |
| **SHA-512** | `62b864de877004ea7c96638d4d34a22e268806e23e6a85e0891612bf8d0889e3b45a545ac3c087404902dd729dd50eb823257e0377666a36bf05bdaa59d3632f` |
| npm integrity | `sha512-Yrhk3odwBOp8lmONTTSiLiaIBuI+aoXgiRYSv40IieO0WlRaw8CHQEkC3XKd1Q64IyV+A3dmaja/Bb2qWdNjLw==` |
| **Size** | 288,728 bytes |
| **File count** | 410 |
| **Exports fingerprint** | `a67d65b17dcb34c7da84d9a07cb893e073e21e9edbbc621bcae649afa5cdeb45` (15 export keys) — **identical to rc.0, rc.1 and rc.2** |
| Runtime symbols | `5df05c3ad68322da6b3913687995ad40ac651109f9c8c5730aec8b0e325d0d9e` (260) — **identical to rc.2** |
| Public surface digest | `639e8d5d38c61a84ed0b09fd3d18201a39d4246a1acf3ee2909d04f6b73ddf87` (rc.2: `8ca7482a…`; it includes the build output, which the fix changes) |
| **`protocolWorkspaceClean`** | **`true`** |
| **Reproducibility** | Two consecutive packs are byte-identical, and fresh clones of the RC source commit built and packed under Node `v22.23.1` / npm `10.9.8` and Node `v20.20.2` / npm `10.8.2` produce byte-identical tarballs with this SHA-256 |
| License | Apache-2.0 (`LICENSE` + `NOTICE` shipped) |
| Runtime dependencies | none |
| Integration contract | `aoc.cross-repository-integration@1.0.3`, `frozen`, shipped as unexported metadata |

`git show fd705f689e04781748e308368a10e52ae32af079:packages/protocol/package.json` reports
`"name": "@aoc/protocol"` and `"version": "0.2.0-rc.3"` — the recorded source commit builds the
recorded artifact. Its `packages/protocol` tree is `12a41cb095ba75c30733885894a019f88e44cd53`.

## Source availability — verified locally, not yet publicly

These are separate facts, and only the first is established by this record:

| Fact | Status |
| --- | --- |
| **Package reproducibility** | **Verified.** The SHA-256 above is reproduced from the source commit, on two Node versions. |
| **Source-commit identity** | **Verified locally.** `fd705f68…` was checked out from a clean clone, its tree and version match, and it builds this artifact. |
| **Public source availability** | **Not established.** When this record was written, `fd705f68…` was not reachable from any public branch, pull-request reference or tag of the repository. It is expected to be preserved by a public reference when the fix is disclosed; until that is done and recorded, a consumer cannot fetch this commit, and the lock's "fresh pack from the pinned commit" can be performed only where the commit is available. |

Nothing in this record claims a tag, a public branch, a merged commit or a published package.

## Why this candidate exists: rc.2 is burned

`@aoc/protocol@0.2.0-rc.2` (`sha256:9f81f112…4104`) — like `0.2.0-rc.0` and `0.2.0-rc.1` — let a
caller-supplied issuer replace the issuer named in a signed manifest or claim as the identity issuer
binding was verified for (SOBE-SEC-01, N1). In `0.2.0-rc.3` a caller-supplied issuer is an expected
issuer that can only narrow that identity. The compatibility consequences are in the `0.2.0-rc.3`
entry of `packages/protocol/CHANGELOG.md`.

Per `PRERELEASE_POLICY.md`, a candidate that fails validation is **abandoned, not patched in
place**, and version numbers are never reused. `0.2.0-rc.2` was never handed to any consumer.

## rc.0, rc.1 and rc.2 evidence is untouched

| File | State |
| --- | --- |
| `aoc-protocol-0.2.0-rc.0-release-manifest.json`, `aoc-protocol-0.2.0-rc.0.sbom.spdx.json`, `aoc-protocol-0.2.0-rc.0-consumer.lock.json`, `rc-artifact-0.2.0-rc.0.md` | unmodified |
| `aoc-protocol-0.2.0-rc.1-release-manifest.json`, `aoc-protocol-0.2.0-rc.1.sbom.spdx.json`, `aoc-protocol-0.2.0-rc.1-consumer.lock.json`, `rc-artifact-0.2.0-rc.1.md` | unmodified |
| `aoc-protocol-0.2.0-rc.2-release-manifest.json`, `aoc-protocol-0.2.0-rc.2.sbom.spdx.json`, `aoc-protocol-0.2.0-rc.2-consumer.lock.json`, `rc-artifact-0.2.0-rc.2.md` | unmodified |

Each was hashed before and after this increment and is identical.

## What moved, and what did not

| | rc.2 | rc.3 |
| --- | --- | --- |
| Version | `0.2.0-rc.2` | `0.2.0-rc.3` (derived by `changeset version`, never hand-edited) |
| SHA-256 | `9f81f112…` | `3d17beff…` |
| Size / files | 287,895 B / 410 | 288,728 B / 410 (same file list) |
| contractVersion | `1.0.2` | `1.0.3` (`editorialOrMetadataOnly` — identity moved, export set did not) |
| **Export map digest** | `a67d65b1…` | `a67d65b1…` — **unchanged** |
| **Export keys** | 15 | 15 — **unchanged** |
| Runtime symbols | 260 | 260 — **unchanged** |
| Changeset | minor | minor (caller-visible expected-issuer semantics) |
| Prerelease family | `rc` | `rc` — unchanged |
| `private` | `true` | `true` — unchanged |

## The artifact itself was verified, not just the source

The repository's own fixtures (`npm run protocol:consumer:check`) install the packed artifact and
compile and execute TypeScript/CJS, JavaScript/CJS, TypeScript/ESM and contract-verification
consumers; the contract-verification consumer reads `integration-contract.json` by path as
`aoc.cross-repository-integration@1.0.3` binding `0.2.0-rc.3`, resolves the 15 contracted exports and
rejects the forbidden import forms.

## Reproducibility environment

Packed in clean POSIX clones with umask `022`. Every tar entry is mode `0644`, and `LICENSE`,
`NOTICE` and `README.md` have LF line endings. Packing from a Windows drive mounted into WSL produces
different tar headers from identical source; that difference is environmental, not a tamper signal.

## Handover

**Not authorized.** The artifact is written to the git-ignored `dist-rc/` directory alongside
`protocol-consumer.lock.json` and `SHA256SUMS`; the bytes are reproducible from the recorded commit.
Handing it to any downstream repository requires a separate founder authorization.

## What this document does not authorize

Registry publication, dist-tag creation or movement, `npm publish`, `private: false`, git tags,
GitHub Releases, changes to a security advisory, deployment, a stable `0.2.0`, General Availability,
or any downstream handover or repinning. `0.2.0-rc.3` closes SOBE-SEC-01 including N1 only; it does
not make the authorization layer production-safe.
