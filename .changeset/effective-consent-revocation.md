---
"@aoc-runtime/vault-runtime": patch
---

Root runtime modules (not versioned packages): a subject's signed revocation now withdraws the consent itself.

Capability tokens are bearer objects, so revocation must apply to the consent that backs them, not to individual token hashes. A revoke consent (action "revoke", `prior_consent` = the consent, `revoke_target` = one of its tokens) now revokes the consent named by `prior_consent`, and every path that honours a capability reads that consent's revocation from an injected registry before anything else: the vault (store, mint, access), `verifyCapabilityToken`, `evaluateCapabilityAccess`, `consumeCapabilityAccess`, the legacy `enforceCapability` bridge, the interpreter, `executeCapabilityFlow`, protocol `mintCapability`/`evaluateEnforcement`/`authorizeExecution` (through `createCapabilityRevocationCheck`), the hosted routes and the HRKey adapter.

Breaking changes:

- `RevocationRegistry` gains `isConsentRevoked(consentHash)` and `revokeConsent(record)`. `InMemoryRevocationRegistry` implements both; it is append-only and has no `reset`.
- There is no process-global revocation registry any more. `revokeCapabilityToken`, `isRevoked`, `revokeConsent`, `isConsentHashRevoked` and `readRevocation` require a registry; `resetRevocationRegistry` is removed. `evaluateCapabilityAccess` (new `registries.revocationRegistry`), `consumeCapabilityAccess`, `verifyCapabilityToken`, the interpreter and `executeCapabilityFlow` deny with `REVOCATION_UNAVAILABLE` when no registry is supplied or the registry cannot answer.
- Revoked consents are reported as `CONSENT_REVOKED` (vault, evaluation, consumption, interpreter); a revoked token hash stays `REVOKED` / `CAPABILITY_REVOKED`. Operator containment of one token (`revokeCapabilityToken`) never revokes the consent.
- `Vault.revokeCapability(hash)` is removed; containment goes through the vault's injected `revocationRegistry`.
- The vault binds a revocation to the stored consent it names (`prior_consent` must exist, subject and grantee must match, `issued_at` must not predate it, a named token known to the vault must belong to it) and records it before returning. A token the vault never minted may be named.
- HRKey: `revokeCapability({ consent })` becomes `revokeConsent({ consent })`.
- `RuntimeCore.revocationRegistry` is required; hosted `/capability/mint`, `/enforcement/evaluate` and `/execution/authorize` read capability and consent revocation from it. `/capability/mint` now mints from a live consent instead of always failing with `revocation_unknown`. `HostedRuntimeClientOptions.revocationRegistry` backs local mode; without it local decisions are `unknown` (deny).

The in-memory registry is single-process state. A deployment with more than one runtime instance must inject a shared store behind `RevocationRegistry` whose reads see its writes and which throws when it cannot answer; multi-instance revocation safety is not claimed until such a backend is tested.
