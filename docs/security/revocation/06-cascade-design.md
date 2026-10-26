# 06 — Cascade & Atomicity Design

## What "atomic" means for `ControlPlaneService.revokeGrant`

There is no persistent database in this codebase for execution grants — `ControlPlaneService`
holds `Map<string, GrantedAccess>` and an append-only `RevocationEvidenceRecord[]` in process
memory. "Atomic or transactionally equivalent" (ADR §12) is implemented as follows:

- The entire state transition — grant mutation, evidence push, idempotency-cache write — is one
  **synchronous** block with no `await` and no I/O. Node.js runs a synchronous function to
  completion before yielding to any other queued task (timer, promise callback, I/O callback), so
  no concurrent caller can observe a grant in a half-revoked state. This is the honest, in-memory
  equivalent of `BEGIN; UPDATE ...; INSERT INTO revocation_evidence ...; COMMIT;` for a store that
  has no transactional storage engine underneath it yet.
- `runtime/__tests__/controlPlaneRevocation.test.ts`'s "concurrency" suite fires two
  `revokeGrant` calls via `Promise.all` with the same idempotency key and asserts they converge on
  one `revocationId` and one evidence record — this is the closest meaningful proxy for "no
  torn writes" that an in-memory, single-process store can demonstrate.

## What cascade means today, and what it doesn't yet

The sprint's cascade requirements (§24–25: revoking an identity/passport must invalidate dependent
passports, delegations, execution grants, credentials) assume a real hierarchy connecting those
subject types. **That hierarchy does not exist in this codebase.** Concretely:

- Consent → capability is the one edge that is covered, by key rather than by index: every
  `ProtocolCapability` (`parent_consent_hash`) and every `CapabilityTokenV1` (`consent_ref`)
  carries its consent's hash, and every authorization path asks the registry about that hash
  before the token's own (`capability/revocation.ts` `readRevocation`,
  `protocol/revocation` `createCapabilityRevocationCheck`). Revoking a `consent_grant` therefore
  invalidates capabilities already minted from it, including ones minted outside the vault or
  re-identified with a new `token_id`, without a reverse index.
- `GrantedAccess` (`runtime/controlPlane.ts`) has no children of its own to cascade to — it is a
  leaf record in this codebase.

This is documented here rather than papered over with a fabricated cascade implementation against
subjects that don't exist. Building the real cascade (identity → passport → delegation →
execution grant, each pointing at its parent, with a real revocation-propagation job) is
recommended as the next sprint — see `13-final-verdict.md`.

## Rollback safety

If `revokeGrant` throws partway through validation (not-found, subject mismatch, idempotency
conflict), it throws **before** the atomic mutation section — the grant map and evidence log are
untouched. There is no scenario in the current implementation where a thrown error leaves a grant
partially mutated, because all validation happens before the single synchronous mutation block.
Verified by `runtime/__tests__/controlPlaneRevocation.test.ts`: the idempotency-conflict test
asserts the *other* grant (`grantB`) remains in `listActiveGrants` after a conflicting call
targeting it fails.
