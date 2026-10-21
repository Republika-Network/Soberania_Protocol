# @aoc/audit-sdk

## 0.1.1-rc.3

### Patch Changes

- Updated dependencies
  - @aoc/protocol@0.2.0-rc.3

## 0.1.1-rc.2

### Patch Changes

- Updated dependencies [2402b3a]
  - @aoc/protocol@0.2.0-rc.2

## 0.1.1-rc.1

### Patch Changes

- Updated dependencies [b5ced70]
  - @aoc/protocol@0.2.0-rc.1

## 0.1.1-rc.0

### Patch Changes

- ab2ac6e: Stabilize the public shapes of `ScopedAccessRequest` and `AuditEventEnvelope` after their first
  real cross-repo consumption by AOC Enterprise (see PR #74 in `AOC-Enterprise`, which validated
  against the real tarball from PR #314 and documented three contract gaps).

  - **`ScopedAccessRequest`**: no shape change. Confirmed via git history that `requestedScope` is and
    has always been the sole canonical scope field — there is no `scope`/`action` predecessor to keep
    compatible. Added a facade parity assertion (`tests/contracts/symbol-parity.test.ts`) and
    declaration-level shape tests (`tests/contracts/audit-envelope-and-scoped-access-shape.test.ts`)
    that were previously missing.
  - **`AuditEventEnvelope`**: additive, backwards-compatible new optional fields — `occurredAt`,
    `subject: ResourceRef`, `correlationId: CanonicalId`, `reasonCodes: readonly string[]`, and
    `schemaVersion: string`. Existing required fields (`eventId`, `eventType`, `emittedAt`, `payload`)
    and the optional `actorId` are unchanged. These fields give downstream consumers with richer,
    product-specific audit event shapes (e.g. Enterprise's `event_id`/`occurred_at`/`subject_id`/
    `requester_id`/`request_id`/`reason`) a canonical, portable target to map onto without inventing
    incompatible shapes locally.
  - **`@aoc/audit-sdk`**: fixed `auditEventSchemaExample`, a pre-existing, unreferenced constant whose
    `required` field list (`schemaVersion`, `actor`, `action`, `resource`, `timestamp`,
    `tenantIsolation`) never matched the real `AuditEventEnvelope` shape since it was introduced. It now
    reflects the real required fields.
  - **`AocIdentityClaims`** (imported by AOC Enterprise but never exported by Protocol) is explicitly
    documented as an Enterprise-owned concept, not added to Protocol — see
    `docs/protocol/PUBLIC_API.md` "Governance decisions" for the full rationale. No Protocol code
    change follows from this; Enterprise's migration off the import is separate, Enterprise-side work.

  No exports were removed or renamed. No breaking changes. Not published.

- Updated dependencies [ab2ac6e]
- Updated dependencies [0ed38d4]
- Updated dependencies [18a5493]
- Updated dependencies [1b26d97]
- Updated dependencies [af99aed]
- Updated dependencies [94a1983]
- Updated dependencies [73b259a]
- Updated dependencies [7244690]
- Updated dependencies [cf03788]
- Updated dependencies [82217cf]
- Updated dependencies [5ed0670]
- Updated dependencies [dd38d37]
- Updated dependencies [7049fad]
- Updated dependencies [07f82e2]
- Updated dependencies [d92b84b]
- Updated dependencies [c79e752]
- Updated dependencies [d70d525]
- Updated dependencies [b1b4056]
- Updated dependencies [3304abd]
  - @aoc/protocol@0.2.0-rc.0
