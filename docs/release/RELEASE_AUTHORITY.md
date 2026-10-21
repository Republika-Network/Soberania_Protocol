# @aoc/protocol Release Authority

Who may authorize, execute, and roll back releases of `@aoc/protocol`. This document records the
**current, factual** state of release authority — it does not invent names, roles, or backups that
have not been designated.

## Authorization

- **Every publication — prerelease or stable — requires explicit, written founder authorization**
  naming the exact version and dist-tag (per [`PRERELEASE_POLICY.md`](PRERELEASE_POLICY.md)). No
  CI job, bot, or contributor may publish on their own initiative; no automated publish pipeline
  exists, deliberately.

## Roles

| Role | Holder | Status |
| --- | --- | --- |
| Release authority (authorizes) | Founder | Standing — the only authority evidenced by repository governance (`RELEASE_GOVERNANCE_MODEL.md`, `PACKAGE_DISTRIBUTION_STRATEGY.md`, `PRERELEASE_POLICY.md`) |
| Release owner (executes a given release) | **Pending founder designation** | No release owner is evidenced anywhere in the repository; none is invented here |
| Backup publisher | **Pending** | No backup is designated; designating one is part of the pre-publication checklist |

## Required approvals per release

1. Written founder authorization (version + dist-tag + channel).
2. Green `npm run protocol:rc:check` (the RC gate) on the exact release commit. The gate requires
   `"private": true` by default; on the authorized release commit — where the approval gate
   requires the flag flipped — the release owner runs it with `AOC_PUBLISH_AUTHORIZED=1`, an
   explicit, human-set override that is never configured in CI workflows and fails the gate if set
   while the package is still private.
3. Evidence regenerated for that commit (`npm run protocol:release:manifest`) and committed under
   [`evidence/`](evidence/).
4. The publication approval gate in
   [`RELEASE_CANDIDATE_READINESS.md`](RELEASE_CANDIDATE_READINESS.md) fully checked off.

## Candidate authorizations on record

Each internal candidate identity is authorized separately; an authorization for one identity is not
evidence of authorization for the next. Earlier records: `0.2.0-rc.0` (P0-PKG-01) and `0.2.0-rc.1`
(P0-CANON-02) in [`RELEASE_CANDIDATE_READINESS.md`](RELEASE_CANDIDATE_READINESS.md) §7 and §9.

### `@aoc/protocol@0.2.0-rc.2` — SOBE-SEC-01F (founder, 2026-10-20)

**Authorized by the founder:** the internal security release candidate identity
`@aoc/protocol@0.2.0-rc.2`, prerelease family `rc` (unchanged), distribution channel **internal,
checksum-pinned tarball only**. Within that identity, the authorization covers:

- computing the version with `changeset version` in pre mode — never by hand — from the SOBE-SEC-01
  changeset;
- the dependency-graph consequences of that computation: `@aoc/asset-protocolization`,
  `@aoc/audit-sdk`, `@aoc/capability-tokens`, `@aoc/consent-engine` and `@aoc/scoped-access`, each
  `0.1.1-rc.1` → `0.1.1-rc.2`, because each pins `@aoc/protocol` exactly;
- the integration contract's identity move, `aoc.cross-repository-integration` `1.0.1` → `1.0.2`,
  classified `editorialOrMetadataOnly` because the export set and export map digest are unchanged;
- packing the candidate and recording its release evidence under its own identity.

**Why:** `0.2.0-rc.1` carries security defect SOBE-SEC-01. Manifest and claim verification reported
an issuer binding as verified by comparing key identifiers, without tying the signing key to the
registered issuer key; a single-snapshot gap (SOBE-SEC-01.1) and an evidence-attribution gap in
`AOC.VERIFIABILITY` (SOBE-SEC-01.2) were fixed with it. The fix is the security integration commit
`2402b3a581a7bd62495e63c941e170ac9115227a` (cherry-picked from `3c13247`) on `main` at `9c90b78`.
`0.2.0-rc.0` carries the same defect and was already burned.

**`0.2.0-rc.1` is superseded and its number is burned.** Its release manifest, SBOM, consumer lock
and artifact record (`docs/release/evidence/aoc-protocol-0.2.0-rc.1-*`,
`rc-artifact-0.2.0-rc.1.md`) are retained unmodified as the record of what was built and why it
was abandoned. `sha256:b0d6ee6f…3f60` remains its identity; it is not regenerated, rewritten or
deleted.

**Not authorized:** npm or any registry publication, dist-tag creation or movement, `private:
false`, git tags, GitHub Releases, a security advisory, deployment, stable `0.2.0`, General
Availability, handover of the artifact to any downstream repository, and repinning or otherwise
modifying any consumer (Live Data Rail, Frontera, PMFreak, Soberanía Enterprise). Downstream rollout
needs its own founder authorization.

