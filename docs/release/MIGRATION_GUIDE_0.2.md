# Migration Guide: @aoc/protocol 0.1.x → 0.2.x (proposed)

**Status: 0.2.0 is a *proposed* version derived from pending Changesets. It has NOT been cut,
published, or tagged.** This guide exists so consumers can prepare; today the only distributed
artifact remains the 0.1.0 internal tarball that Soberanía Enterprise pinned (SHA-256
`4e5289b74bc30bcbd63afe87cd00d5417aa6bc665fe50d7c9c1b845bf1896b27`), which already contains the
stabilized contract shapes described below — the 0.1.0→0.2.0 bump is a version-number recognition
of those changes, not a second contract change. (Builds after the Apache-2.0 relicense, PR #319,
hash differently — see the identity note in
[`RELEASE_CANDIDATE_READINESS.md`](RELEASE_CANDIDATE_READINESS.md).)

*Reconciled 2026-10-22:* consumers have since adopted internal `0.2.0-rc` tarballs as well — see
[`RELEASE_CANDIDATE_READINESS.md`](RELEASE_CANDIDATE_READINESS.md) §12 for the consumer state
observed on 2026-10-21. None of them is a published `0.2.0`.

**There are no breaking changes.** 0.1.x consumer code compiles unchanged against the proposed
0.2.x surface. Everything below is either additive or a clarification of what was always true.

## 1. Additive `AuditEventEnvelope` fields

Five new **optional** fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `occurredAt` | `UtcDateTime` | when the audited event happened (vs. `emittedAt`, when the envelope was emitted) |
| `subject` | `ResourceRef` | the entity the event is *about* (vs. `actorId`, the acting/requesting principal) |
| `correlationId` | `CanonicalId` | request/flow correlation |
| `reasonCodes` | `readonly string[]` | canonical decision/reason codes |
| `schemaVersion` | `string` | envelope schema version marker |

Required fields (`eventId`, `eventType`, `emittedAt`, `payload`) and optional `actorId` are
unchanged. **No action is required**; adopt the new fields only if you have richer product-specific
audit shapes to map onto the canonical envelope. The reference pattern is Soberanía Enterprise's
`toProtocolAuditEventEnvelope()` mapper: a single, explicit, field-by-field boundary function from
the product's legacy shape to the envelope — no object spreads, no structural casts.

## 2. `requestedScope` is canonical — `scope`/`action` never existed

`ScopedAccessRequest`'s shape is `{ principalId, resource, requestedScope, requestedAt }` and has
been since the type was introduced (verified against git history during the stabilization sprint).
There is **no** `scope` field, **no** `action` field, and there never was — if your code reads
`.scope` or `.action`, it was written against a local shim, not the real contract.

Migration (as executed by Enterprise):

- `.scope` → `.requestedScope` — a rename at the use sites.
- `.action` → your own extension type, composed over the real contract, never a redeclaration:

```ts
import type { ScopedAccessRequest } from '@aoc/protocol';

// Consumer-owned extension — Protocol intentionally does not define `action`.
export interface MyScopedAccessRequest extends ScopedAccessRequest {
  readonly action?: string;
}
```

## 3. `AocIdentityClaims` is intentionally not exported

`AocIdentityClaims` was never a Protocol export — it existed only inside a consumer-side ambient
shim. Protocol's principal-identity surface is deliberately limited to non-verifying *references*
(`CanonicalPrincipalRef` in `@aoc/protocol/claims`); verified identity/auth claims are an
implementation concern that belongs in the consuming product. Define your own claims type (the
Enterprise pattern is a package-local `VerifiedActorClaims`), and delete any
`declare module '@aoc/protocol'` blocks — the real package needs none.

## 4. `ResourceRef` considerations

`ScopedAccessRequest.resource` (and the new `AuditEventEnvelope.subject`) is a structured
`ResourceRef` (`kind` + `id`), not a string. Do not cast it to a string or compare it with string
equality against legacy `"kind:id"` identifiers — write an explicit accessor that reconstructs your
legacy form (Enterprise's `legacyResourceIdentifier()`), so the conversion is visible and testable.

## 5. Root and subpath imports

The root export (`"."`, added in the consumer-ready packaging sprint) is an alias of `./contracts`:

```ts
import type { AuditEventEnvelope } from '@aoc/protocol';            // root — same symbols
import type { AuditEventEnvelope } from '@aoc/protocol/contracts';  // explicit subpath
```

Both are supported; pick one style per codebase. All six public subpaths are listed in
[`../guides/CONSUMER_GUIDE.md`](../guides/CONSUMER_GUIDE.md). Deep imports remain prohibited.

## 6. Common compiler errors and their fixes

| Error | Cause | Fix |
| --- | --- | --- |
| `Property 'scope' does not exist on type 'ScopedAccessRequest'` | Code written against a shim | Read `.requestedScope` |
| `Property 'action' does not exist on type 'ScopedAccessRequest'` | `action` was never a Protocol field | Move it to your own `extends ScopedAccessRequest` type |
| `Module '"@aoc/protocol"' has no exported member 'AocIdentityClaims'` | Symbol never existed in Protocol | Define a consumer-owned claims type |
| `Type 'ResourceRef' is not assignable to type 'string'` | Legacy string-identifier comparison | Explicit accessor, not a cast |
| `Cannot find module '@aoc/protocol/contracts'` under `"moduleResolution": "node"` | Classic resolution ignores `exports` | Use `"nodenext"` or `"bundler"` |
| `Cannot find module '@aoc/protocol/dist/...'` | Deep import | Use a public subpath — deep imports are blocked by design |

## 7. Rollback to 0.1.0

Per [`ROLLBACK_PLAN.md`](ROLLBACK_PLAN.md): reinstall the pinned 0.1.0 tarball, verify its SHA-256
against the checksum recorded when you pinned it (for Soberanía Enterprise that is `4e5289b7…96b27` in
its `protocol-consumer.lock.json`), and revert your pin/lock record in one commit. Because the
0.1.0 tarball already carries the stabilized shapes, code migrated per this guide also compiles
against it — rollback does not force un-migrating.
