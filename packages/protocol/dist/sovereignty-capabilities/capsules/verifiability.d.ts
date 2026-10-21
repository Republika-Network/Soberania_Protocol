import type { VerificationKeyResolver } from '../../adapters';
import type { SignedClaim, SignedSovereignManifest, SovereignClaimVerificationResult, SovereignManifestVerificationResult, SovereignProof, VerifiableSovereignClaim } from '../../manifest';
import type { SovereigntyCapabilityImplementation } from '../implementation';
/**
 * AOC.VERIFIABILITY — the production Sovereignty Capability capsule that
 * answers:
 *
 *   "Given a sovereign artifact and the proof attached to it, can an
 *    independent party determine whether that proof is cryptographically and
 *    structurally sound — without trusting whoever presented it, without the
 *    originating runtime, and without changing the artifact?"
 *
 * It is the sixth of the canonical eight to become a real implementation of the
 * SM-03 socket. The cryptographic primitives it consumes already existed in
 * `@aoc/protocol/manifest` — `verifySovereignManifest`, `verifySignedClaim` (by
 * way of `verifySignedSovereignClaim`) and `verifySovereignSignature`. This
 * capsule is what exposes them through the common capability socket, so a
 * consumer holding only the published package can ask the question and get an
 * answer that is attributable, machine-readable and honest about what it did
 * not check.
 *
 * ## Three operations, deliberately
 *
 *   verify-signed-manifest   SignedSovereignManifest   -> manifest verification report
 *   verify-signed-claim      SignedClaim               -> claim verification report
 *   verify-sovereign-proof   payload + SovereignProof  -> proof verification report
 *
 * That is the whole surface. There is no `generate-key-pair`, `sign-manifest`,
 * `sign-claim` or `sign-payload` operation, and that omission is a design
 * decision rather than missing work — see "Verification-first" below.
 *
 * ## What a passing verification establishes
 *
 * At most: *the holder of the private key matching the proof's public key
 * signed this canonical payload*, plus — only when `issuerBinding` is
 * `verified` — *the resolver the caller supplied binds that key id to the
 * asserted issuer*. It establishes nothing else. Specifically it does **not**
 * establish that the assertion is historically true, that the issuer owns the
 * subject, that a derivation was authorized, that copyright or a licence
 * exists, that a court would accept the claim, that the claim is uncontested,
 * or that any system should act on it.
 *
 *     signature valid          != assertion true
 *     digest valid             != legal ownership
 *     issuer key bound         != issuer factually correct
 *     cryptographically valid  != uncontested
 *     verification result      != governance decision
 *
 * ## Verification-first: no signing, no keys
 *
 * The capsule verifies and never produces proofs. A production signer needs an
 * explicit key-management architecture, and the SM-03 invocation input is a
 * generic transport shared by every capability — turning it into a carrier for
 * `privateKeyPem`, seed phrases, KMS secrets or wallet secrets would solve the
 * wrong problem and put key material somewhere no capability contract should
 * put it. So no operation here accepts private key material, nothing here
 * calls `generateSovereignKeyPair`, and nothing here calls
 * `signSovereignManifest`, `signClaim` or `signSovereignPayload`. Those
 * primitives remain public, unchanged and directly usable by issuers,
 * fixtures and applications that have their own key management. A managed
 * signer/KMS abstraction is deferred rather than invented here.
 *
 * ## Verifiability is not Integrity
 *
 * `verify-signed-manifest` deliberately accepts **no** content bytes. The
 * underlying `verifySovereignManifest` primitive supports them; this capsule
 * calls it without them, and the resulting `contentDigest: 'not_performed'` is
 * the honest report of a check nobody asked for. Accepting bytes here would
 * make the mineral boundary "Verifiability secretly performs Integrity". A
 * caller who wants both runs AOC.INTEGRITY over the bytes and AOC.VERIFIABILITY
 * over the signed manifest, correlating the two invocations with one
 * `correlationId`. Nothing in this module ever turns `not_performed` into
 * `valid`.
 *
 * ## What this capsule never does
 *
 * - **Sign, or hold keys.** No signing operation, no key generation, no key
 *   storage, no rotation, no PKI, no global key registry, no trusted key store.
 * - **Reimplement cryptography.** No second canonicalizer, SHA implementation,
 *   Ed25519 verifier, base64url decoder or signature engine exists here. Where
 *   a granular reason cannot be obtained from a current primitive, a truthful
 *   coarse reason is reported instead of duplicating cryptographic logic.
 * - **Broaden the algorithm surface.** `aoc-canonical-json/1` + SHA-256 +
 *   Ed25519 remain the only profile. No secp256k1, ECDSA, RSA, BLS, P-256,
 *   Keccak, SHA-3, multihash, wallet or chain signature format is interpreted.
 * - **Check revocation.** No `RevocationLookup`, no OCSP, no CRL, no credential
 *   status. A `verified` issuer binding does **not** imply a non-revoked key.
 * - **Build a trust chain.** No X.509, CA path, DID resolution, web of trust or
 *   trust registry. A binding is only as authoritative as the resolver the
 *   caller injected, and Protocol assigns no trust of its own.
 * - **Apply time policy.** `proof.signedAt` is preserved and read, never turned
 *   into an expiry, freshness or key-validity-window rule that no canonical
 *   primitive owns.
 * - **Score.** No trust, confidence, credibility, reputation, assurance or risk
 *   score. Every check reports `valid`/`invalid`/`not_performed`, never "87%".
 * - **Decide.** No allow, deny, approve, reject, grant, block or enforce. A
 *   governance system may later require that verification passed; that is its
 *   policy, not this capsule's output.
 * - **Adjudicate.** No standing is read or written. `contestClaim` is not
 *   called, no `StandingStatus` is assigned, and a claim whose signature
 *   verifies can be `Contested` at the same moment without contradiction.
 * - **Record.** No `CanonicalVerification` is created — a cryptographic check
 *   is not a verifier's assessment of whether a claim is true — no
 *   `VerificationStatus` is widened, no `VerificationProvider` is required, and
 *   nothing is persisted.
 * - **Mutate.** The manifest, claim, proof and payload handed in are read and
 *   returned untouched. No public key is normalized, no `keyId` rewritten, no
 *   `payloadHash` repaired, no signature replaced, no artifact re-signed and no
 *   canonicalized rewrite returned as a "fixed" artifact. A broken proof stays
 *   broken.
 * - **Invoke another mineral.** `invokeSovereigntyCapability` is not called
 *   here. Identity is not asked to mint, Integrity is not asked to hash,
 *   Provenance is not asked to assert, Portability is not asked to import and
 *   Interoperability is not asked to describe. Composition stays the caller's
 *   decision, visible in the caller's own evidence.
 * - **Reach out.** No filesystem, network, database, chain, RPC, wallet or
 *   provider. Key material either travels inside the `SovereignProof` or comes
 *   from the injected resolver; how *that* finds a key is the adapter's
 *   concern, not this capsule's.
 * - **Branch on the subject.** No namespace, asset type or business domain is
 *   read. Cryptographic verification is subject-type neutral: an alien
 *   namespace, a property registry, an external token system, an AI agent and
 *   an API resource all verify through exactly the same architecture.
 */
