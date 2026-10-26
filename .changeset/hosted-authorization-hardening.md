---
"@aoc-runtime/vault-runtime": patch
---

Root runtime modules (not versioned packages): hosted authorization hardening.

- Hosted time-bound routes (`/enforcement/evaluate`, `/execution/authorize`, `/trust/verify`, `/data/access`, `/payout/execute`) decide at the core's trusted clock (`RuntimeCore.now`). A `now` in the request body is refused with `INVALID_REQUEST` instead of being honoured, so an expired consent, capability or credential cannot be revived by presenting a past timestamp. Tests and trusted embedders inject the clock on the core.
- `ControlPlaneService.revokeGrant` requires `authority` (the authenticated revoker: owner, principals, admin). A grant is revoked only by its subject, its requester, or an admin, checked against the stored grant; a `requester_id` or `subject_id` in the input that contradicts the grant is refused (`AccessGrantRequesterMismatchError`, `AccessRequestSubjectMismatchError`). Unauthorized revokers get `AccessGrantRevocationUnauthorizedError` (`CALLER_NOT_AUTHORIZED` on the route). Idempotency keys are scoped per revoker, so one party cannot squat or read another party's key; within one revoker the fingerprint conflict rule is unchanged. Evidence records carry `revoked_by`.
- `evaluateConsent(request, record, options)` and `issueCapabilityToken(input, secret, options)` require `options.checkRevocation` (a `RevocationCheckPort` keyed by `consent_id`, subject type `consent_grant`). The presented record's `revoked_at` is advisory and can only deny. Without a port, or when the port answers unknown or throws, the decision is `DENY_REVOCATION_UNKNOWN` and issuance refuses. There is no in-memory default for this port; a deployment wires its own registry.
