# @aoc/protocol Known Limitations

Verified facts about what the release-candidate state does **not** include, as of 2026-10-22.
Consumers and decision-makers should read this alongside
[`RELEASE_CANDIDATE_READINESS.md`](RELEASE_CANDIDATE_READINESS.md).

1. **The package remains `"private": true`.** It cannot be published in its current state, by
   design; flipping the flag is a founder decision guarded by CI checks.
2. **No registry has been selected.** npm public, GitHub Packages, and GitHub release tarball are
   compared but undecided — see [`REGISTRY_READINESS.md`](REGISTRY_READINESS.md).
3. **Control of the `@aoc` npm scope is not verified.** `npm view` returns E404 and a scope search
   returns zero packages, which proves only that the package is unpublished — not that the scope is
   available or controlled. External verification is required before any npm publish.
4. **No public prerelease exists.** `0.2.0` is a proposed version derived from pending Changesets;
   no version has been cut, tagged, or published. The prerelease tag (`rc` vs `next`) is an open
   founder decision ([`PRERELEASE_POLICY.md`](PRERELEASE_POLICY.md)).
5. **Release authority is incomplete.** Founder authorization is defined as required, but no
   release owner or backup publisher has been designated
   ([`RELEASE_AUTHORITY.md`](RELEASE_AUTHORITY.md)).
6. **Soberanía Enterprise consumes a pinned internal tarball**, not a registry package. Its validation
   evidence ([`REFERENCE_CONSUMER_EVIDENCE.md`](REFERENCE_CONSUMER_EVIDENCE.md)) is real and
   CI-blocking, but it is consumption of `file:./vendor/aoc-protocol-0.1.0.tgz` — no deployment
   claim is made.
7. **No 1.0 compatibility guarantee exists.** All versions are 0.x; stable subpaths follow semver
   intent, but pre-1.0 minors may add surface, and no long-term support commitment has been made.
8. **Two public subpaths are experimental.** `./adapters` and `./runtime-registry` may change shape
   without a major bump while marked experimental in
   [`../versioning-and-stability.md`](../versioning-and-stability.md).
9. **Enterprise-side follow-ups exist and are consumer-side items, not Protocol defects:**
   Enterprise's crypto verification modules (`capability-verifier`, `delegation-verifier`) import
   `CapabilityToken` from `@aoc/protocol` but internally widen the token to an untyped record for
   payload inspection — a typing-hardening follow-up owned and tracked by Enterprise. Nothing in
   Protocol's contract surface blocks it.
10. **Shipped declaration maps reference unshipped sources.** `dist/**/*.d.ts.map` point at
    `../src`, which is intentionally excluded from the tarball; the maps are inert for consumers
    (go-to-definition falls back to `.d.ts`). Decide before 1.0: ship `src` or stop emitting maps
    in the package build. Changing this now would change the tarball hash, so it is deliberately
    deferred.
11. **The Apache-2.0 relicense broke byte-identity with the Enterprise-validated artifact —
    intentionally.** PR #319 (2026-07-16) relicensed the repository; completing that relicense
    inside the package (single `license` key, Apache-2.0 `LICENSE` text, shipped `NOTICE`) gives
    the RC its current identity, SHA-256 `7d0d42a5…d9841`. The earlier hashes (`4e5289b7…96b27`
    pre-relicense as validated by Enterprise, `d4a8b67d…c7704` transitional post-metadata-append)
    are historical only — see the artifact identity history in
    [`RELEASE_CANDIDATE_READINESS.md`](RELEASE_CANDIDATE_READINESS.md). Enterprise's pinned
    tarball and compatibility lock still reference the pre-relicense artifact and will need
    revalidation at the next version cut.