/** The operations AOC.VERIFIABILITY 1.0.0 supports. Closed for this version. */
export declare const VERIFIABILITY_SOVEREIGNTY_CAPABILITY_OPERATIONS: readonly ["verify-signed-manifest", "verify-signed-claim", "verify-sovereign-proof"];
export type VerifiabilitySovereigntyCapabilityOperation = (typeof VERIFIABILITY_SOVEREIGNTY_CAPABILITY_OPERATIONS)[number];
/**
 * Stable, machine-readable codes this capsule owns.
 *
 * They fall into two layers that must never be confused, because they answer
 * different questions:
 *
 * - **Execution-failure codes** explain why the capability could not answer
 *   the question at all — the invocation could not be interpreted, the subject
 *   it named was not the artifact's, or an injected dependency faulted. They
 *   appear in `SovereigntyCapabilityFailureResult.reasonCodes`.
 * - **Verification-result codes** explain why a verification that *did* run
 *   came back negative. They appear inside the operation output's
 *   `verification.reasons`, never as an execution failure.
 *
 * The reason codes the underlying primitives already publish
 * (`MANIFEST_DIGEST_MISMATCH`, `SIGNATURE_INVALID`,
 * `PROOF_PAYLOAD_HASH_MISMATCH`, `CLAIM_DIGEST_MISMATCH`,
 * `CLAIM_SIGNATURE_INVALID`, `ISSUER_BINDING_UNVERIFIED`, the
 * `INVALID_CLAIM_*` structural codes, …) are preserved verbatim rather than
 * renamed or re-prefixed: a consumer reading a reason off a verification
 * report sees the same string whichever layer produced it.
 */