**What `0.2.0-rc.2` does not establish.** It closes SOBE-SEC-01 only. The authorization layer is not
production-safe as a whole: findings P0-2, P0-3 and R3-4a from the same security review remain
open and are tracked privately, together with related follow-ups. They are outside this candidate's
scope and are not fixed by it. An `rc` is a candidate for validation, not a release.

*Amended by SOBE-SEC-01J (2026-10-20):* the paragraph above previously described where the open
findings lie. That description was reduced to their identifiers so that public documentation does
not locate unresolved issues; the authorization's scope is unchanged, and the full record is kept in
the restricted security file.

### `@aoc/protocol@0.2.0-rc.3` — SOBE-SEC-01T (founder, 2026-10-21)

**Authorized by the founder:** preparing the internal security release candidate identity
`@aoc/protocol@0.2.0-rc.3`, prerelease family `rc` (unchanged), distribution channel **internal,
checksum-pinned tarball only**. Within that identity, the authorization covers:

- a new changeset for `@aoc/protocol` classified **minor**, because the fix changes caller-visible
  verification semantics (see below), and computing the version from it with `changeset version` in
  pre mode — never by hand;
- the dependency-graph consequences of that computation: `@aoc/asset-protocolization`,
  `@aoc/audit-sdk`, `@aoc/capability-tokens`, `@aoc/consent-engine` and `@aoc/scoped-access`, each
  `0.1.1-rc.2` → `0.1.1-rc.3`, because each pins `@aoc/protocol` exactly;
- the integration contract's identity move, `aoc.cross-repository-integration` `1.0.2` → `1.0.3`,
  classified `editorialOrMetadataOnly` because the export set and export map digest are unchanged.

**Not yet authorized:** recording this candidate's release evidence (release manifest, SBOM,
consumer lock, artifact record). The evidence names the source commit a consumer re-packs from, and
that commit's public identity is decided separately; until then `protocol:rc:check` reports the
release manifest evidence as stale, by design.

**Why:** `0.2.0-rc.2` carries a further SOBE-SEC-01 defect (N1). Manifest and claim verification let
a caller-supplied issuer replace the issuer the signed content names as the identity an issuer
binding was verified for. The issuer supplied by a caller is now an expected issuer that can only
narrow that identity; a mismatch fails the binding. `0.2.0-rc.0` and `0.2.0-rc.1` carry the same
defect and were already burned. The export surface is unchanged; the behaviour change is the reason
the changeset is minor.

**`0.2.0-rc.2` is superseded and its number is burned.** It was never distributed: no consumer pins
it. Its release manifest, SBOM, consumer lock and artifact record
(`docs/release/evidence/aoc-protocol-0.2.0-rc.2-*`, `rc-artifact-0.2.0-rc.2.md`) are retained
unmodified as the record of what was built and why it was abandoned. `sha256:9f81f112…4104` remains
its identity; it is not regenerated, rewritten or deleted.

**Not authorized:** npm or any registry publication, dist-tag creation or movement, `private:
false`, git tags, GitHub Releases, changes to a security advisory, deployment, stable `0.2.0`,
General Availability, handover of the artifact to any downstream repository, and repinning or
otherwise modifying any consumer (Live Data Rail, Frontera, PMFreak, Soberanía Enterprise).
Downstream rollout needs its own founder authorization.

**What `0.2.0-rc.3` does not establish.** It closes SOBE-SEC-01 including N1 only. Findings P0-2,
P0-3 and R3-4a from the same security review remain open and are tracked privately, together with
related follow-ups. They are outside this candidate's scope and are not fixed by it. An `rc` is a
candidate for validation, not a release.

## Credential custody

- **No publication credentials exist in this repository** — no tokens, no `.npmrc` auth, no
  workflow secrets consumed by any publish step (there is no publish step). This is verified state,
  not aspiration.
- When provisioned, credentials live outside the repository (registry-side trusted publisher /
  OIDC preferred; otherwise a 2FA-protected token in the platform secret store), are scoped to the
  minimum needed, and are never committed, echoed into logs, or shared out-of-band.

## Tag authority

- No git tags or GitHub Releases exist for `@aoc/protocol`, and none may be created outside a
  founder-authorized release execution. Tags are cut only from the exact commit that passed the RC
  gate, by the designated release owner.

## Emergency process

On a suspected credential compromise or bad publish:

1. Revoke/rotate the affected credential at the registry immediately (founder or release owner).
2. Follow [`ROLLBACK_PLAN.md`](ROLLBACK_PLAN.md) — burn the affected version, point consumers at
   the last known-good pinned version, publish a corrected **new** version once safe.
3. Record the incident, timeline, and burned versions in `docs/release/` as evidence.

## Evidence retention

Release evidence — manifests, checksums, SBOMs, dry-run records, consumer validation evidence — is
retained **in git** under [`docs/release/evidence/`](evidence/) and referenced from the readiness
report. Evidence is append-only in spirit: superseded evidence is replaced by regeneration in a
reviewed commit, never silently edited.
