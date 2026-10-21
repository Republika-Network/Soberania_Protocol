"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VERIFIABILITY_SOVEREIGNTY_CAPABILITY_REASON_CODES = exports.VERIFIABILITY_SOVEREIGNTY_CAPABILITY_OPERATIONS = void 0;
exports.validateVerifiabilitySovereigntyCapabilityInput = validateVerifiabilitySovereigntyCapabilityInput;
exports.isValidVerifiabilitySovereigntyCapabilityInput = isValidVerifiabilitySovereigntyCapabilityInput;
exports.createVerifiabilitySovereigntyCapabilityImplementation = createVerifiabilitySovereigntyCapabilityImplementation;
const canonical_1 = require("../../canonical");
const snapshot_1 = require("../../canonical/snapshot");
const identity_1 = require("../../identity");
const manifest_1 = require("../../manifest");
const canonical_ref_1 = require("./canonical-ref");
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
exports.VERIFIABILITY_SOVEREIGNTY_CAPABILITY_OPERATIONS = Object.freeze([
    'verify-signed-manifest',
    'verify-signed-claim',
    'verify-sovereign-proof',
]);
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
exports.VERIFIABILITY_SOVEREIGNTY_CAPABILITY_REASON_CODES = Object.freeze({
    // --- execution failures: the question could not be answered ---------------
    invalidInput: 'VERIFIABILITY_INVALID_INPUT',
    unsupportedOperation: 'VERIFIABILITY_UNSUPPORTED_OPERATION',
    subjectMismatch: 'VERIFIABILITY_SUBJECT_MISMATCH',
    invalidSignedManifestTarget: 'VERIFIABILITY_INVALID_SIGNED_MANIFEST_TARGET',
    invalidSignedClaimTarget: 'VERIFIABILITY_INVALID_SIGNED_CLAIM_TARGET',
    invalidGenericProofTarget: 'VERIFIABILITY_INVALID_GENERIC_PROOF_TARGET',
    keyResolutionFailed: 'VERIFIABILITY_KEY_RESOLUTION_FAILED',
    // --- verification results: the answer was "no" ----------------------------
    payloadNotCanonicalizable: 'VERIFIABILITY_PAYLOAD_NOT_CANONICALIZABLE',
    sovereignProofInvalid: 'VERIFIABILITY_SOVEREIGN_PROOF_INVALID',
});
function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function hasOwn(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
}
function isNonBlankString(value) {
    return typeof value === 'string' && value.trim() !== '';
}
/**
 * Whether a value can be serialized under `aoc-canonical-json/1` at all.
 *
 * Calls the one authoritative canonicalizer rather than restating its rules,
 * and discards the thrown error rather than surfacing it: no raw exception
 * text, message or stack ever reaches a verification result or evidence.
 */