export declare const VERIFIABILITY_SOVEREIGNTY_CAPABILITY_REASON_CODES: Readonly<{
    readonly invalidInput: "VERIFIABILITY_INVALID_INPUT";
    readonly unsupportedOperation: "VERIFIABILITY_UNSUPPORTED_OPERATION";
    readonly subjectMismatch: "VERIFIABILITY_SUBJECT_MISMATCH";
    readonly invalidSignedManifestTarget: "VERIFIABILITY_INVALID_SIGNED_MANIFEST_TARGET";
    readonly invalidSignedClaimTarget: "VERIFIABILITY_INVALID_SIGNED_CLAIM_TARGET";
    readonly invalidGenericProofTarget: "VERIFIABILITY_INVALID_GENERIC_PROOF_TARGET";
    readonly keyResolutionFailed: "VERIFIABILITY_KEY_RESOLUTION_FAILED";
    readonly payloadNotCanonicalizable: "VERIFIABILITY_PAYLOAD_NOT_CANONICALIZABLE";
    readonly sovereignProofInvalid: "VERIFIABILITY_SOVEREIGN_PROOF_INVALID";
}>;
export type VerifiabilitySovereigntyCapabilityReasonCode = (typeof VERIFIABILITY_SOVEREIGNTY_CAPABILITY_REASON_CODES)[keyof typeof VERIFIABILITY_SOVEREIGNTY_CAPABILITY_REASON_CODES];
/**
 * Capability-specific input for `verify-signed-manifest`.
 *
 * Deliberately no `contentBytes` field: see the Integrity boundary above.
 * Deliberately no private key field, in any spelling.
 *
 * `issuerId` is an expected issuer and is relevant only when the
 * implementation was constructed with a `VerificationKeyResolver`. It narrows,
 * never replaces, the issuer the signed manifest names: unless it equals the
 * registrant's id, `issuerBinding` is `unverified` with
 * `ISSUER_BINDING_ISSUER_MISMATCH`. Without a resolver it is simply unused —
 * supplying it never causes a binding to be reported as checked.
 */
export interface VerifySignedSovereignManifestInput {
    readonly operation: 'verify-signed-manifest';
    /** May have crossed an external trust boundary; structurally floor-checked, never trusted by cast. */
    readonly signedManifest: SignedSovereignManifest;
    readonly issuerId?: string;
}
/**
 * Capability-specific input for `verify-signed-claim`.
 *
 * The claim union is the canonical sovereign one — Origin, Authorship and
 * Derivation — because those are the claim types with real runtime structural
 * validators. Verifying a signature over a claim type Protocol cannot
 * structurally check would report more confidence than exists.
 */
export interface VerifySignedSovereignClaimInput {
    readonly operation: 'verify-signed-claim';
    readonly signedClaim: SignedClaim<VerifiableSovereignClaim>;
    /** Expected issuer; narrows, never replaces, the claim's signed `issuer` (see the manifest input). */
    readonly issuerId?: string;
}
/**
 * Capability-specific input for `verify-sovereign-proof`.
 *
 * The generic operation is intentionally *not* a semantic validator. It answers
 * one narrow question — does this proof cryptographically match this canonical
 * payload — and never "this payload is a valid manifest", "this claim is true"
 * or "this payload belongs to an owner". When an artifact has dedicated
 * semantics, the dedicated operation is the right one.
 */
export interface VerifySovereignProofInput {
    readonly operation: 'verify-sovereign-proof';
    /** Any canonicalizable value. Never inspected for a subject, an id or a schema. */
    readonly payload: unknown;
    readonly proof: SovereignProof;
}
export type VerifiabilitySovereigntyCapabilityInput = VerifySignedSovereignManifestInput | VerifySignedSovereignClaimInput | VerifySovereignProofInput;
/**
 * The manifest verification report, carried whole.
 *
 * The primitive's `SovereignManifestVerificationResult` is returned unchanged
 * rather than flattened to a boolean: collapsing it would destroy exactly the
 * information that makes the result honest — which checks ran, which passed,
 * and which were never attempted. `checks.contentDigest` is normally
 * `not_performed` here, and that visibility is the point.
 */
