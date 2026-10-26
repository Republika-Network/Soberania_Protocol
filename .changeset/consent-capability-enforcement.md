---
"@aoc-runtime/consent-runtime": minor
"@aoc-runtime/capability-runtime": minor
"@aoc-runtime/provider-interfaces": minor
"@aoc/enterprise": minor
"@aoc-runtime/trust-registry-runtime": minor
"@aoc-runtime/pmfreak-adapter": minor
---

Consent grants, capabilities and identity records are honoured only within the authority that backs them.

Breaking changes:

- `ConsentRuntime` takes `{ trustedKeys }` and decides consent only from signed grants. `ConsentProvider.getActiveGrants` returns `SignedConsentGrant<ConsentGrant>[]`. A grant counts only if it is signed by the trusted key whose `issuerId` is its `subjectActorId`, is for exactly the requested capability, and the requesting actor is its delegate (or its subject when it has none). A grant with a `delegateActorId` also needs the delegate's signature (`signDelegation`). `verifySignedGrant` applies the same signer binding.
- `CapabilityRuntime` matches namespaces by whole path segment: `/a` covers `/a` and `/a/b`, not `/ab`.
- `InMemoryTrustService` takes `{ trustedIssuerKeys }` as its second argument. `registerCredential` and `grantConsent` require `issuer_signature`, made by the named issuer's trusted key over `identityRegistrationPayload(kind, record)`. Without configured keys, registration is refused.
- `@aoc-runtime/pmfreak-adapter` takes `consentTrustedKeys` in its provider bundle.

Root runtime modules in this repository (not versioned packages) change as well:

- Capability evaluation and consumption deny without the parent consent and deny capabilities whose scope, permissions or start time exceed it. The legacy `enforceCapability` bridge requires `consent`.
- The vault honours only consents whose subject owns the requested pack.
- `evaluateEnforcement` and `authorizeExecution` require `consent` and deny unless the capability was minted from it, stays within it, and the consent is active (including its revocation status, read from the same revocation port).
- The hosted runtime ships no API keys or capability secret: `createRuntimeServer` requires an `apiKeyStore` and a capability secret, and capability enforcement is strict unless soft mode is chosen explicitly. `DEFAULT_API_KEYS` is removed. API key records list the principals they may act for and an optional `admin` role, and every route checks the principals named in the request against them.

Consents are signed by their subject (consent-object-spec.md §10.2):

- A consent (`ConsentObjectV1`, protocol consent, HMAC-path `ConsentRecord`) authorizes nothing without `subject_proof`: a detached, versioned Ed25519 proof (`AocSubjectConsentProof` v1) over the domain-separated canonical consent content and its hash. The subject must be an Ed25519 `did:key`, and the verification key is always derived from the subject DID, never from the proof. `consent_hash` is unchanged.
- `signConsentObject`, `verifyConsentObjectProof`, `createDidKeySigner`, `signConsentRecord` and `verifyConsentRecordProof` are the single signing and verification contract.
- The vault refuses unsigned consents and revocations, and a revocation must be signed by the capability's subject and name its consent in `prior_consent`. Minting, evaluation, consumption, protocol consent state, enforcement, execution, HMAC capability issuance and consent-record decisions all verify the proof themselves. Unsigned consents remain readable as legacy data but never authorize.
- New deny reasons: `CONSENT_UNAUTHENTICATED` (capability access, enforcement, vault, HMAC issuance) and `DENY_UNAUTHENTICATED` (consent-record decisions).
- The HRKey adapter takes candidate-signed consents: `prepareConsent` returns the unsigned consent for the candidate's wallet, `grantConsent({ consent })` stores a signed grant, and `revokeCapability({ consent })` takes a candidate-signed revocation.