function isCanonicalizable(value) {
    // The outcome is assigned rather than returned out of the `catch`, so the
    // failing branch is an explicit negative result rather than a swallowed
    // error. The thrown value itself is deliberately discarded: no raw exception
    // text, message or stack ever reaches a verification result or evidence.
    let canonicalizable = true;
    try {
        (0, canonical_1.canonicalizeJSON)(value);
    }
    catch {
        canonicalizable = false;
    }
    return canonicalizable;
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
function validateVerifiabilitySovereigntyCapabilityInput(value) {
    const codes = exports.VERIFIABILITY_SOVEREIGNTY_CAPABILITY_REASON_CODES;
    if (!isPlainObject(value)) {
        return { valid: false, reasons: [codes.invalidInput] };
    }
    const operation = value.operation;
    if (typeof operation !== 'string'
        || !exports.VERIFIABILITY_SOVEREIGNTY_CAPABILITY_OPERATIONS.includes(operation)) {
        return { valid: false, reasons: [codes.unsupportedOperation] };
    }
    const reasons = [];
    // An optional expected issuer must be a real id when it is present at all;
    // a blank or present-but-`undefined` one is a malformed request rather than
    // an absent expectation, matching every other optional in this package.
    if ((operation === 'verify-signed-manifest' || operation === 'verify-signed-claim')
        && hasOwn(value, 'issuerId')
        && !isNonBlankString(value.issuerId)) {
        reasons.push(codes.invalidInput);
    }
    if (operation === 'verify-signed-manifest') {
        const signedManifest = value.signedManifest;
        if (!isPlainObject(signedManifest)
            || !hasOwn(signedManifest, 'manifest')
            || typeof signedManifest.manifestDigest !== 'string'
            || !isPlainObject(signedManifest.proof)) {
            reasons.push(codes.invalidSignedManifestTarget);
        }
    }
    if (operation === 'verify-signed-claim') {
        const signedClaim = value.signedClaim;
        if (!isPlainObject(signedClaim)
            || !hasOwn(signedClaim, 'claim')
            || typeof signedClaim.digest !== 'string'
            || !isPlainObject(signedClaim.proof)) {
            reasons.push(codes.invalidSignedClaimTarget);
        }
    }
    if (operation === 'verify-sovereign-proof') {
        // `payload` may be any canonicalizable value — `null`, `0` and `false`
        // included — so presence is checked rather than truthiness. A payload that
        // cannot be canonicalized at all is a verification result, not a malformed
        // invocation.
        if (!hasOwn(value, 'payload') || !isPlainObject(value.proof)) {
            reasons.push(codes.invalidGenericProofTarget);
        }
    }
    return { valid: reasons.length === 0, reasons };
}
function isValidVerifiabilitySovereigntyCapabilityInput(value) {
    return validateVerifiabilitySovereigntyCapabilityInput(value).valid;
}
/**
 * Exact equality of two subject references, reusing SM-02's rules for the
 * external-reference half rather than restating them.
 *
 * Two references naming the same `SovereignAssetId` under different external
 * references are not equal, and that inequality is deliberate: a verifier that
 * said "close enough" would be attributing one artifact's verification to a
 * subject nobody asked about.
 */
function subjectsExactlyEqual(a, b) {
    if (a.sovereignAssetId !== b.sovereignAssetId)
        return false;
    if (a.externalReference === undefined || b.externalReference === undefined) {
        return a.externalReference === b.externalReference;
    }
    return (0, identity_1.sovereignExternalReferencesEqual)(a.externalReference, b.externalReference);
}
/**
 * The issuer id a manifest binding check resolves against.
 *
 * `SovereignRegistrant` is `string | CanonicalPrincipalRef`, and only the
 * identifier participates — `displayName`, `source` and `metadata` are never
 * read and never treated as identity. `verifySovereignManifest`'s own default
 * covers only the string case; rather than widening that primitive's
 * semantics, the capsule resolves the id itself and passes it as the expected
 * issuer, which the primitive accepts only because it equals the signed
 * registrant's id. Returning `undefined` is what keeps
 * an unresolvable registrant honestly `not_performed` instead of guessed.
 */
function registrantIssuerId(registrant) {
    if (isNonBlankString(registrant))
        return registrant;
    if (isPlainObject(registrant) && isNonBlankString(registrant.id))
        return registrant.id;
    return undefined;
}
function captureSignedArtifact(value, payloadKey, digestKey) {
    if (!isPlainObject(value)) {
        return { wrapper: null, payload: undefined, canonical: false };
    }
    const hasPayload = (0, snapshot_1.hasOwnOnce)(value, payloadKey);
    const rawPayload = hasPayload ? (0, snapshot_1.readOnce)(value, payloadKey) : undefined;
    const snapshot = hasPayload ? (0, snapshot_1.canonicalSnapshot)(rawPayload) : undefined;
    const payload = snapshot ? snapshot.value : attributionView(rawPayload);
    const digest = (0, snapshot_1.readOnce)(value, digestKey);
    const proof = (0, snapshot_1.readOnce)(value, 'proof');
    return {
        wrapper: Object.freeze({
            ...(hasPayload ? { [payloadKey]: payload } : {}),
            [digestKey]: typeof digest === 'string' ? digest : null,
            proof,
        }),
        payload,
        canonical: snapshot !== undefined,
    };
}
/** The individually canonicalizable fields of a payload that is not canonicalizable as a whole. */
function attributionView(value) {
    if (!isPlainObject(value)) {
        return undefined;
    }
    try {
        const view = {};
        for (const key of Object.keys(value)) {
            const field = (0, snapshot_1.canonicalSnapshot)((0, snapshot_1.readOnce)(value, key));
            if (field)
                view[key] = field.value;
        }
        return Object.freeze(view);
    }
    catch {
        return undefined;
    }
}
/**
 * The capability-specific input, captured once: the operation, the expected
 * issuer, and the target. `input` is what the input floor validates; for the
 * two signed operations `artifact` carries the same captured target.
 */
function captureVerifiabilityInput(value) {
    if (!isPlainObject(value)) {
        return { input: null };
    }
    const operation = (0, snapshot_1.readOnce)(value, 'operation');
    const fields = { operation };
    if ((0, snapshot_1.hasOwnOnce)(value, 'issuerId')) {
        fields.issuerId = (0, snapshot_1.readOnce)(value, 'issuerId');
    }
    let artifact;
    if (operation === 'verify-signed-manifest') {
        artifact = captureSignedArtifact((0, snapshot_1.readOnce)(value, 'signedManifest'), 'manifest', 'manifestDigest');
        fields.signedManifest = artifact.wrapper;
    }
    else if (operation === 'verify-signed-claim') {
        artifact = captureSignedArtifact((0, snapshot_1.readOnce)(value, 'signedClaim'), 'claim', 'digest');
        fields.signedClaim = artifact.wrapper;
    }
    else if (operation === 'verify-sovereign-proof') {
        // The generic operation attributes nothing, and the one primitive it
        // calls captures the proof and canonicalizes the payload once itself.
        if ((0, snapshot_1.hasOwnOnce)(value, 'payload')) {
            fields.payload = (0, snapshot_1.readOnce)(value, 'payload');
        }
        fields.proof = (0, snapshot_1.readOnce)(value, 'proof');
    }
    return { input: Object.freeze(fields), ...(artifact === undefined ? {} : { artifact }) };
}
/**
 * The invocation's subject, read once and rebuilt as frozen data. `null` when
 * one is present but is not a valid subject reference.
 */
function captureInvocationSubject(invocation) {
    const subject = (0, snapshot_1.readOnce)(invocation, 'subject');
    if (subject === undefined) {
        return undefined;
    }
    const snapshot = (0, snapshot_1.canonicalSnapshot)(subject);
    return snapshot && (0, identity_1.isValidSovereignSubjectRef)(snapshot.value) ? snapshot.value : null;
}
/**
 * The subject a claim verification is attributed to.
 *
 * On a match with the invocation's subject, that subject — external reference
 * included — is kept, as SM-03 precedence always kept it; it is returned
 * explicitly, from the capture it was compared in, so the common layer never
 * has to read the caller's invocation again to find it. Otherwise it is the
 * minimal subject a claim can attribute: its own `SovereignAssetId`, and only
 * when that id is genuinely valid. A claim whose subject is malformed yields no
 * subject at all — Protocol does not mint one to fill the gap.
 */
function claimSubjectAttribution(invocationSubject, claimSubject) {
    if (invocationSubject !== undefined) {
        return { subject: invocationSubject };
    }
    return (0, identity_1.isValidSovereignSubjectRef)({ sovereignAssetId: claimSubject })
        ? { subject: { sovereignAssetId: claimSubject } }
        : {};
}
/**
 * A one-shot guard around an injected resolver.
 *
 * Two jobs. First, it records that the resolver threw, so a *dependency fault*
 * can be reported as a failed capability execution rather than silently
 * becoming a negative cryptographic result — "the key service was unreachable"
 * and "the key did not bind" are different facts and must not be conflated.
 * Second, the raw exception is swallowed here and never re-surfaced: no
 * message, no stack, no provider credentials and no adapter internals reach the
 * result or the evidence.
 *
 * There is no retry, no backoff and no fallback resolver. One invocation makes
 * at most one resolution attempt per required binding; a hidden resilience
 * policy inside a verification capsule would be a network policy nobody
 * configured.
 */
function guardResolver(resolver) {
    let faulted = false;
    return {
        guarded: {
            async resolveVerificationKey(issuer, proofRef, context) {
                try {
                    return await resolver.resolveVerificationKey(issuer, proofRef, context);
                }
                catch {
                    faulted = true;
                    return undefined;
                }
            },
        },
        faulted: () => faulted,
    };
}
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
function createVerifiabilitySovereigntyCapabilityImplementation(options = {}) {
    const capability = (0, canonical_ref_1.requireSovereigntyCapabilityRef)('verifiability');
    const { verificationKeyResolver } = options;
    return Object.freeze({
        capability,
        async invoke(invocation) {
            const codes = exports.VERIFIABILITY_SOVEREIGNTY_CAPABILITY_REASON_CODES;
            // Everything below works from one capture of the caller's input and
            // subject (SOBE-SEC-01.2). The invocation is never read again, so the
            // subject and issuer attributed are the ones the verified bytes name.
            const captured = captureVerifiabilityInput((0, snapshot_1.readOnce)(invocation, 'input'));
            const validation = validateVerifiabilitySovereigntyCapabilityInput(captured.input);
            if (!validation.valid) {
                return { status: 'failed', reasonCodes: validation.reasons };
            }
            const invocationSubject = captureInvocationSubject(invocation);
            if (invocationSubject === null) {
                return { status: 'failed', reasonCodes: [codes.invalidInput] };
            }
            const input = captured.input;
            const artifact = captured.artifact;
            if (input.operation === 'verify-signed-manifest') {
                const signedManifest = artifact.wrapper;
                const manifest = artifact.payload;
                // The subject the *artifact* names. Read off the manifest, never
                // minted, and never fabricated when the manifest carries an invalid
                // one — an artifact whose identity cannot be read is reported without
                // a subject rather than with an invented `SovereignSubjectRef`.
                const artifactSubject = (0, identity_1.isValidSovereignSubjectRef)(manifest)
                    ? (0, identity_1.toSovereignSubjectRef)(manifest)
                    : undefined;
                // An explicitly supplied subject is an assertion about *which* artifact
                // this is. It is checked for exact equality and never reconciled:
                // verifying one artifact under evidence attributed to another subject
                // is precisely the confusion this rejects.
                if (invocationSubject !== undefined) {
                    if (artifactSubject === undefined || !subjectsExactlyEqual(invocationSubject, artifactSubject)) {
                        return { status: 'failed', reasonCodes: [codes.subjectMismatch] };
                    }
                }
                // A manifest that cannot be canonicalized cannot match any digest or
                // any signature, because neither can be recomputed over it. Both
                // cryptographic checks fail closed and the structural verdict still
                // comes from the real validator, so the report stays informative
                // rather than the canonicalizer throwing out of a verification call.
                if (!artifact.canonical) {
                    const verification = {
                        valid: false,
                        checks: {
                            manifestStructure: 'invalid',
                            manifestDigest: 'invalid',
                            signature: 'invalid',
                            contentDigest: 'not_performed',
                            issuerBinding: 'not_performed',
                        },
                        reasons: [codes.payloadNotCanonicalizable],
                    };
                    return {
                        status: 'succeeded',
                        output: Object.freeze({ operation: 'verify-signed-manifest', verification }),
                        ...(artifactSubject === undefined ? {} : { subject: artifactSubject }),
                    };
                }
                const guard = verificationKeyResolver === undefined ? undefined : guardResolver(verificationKeyResolver);
                const issuer = input.issuerId ?? registrantIssuerId((0, snapshot_1.readOnce)(manifest, 'registrant'));
                // Deliberately called WITHOUT `contentBytes`: the resulting
                // `contentDigest: 'not_performed'` is the mineral boundary, reported
                // rather than hidden. The verifier is handed the captured wrapper, so
                // it checks exactly the bytes the subject and issuer were read from.
                const verification = await (0, manifest_1.verifySovereignManifest)(signedManifest, {
                    ...(guard === undefined ? {} : { verificationKeyResolver: guard.guarded }),
                    ...(issuer === undefined ? {} : { issuer }),
                });
                if (guard?.faulted()) {
                    // The verification question could not be completed as asked. No
                    // partial cryptographic result is returned, because a report whose
                    // binding line silently means "the key service fell over" would be
                    // read as "the key did not bind".
                    return { status: 'failed', reasonCodes: [codes.keyResolutionFailed] };
                }
                // Note the status for an invalid signature: `succeeded`. The caller
                // asked whether the artifact verifies and Verifiability determined the
                // answer — "no" is a successful verification, exactly as an Integrity
                // digest mismatch has successfully checked. Returning a failure here
                // would make "the question could not be answered" indistinguishable
                // from "the answer was negative".
                return {
                    status: 'succeeded',
                    output: Object.freeze({ operation: 'verify-signed-manifest', verification }),
                    // Attribution survives a negative result: an artifact whose signature
                    // does not verify is still identifiably about subject X.
                    ...(artifactSubject === undefined ? {} : { subject: artifactSubject }),
                };
            }
            if (input.operation === 'verify-signed-claim') {
                const signedClaim = artifact.wrapper;
                const claimSubject = (0, snapshot_1.readOnce)(artifact.payload, 'subject');
                // A claim carries sovereign identity, not the subject's current
                // external reference. So the match rule is sovereign-identity equality
                // only, and on a match the invocation's own subject — external
                // reference included — is what the common layer keeps, by SM-03
                // precedence. Nothing fabricates an external reference from a claim.
                if (invocationSubject !== undefined) {
                    if (invocationSubject.sovereignAssetId !== claimSubject) {
                        return { status: 'failed', reasonCodes: [codes.subjectMismatch] };
                    }
                }
                // Like a manifest, a claim that cannot be canonicalized cannot match
                // any digest or signature, so both fail closed without calling the
                // verifier on a value that was never captured whole.
                if (!artifact.canonical) {
                    const verification = {
                        valid: false,
                        checks: {
                            claimStructure: 'invalid',
                            claimDigest: 'invalid',
                            signature: 'invalid',
                            issuerBinding: 'not_performed',
                        },
                        reasons: [codes.payloadNotCanonicalizable],
                    };
                    return {
                        status: 'succeeded',
                        output: Object.freeze({ operation: 'verify-signed-claim', verification }),
                        ...claimSubjectAttribution(invocationSubject, claimSubject),
                    };
                }
                const guard = verificationKeyResolver === undefined ? undefined : guardResolver(verificationKeyResolver);
                const verification = await (0, manifest_1.verifySignedSovereignClaim)(signedClaim, {
                    ...(guard === undefined ? {} : { verificationKeyResolver: guard.guarded }),
                    ...(input.issuerId === undefined ? {} : { issuer: input.issuerId }),
                });
                if (guard?.faulted()) {
                    return { status: 'failed', reasonCodes: [codes.keyResolutionFailed] };
                }
                return {
                    status: 'succeeded',
                    output: Object.freeze({ operation: 'verify-signed-claim', verification }),
                    ...claimSubjectAttribution(invocationSubject, claimSubject),
                };
            }
            const { payload, proof } = input;
            // A payload the canonical profile refuses cannot be the thing any
            // signature covers. Reported as an ordinary negative verification with a
            // stable code — never as a thrown error, a raw message or a stack.
            if (!isCanonicalizable(payload)) {
                return {
                    status: 'succeeded',
                    output: Object.freeze({
                        operation: 'verify-sovereign-proof',
                        verification: {
                            valid: false,
                            reasons: [codes.payloadNotCanonicalizable],
                        },
                    }),
                };
            }
            const valid = (0, manifest_1.verifySovereignSignature)(payload, proof);
            // No subject is inferred from an arbitrary payload — no
            // `payload.sovereignAssetId`, `payload.subject` or `payload.id` is read.
            // Guessing a schema is how a generic proof check quietly becomes an
            // identity claim. An explicitly supplied invocation subject survives as
            // attribution context through ordinary SM-03 precedence, and a
            // subjectless generic verification is an entirely valid outcome.
            return {
                status: 'succeeded',
                output: Object.freeze({
                    operation: 'verify-sovereign-proof',
                    verification: {
                        valid,
                        reasons: valid ? [] : [codes.sovereignProofInvalid],
                    },
                }),
            };
        },
    });
}