export interface VerifySignedSovereignManifestOutput {
    readonly operation: 'verify-signed-manifest';
    readonly verification: SovereignManifestVerificationResult;
}
export interface VerifySignedSovereignClaimOutput {
    readonly operation: 'verify-signed-claim';
    readonly verification: SovereignClaimVerificationResult;
}
/**
 * The generic proof report.
 *
 * Deliberately narrow: `verifySovereignSignature` is a fail-closed boolean, so
 * a coarse `VERIFIABILITY_SOVEREIGN_PROOF_INVALID` is reported rather than a
 * second digest/signature implementation built purely to distinguish every
 * cryptographic failure mode. An unsupported algorithm, an unsupported
 * canonicalization profile, a payload-hash mismatch and malformed key or
 * signature material all fail closed through that one primitive.
 */
export interface SovereignProofVerificationResult {
    readonly valid: boolean;
    readonly reasons: readonly VerifiabilitySovereigntyCapabilityReasonCode[];
}
export interface VerifySovereignProofOutput {
    readonly operation: 'verify-sovereign-proof';
    readonly verification: SovereignProofVerificationResult;
}
export type VerifiabilitySovereigntyCapabilityOutput = VerifySignedSovereignManifestOutput | VerifySignedSovereignClaimOutput | VerifySovereignProofOutput;
export interface VerifiabilitySovereigntyCapabilityInputValidationResult {
    readonly valid: boolean;
    readonly reasons: readonly VerifiabilitySovereigntyCapabilityReasonCode[];
}
/**
 * Options for the production factory.
 *
 * The resolver is **injected**, never discovered: there is no global lookup, no
 * Enterprise runtime registry, no mutable module-level resolver and no
 * ambient default. Omitting it is a first-class configuration, not a degraded
 * one — it means issuer binding is honestly reported as `not_performed`.
 */
export interface CreateVerifiabilitySovereigntyCapabilityImplementationOptions {
    readonly verificationKeyResolver?: VerificationKeyResolver;
}
export interface VerifiabilitySovereigntyCapabilityImplementation extends SovereigntyCapabilityImplementation<VerifiabilitySovereigntyCapabilityInput, VerifiabilitySovereigntyCapabilityOutput> {
}
/**
 * Validates the capability-specific Verifiability input.
 *
 * This answers *"can this invocation be interpreted?"* and nothing else. It
 * verifies no signature, recomputes no digest and resolves no key — validation
 * and verification are different questions, and running the second inside the
 * first would make "the artifact is invalid" indistinguishable from "the
 * request was malformed".
 *
 * The structural floor is deliberately shallow. It confirms only enough wrapper
 * shape to hand the target to the real verifier safely: the wrapper is an
 * object, the payload it names is present, the declared digest is a string and
 * the proof is an object. It does **not** require the inner manifest or claim
 * to be structurally valid, because an invalid manifest and a malformed claim
 * are *legitimate verification targets* — their verification result should say
 * `manifestStructure: 'invalid'` or `claimStructure: 'invalid'`, not "your
 * invocation was malformed". For the same reason an unsupported proof algorithm
 * or canonicalization profile is not pre-filtered here: it fails closed inside
 * the cryptographic primitive and comes back as an invalid verification.
 *
 * The input is read, never mutated, copied, frozen or normalized.
 */
export declare function validateVerifiabilitySovereigntyCapabilityInput(value: unknown): VerifiabilitySovereigntyCapabilityInputValidationResult;
export declare function isValidVerifiabilitySovereigntyCapabilityInput(value: unknown): value is VerifiabilitySovereigntyCapabilityInput;
/**
 * Builds the production AOC.VERIFIABILITY capsule.
 *
 * A factory, so importing this module performs no work: no key is generated or
 * resolved, no artifact is verified, no environment is read, no network or
 * filesystem is touched, no id is minted and no clock is captured at import
 * time. Constructing the implementation performs no work either — an injected
 * resolver is stored, never called, until an operation that actually needs an
 * issuer binding executes.
 *
 * No clock option exists, because a verification report is a deterministic
 * function of its inputs: the same artifact and the same resolver answer
 * produce the same report, with no `verifiedAt`, `checkedAt`, `reportId` or
 * `verificationId` inside it. *When* a verification happened, and under which
 * invocation, is recorded truthfully in the SM-03 invocation evidence instead.
 */
export declare function createVerifiabilitySovereigntyCapabilityImplementation(options?: CreateVerifiabilitySovereigntyCapabilityImplementationOptions): VerifiabilitySovereigntyCapabilityImplementation;
//# sourceMappingURL=verifiability.d.ts.map