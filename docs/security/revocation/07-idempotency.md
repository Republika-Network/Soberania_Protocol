# 07 — Idempotency

`ControlPlaneService.revokeGrant(input: RevokeGrantInput)` — `runtime/controlPlane.ts`.

## Rules implemented

| Rule | Behavior | Test |
|---|---|---|
| Same `idempotency_key` + same `{grant_id, reason}` | Returns the original `RevokeGrantResult` with `idempotentReplay: true`; no re-mutation, no duplicate evidence | "same idempotency_key + same payload replays..." |
| Same `idempotency_key` + different `grant_id`/`reason` | Throws `RevocationIdempotencyConflictError` (`IDEMPOTENCY_CONFLICT:<key>`); the *other* grant referenced by the conflicting call is left untouched | "same idempotency_key + different payload is a conflict..." |
| Retry with no idempotency key, same grant, already revoked | Returns the original result (`idempotentReplay: true`); `revoked_at` does **not** move forward | "retry after a hypothetical timeout ... does not duplicate revocation state" |
| Revoke an already-revoked grant (any caller, any key) | Same as above — revoking twice is a stable no-op, not an error and not a fresh mutation | "removes the grant from listActiveGrants once revoked" + already-revoked branch in `revokeGrant` |
| Two logically concurrent calls, same key | Converge on one `revocationId`, one evidence record | "two revocations racing for the same grant converge on one revocation, not two" |

## Authority

`revokeGrant` requires `authority` — the authenticated revoker (the hosted route derives it from
the API key, never from the body). The grant is revoked only if the authority is an admin or one
of its principals is the **stored** grant's `subject_id` or `requester_id`
(`AccessGrantRevocationUnauthorizedError` otherwise). A `subject_id` / `requester_id` named in the
input is a consistency check against the stored grant, not a source of authority. Evidence
records carry `revoked_by`.

## Fingerprinting

The idempotency cache key is `<authority.owner>\0<idempotency_key>`: keys are scoped per revoker,
so a key used by one party never replays, blocks or reveals another party's revocation. Within one
revoker the value is `{ fingerprint, result }` where
`fingerprint = JSON.stringify({ grant_id, reason, subject_id, requester_id })`. A conflict is
detected by fingerprint mismatch under the same scoped key, not by grant identity alone — this is
what lets rule 2 above catch "same key reused for an unrelated request" rather than only "same
key, same grant, different reason".

## What's explicitly *not* built

- No cross-process/cross-restart persistence of the idempotency cache — it's a `Map` in the same
  process-memory store as everything else in `ControlPlaneService`. A caller retrying across a
  process restart will not get replay protection. This is the same documented limitation as
  `06-cascade-design.md`'s atomicity section: honest in-memory behavior, not a claim of durable
  guarantees.
- No idempotency-key TTL/eviction — keys accumulate for the process lifetime. Acceptable for the
  current in-memory scope; a real store would need an expiry policy.