12. **`@aoc/protocol@0.2.0-rc.0` is burned.** Its `canonicalizeJSON` truncated the exponent of
    numbers rendered in exponential notation with a fractional mantissa, so `7.9e-10` and
    `7.9e-100` produced identical canonical bytes and identical SHA-256 material, and neither
    round-tripped. Repaired by P0-CANON-01 and shipped as `0.2.0-rc.1` (`sha256:b0d6ee6f…`) by
    P0-CANON-02. When `0.2.0-rc.0` was burned (2026-08-25), PMFreak, Frontera and Live Data Rail
    each vendored it by checksum. **Observed consumer state, 2026-10-21:** an inspection of each
    repository's default branch found PMFreak, Frontera and Live Data Rail each pinned to
    `0.2.0-rc.1` by checksum (`sha256:b0d6ee6f…`; Frontera as a development dependency). The
    inspection covered those default branches only, not other branches, forks, built artifacts or
    deployments. No assessment has been made of whether data any consumer produced while on
    `0.2.0-rc.0` is affected. See [`RELEASE_CANDIDATE_READINESS.md`](RELEASE_CANDIDATE_READINESS.md)
    §8–§9 and §12. `0.2.0-rc.1` has since been burned in turn (item 14), and so has `0.2.0-rc.2`
    (item 15); the current successor is `0.2.0-rc.3`, and no consumer has been moved to it.
13. **The successor is an internal tarball, not a release.** `0.2.0-rc.3` is not published to npm
    or any other registry, carries no GitHub Release and no release tag, and is not stable `0.2.0`.
    It is not a declaration of production readiness. Its tarball is not distributed; it is
    reproducible from source commit `fd705f689e04781748e308368a10e52ae32af079`, which is publicly
    retrievable through pull request #393 and the source-provenance tag
    `source/aoc-protocol-0.2.0-rc.3` (see item 15). Unlike `0.2.0-rc.1`, it is **not authorized
    for handover** to any downstream repository. Every limitation above about
    registry selection, `@aoc` scope control, release-owner designation and `private: true` is
    unchanged by it.
14. **`@aoc/protocol@0.2.0-rc.1` is burned for security defect SOBE-SEC-01, and `0.2.0-rc.2` fixes
    only that defect.** Manifest and claim verification in `0.2.0-rc.0` and `0.2.0-rc.1` could
    report an issuer binding as verified without tying the signing key to the registered issuer
    key. `0.2.0-rc.2` (`sha256:9f81f112…`) makes the binding cryptographic and adds
    `deriveSovereignKeyId`; its verification is stricter, so inputs that previously verified can
    now be rejected (see the `0.2.0-rc.2` entry in `packages/protocol/CHANGELOG.md`). No consumer
    has been moved to it, and no assessment has been made here of whether any consumer relied on the
    defective binding. **It does not make the authorization layer production-safe:** three further
    findings from the same security review (P0-2, P0-3, R3-4a) remain open and are tracked
    privately. See [`RELEASE_CANDIDATE_READINESS.md`](RELEASE_CANDIDATE_READINESS.md) §10.
15. **`@aoc/protocol@0.2.0-rc.2` is burned for a further SOBE-SEC-01 defect (N1), and `0.2.0-rc.3`
    fixes only that defect.** In `0.2.0-rc.0` through `0.2.0-rc.2`, an issuer supplied by the caller
    to manifest or claim verification could replace the issuer the signed content names. In
    `0.2.0-rc.3` (`sha256:3d17beff…`) it is an expected issuer that can only narrow that identity; a
    caller passing a different issuer now gets `unverified` (see the `0.2.0-rc.3` entry in
    `packages/protocol/CHANGELOG.md`). Treat a verification result as authenticating its issuer only
    when `checks.issuerBinding` is `'verified'`; `valid` alone does not say that. `0.2.0-rc.2` was
    never handed to any consumer, and no consumer has been moved to `0.2.0-rc.3`. Its source commit
    `fd705f68…` is publicly retrievable through pull request #393 (`refs/pull/393/head`) and the
    unsigned annotated tag `source/aoc-protocol-0.2.0-rc.3`; the fix was squash-merged to `main` as
    `3cb635db…`, whose `packages/protocol` tree is identical. A fresh pack of either commit
    reproduces `sha256:3d17beff…`, so the consumer lock's "fresh pack from the pinned commit" can
    be performed from the public repository. Both issuer-attribution flaws are described in the
    published repository security advisory GHSA-c624-x7cg-8cf3. **It does not make the
    authorization layer production-safe:** P0-2, P0-3 and R3-4a remain open and are tracked
    privately. See [`RELEASE_CANDIDATE_READINESS.md`](RELEASE_CANDIDATE_READINESS.md) §11–§12.
