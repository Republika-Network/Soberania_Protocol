---
"@aoc-runtime/crypto": minor
"@aoc/enterprise": minor
"@aoc-runtime/authorization-runtime": minor
"@aoc-runtime/consent-runtime": minor
"@aoc-runtime/portable-cognition": minor
"@aoc-runtime/trust-registry-runtime": minor
"@aoc-runtime/audit-runtime": minor
---

Governance signatures are verified only against independently configured trust.

Breaking changes:

- `verifyPayloadSignature(payload, signature, trustedKeys)` requires a `TrustedKeyResolver`, verifies with the resolved key and requires the envelope's signer identity to match it. New helpers: `createTrustedKeySet`, `deriveRuntimeAuthorityKeyId`, `assertTrustedSigningKey`, `isCanonicalEd25519PublicKey`, `snapshotGovernanceSignature`.
- `TrustRegistryRuntime` takes `{ trustRoots, now? }`, stores each signer's public key, validates RFC 3339 timestamps, and replaces `evaluateSignatureTrust` with `verifySignatureTrust(payload, signature, scope)`, decided at the registry clock.
- `AuthorizationRuntime` takes a `FederatedAuthorityVerifier`. A supplied federated authority must be a signature bound to the request, audience, validity window and a single-use nonce. It is verified before policy evaluation, and policies see only its verified view. Without a configured verifier it is denied. Any supplied value, including `federatedAuthority: null`, must verify or the request is denied. With a federated authority present, `input.at` must be within the verifier's clock skew of its clock.
- Successful federated verification consumes the assertion's nonce before policy, governance, capability and consent run; a later denial does not restore it, so a retry needs a new assertion, and anyone holding an assertion can spend it with a denied request.
- `ConsentRuntime.verifySignedGrant`, `IntegrityVerificationRuntime` and `AuditRuntime.verifyChain` require trusted keys.
- `@aoc-runtime/trust-registry-runtime` and `@aoc-runtime/audit-runtime` re-export the changed Enterprise surface.

Deployment requirements:

- Replay protection across processes requires a shared, atomic `FederatedAuthorityReplayGuard`; `InMemoryFederatedAuthorityReplayGuard` covers a single process only.
- The registry clock must never move backwards, and replicas must keep their clocks synchronized within the configured clock skew.
- The federation graph is trusted operator configuration: only the final signer key is verified cryptographically, not delegation through intermediate runtimes.
