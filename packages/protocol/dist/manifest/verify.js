"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifySovereignManifest = verifySovereignManifest;
exports.verifySignedSovereignClaim = verifySignedSovereignClaim;
const snapshot_1 = require("../canonical/snapshot");
const claim_enums_1 = require("../claims/claim-enums");
const content_identity_1 = require("../identity/content-identity");
const proof_1 = require("./proof");
const claims_1 = require("./claims");
const manifest_1 = require("./manifest");
/**
 * Decides whether a resolved key descriptor authorizes the key that actually
 * produced `proof`. Every rule is a necessary condition; the first one that
 * fails makes the binding `unverified` (fail closed). A `keyId` string match
 * alone never suffices: the proof's `keyId` must be derived from the very
 * `publicKey` the signature was verified with, so a signer cannot borrow a
 * registered issuer's `keyId` for their own key.
 *
 * Not evaluated (unchanged v1 limitations): `validFrom`/`validUntil` — the
 * only time available is the signer-asserted, unsigned `proof.signedAt` — and
 * the opaque `publicKeyRef`.
 */
function bindIssuerKey(proof, signature, issuer, descriptor) {
    const unverified = (reason) => ({
        outcome: 'unverified',
        reasons: reason ? ['ISSUER_BINDING_UNVERIFIED', reason] : ['ISSUER_BINDING_UNVERIFIED'],
    });
    // Descriptor fields are read once, like the proof's.
    const descriptorKeyId = (0, snapshot_1.readOnce)(descriptor, 'keyId');
    const descriptorIssuer = (0, snapshot_1.readOnce)(descriptor, 'issuer');
    const descriptorAlgorithm = (0, snapshot_1.readOnce)(descriptor, 'algorithm');
    const descriptorJwk = (0, snapshot_1.readOnce)(descriptor, 'publicKeyJwk');
    if (!isPlainObject(descriptor) || !isNonBlankString(descriptorKeyId)) {
        return unverified();
    }
    // A key that did not produce a valid signature is bound to nothing. The
    // signature was checked against this same snapshot, so `proof` below is
    // exactly the key material that signed.
    if (signature !== 'valid' || !proof) {
        return unverified('ISSUER_BINDING_SIGNATURE_INVALID');
    }
    if (descriptorIssuer !== issuer) {
        return unverified('ISSUER_BINDING_ISSUER_MISMATCH');
    }
    if (descriptorAlgorithm !== undefined && (typeof descriptorAlgorithm !== 'string' || descriptorAlgorithm.toLowerCase() !== 'ed25519')) {
        return unverified('ISSUER_BINDING_ALGORITHM_UNSUPPORTED');
    }
    if (proof.keyId !== (0, proof_1.deriveSovereignKeyId)(proof.publicKey)) {
        return unverified('ISSUER_BINDING_KEY_ID_NOT_DERIVED');
    }
    if (descriptorKeyId !== proof.keyId) {
        return unverified('ISSUER_BINDING_KEY_ID_MISMATCH');
    }
    if (descriptorJwk !== undefined) {
        const comparison = (0, proof_1.compareSovereignPublicKeyToJwk)(proof.publicKey, descriptorJwk);
        if (comparison === 'unsupported') {
            return unverified('ISSUER_BINDING_JWK_UNSUPPORTED');
        }
        if (comparison === 'mismatch') {
            return unverified('ISSUER_BINDING_KEY_MISMATCH');
        }
    }
    return { outcome: 'verified', reasons: [] };
}
/**
 * Independently verifies a `SignedSovereignManifest`. Never returns a bare
 * `true`/`false` — every attempted check is reported individually, and a
 * check that was never attempted is reported as `not_performed` rather
 * than folded silently into an optimistic overall result. `valid` reflects
 * whether every *attempted* check passed; checks that were not attempted
 * (e.g. no `contentBytes` supplied) do not by themselves make the result
 * invalid, but they are visible in `checks` so callers can decide whether
 * that is acceptable for their use case.
 */
async function verifySovereignManifest(signed, options = {}) {
    const reasons = [];
    // Snapshot every input once (SOBE-SEC-01.1). From here on, nothing reads
    // `signed` again: the canonical bytes that are digested and signed are the
    // same bytes every other check inspects, and the proof key that verified
    // the signature is the same key issuer binding evaluates.
    const manifestSnapshot = (0, snapshot_1.canonicalSnapshot)((0, snapshot_1.readOnce)(signed, 'manifest'));
    const claimedManifestDigest = (0, snapshot_1.readOnce)(signed, 'manifestDigest');
    const proof = (0, proof_1.snapshotSovereignProof)((0, snapshot_1.readOnce)(signed, 'proof'));
    const manifest = manifestSnapshot && isPlainObject(manifestSnapshot.value)
        ? manifestSnapshot.value
        : undefined;
    const structuralValidation = !manifestSnapshot
        ? { valid: false, reasons: ['MANIFEST_NOT_CANONICALIZABLE'] }
        : manifest
            ? (0, manifest_1.validateSovereignManifestV1)(manifest)
            : { valid: false, reasons: ['INVALID_MANIFEST_STRUCTURE'] };
    const manifestStructure = structuralValidation.valid ? 'valid' : 'invalid';
    if (!structuralValidation.valid) {
        reasons.push(...structuralValidation.reasons);
    }
    const manifestDigest = manifestSnapshot && (0, proof_1.digestCanonicalBytes)(manifestSnapshot.canonical) === claimedManifestDigest ? 'valid' : 'invalid';
    if (manifestDigest === 'invalid') {
        reasons.push('MANIFEST_DIGEST_MISMATCH');
    }
    const signatureValid = Boolean(manifestSnapshot && proof && (0, proof_1.verifySovereignSignatureOverCanonical)(manifestSnapshot.canonical, proof));
    const signature = signatureValid ? 'valid' : 'invalid';
    if (!signatureValid) {
        reasons.push('SIGNATURE_INVALID');
    }
    if (!proof || proof.payloadHash !== claimedManifestDigest) {
        reasons.push('PROOF_PAYLOAD_HASH_MISMATCH');
    }
    // Content verification is performed only when there is both something to
    // check (`contentBytes`) and a declared commitment to check it against
    // (`manifest.contentIdentity`). A manifest that declares no content
    // identity is not an integrity failure — it asserted no
    // content-integrity claim, so there is nothing to confirm or refute, and
    // fabricating a comparison target (hashing the external reference, the
    // locator, or the manifest) would manufacture a verification result
    // nobody ever signed. Both honest gaps are reported as `not_performed`,
    // never as `valid` and never as `invalid`.
    let contentDigest = 'not_performed';
    const declaredContentIdentity = manifest?.contentIdentity;
    if (options.contentBytes && declaredContentIdentity) {
        const contentCheck = (0, content_identity_1.verifyContentIdentity)(options.contentBytes, declaredContentIdentity);
        contentDigest = contentCheck.valid ? 'valid' : 'invalid';
        if (!contentCheck.valid && contentCheck.reason) {
            reasons.push(contentCheck.reason);
        }
    }
    else if (options.contentBytes && !declaredContentIdentity) {
        reasons.push('CONTENT_DIGEST_NOT_PERFORMED_NO_CONTENT_IDENTITY');
    }
    let issuerBinding = 'not_performed';
    if (options.verificationKeyResolver) {
        // The signed registrant is the only issuer a binding can be about. Without
        // an expectation only a string registrant is resolved (unchanged default).
        const registrant = manifest ? (0, snapshot_1.readOnce)(manifest, 'registrant') : undefined;
        const selection = selectBindingIssuer(canonicalIssuerId(registrant), typeof registrant === 'string' ? registrant : undefined, options.issuer);
        if (selection.kind === 'mismatch') {
            issuerBinding = 'unverified';
            reasons.push('ISSUER_BINDING_UNVERIFIED', 'ISSUER_BINDING_ISSUER_MISMATCH');
        }
        else if (selection.kind === 'none') {
            issuerBinding = 'not_performed';
            reasons.push('ISSUER_BINDING_NOT_PERFORMED_NO_ISSUER');
        }
        else {
            const descriptor = await options.verificationKeyResolver.resolveVerificationKey(selection.issuer);
            const binding = bindIssuerKey(proof, signature, selection.issuer, descriptor);
            issuerBinding = binding.outcome;
            reasons.push(...binding.reasons);
        }
    }
    const valid = manifestStructure === 'valid' &&
        manifestDigest === 'valid' &&
        signature === 'valid' &&
        contentDigest !== 'invalid' &&
        issuerBinding !== 'unverified';
    return {
        valid,
        checks: { manifestStructure, manifestDigest, signature, contentDigest, issuerBinding },
        reasons,
    };
}
function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isNonBlankString(value) {
    return typeof value === 'string' && value.trim() !== '';
}
/**
 * The issuer id a binding check resolves against.
 *
 * `CanonicalIssuer` is `string | CanonicalPrincipalRef`, and only the
 * identifier participates: `displayName`, `source` and `metadata` are never
 * read, never resolved and never treated as identity. Returning `undefined`
 * for anything else is what makes a binding honestly `not_performed` instead
 * of guessed.
 */
function canonicalIssuerId(issuer) {
    if (isNonBlankString(issuer))
        return issuer;
    if (isPlainObject(issuer) && isNonBlankString(issuer.id))
        return issuer.id;
    return undefined;
}
/**
 * Chooses the issuer a binding check resolves (SOBE-SEC-01, N1). The issuer is
 * always the one the signed artifact names: a caller's `expected` issuer can
 * only narrow that, never replace it. An expectation that is not a non-blank
 * string, or that differs from the signed issuer — including when the
 * artifact names none — fails closed as a mismatch, without consulting the
 * resolver. Without an expectation, `defaultIssuer` is resolved if present.
 */
function selectBindingIssuer(signedIssuer, defaultIssuer, expected) {
    if (expected === undefined || expected === null) {
        return defaultIssuer ? { kind: 'resolve', issuer: defaultIssuer } : { kind: 'none' };
    }
    if (!isNonBlankString(expected) || signedIssuer === undefined || expected !== signedIssuer) {
        return { kind: 'mismatch' };
    }
    return { kind: 'resolve', issuer: signedIssuer };
}
function validateVerifiableSovereignClaim(claim) {
    if (!isPlainObject(claim)) {
        return { valid: false, reasons: ['INVALID_CLAIM_STRUCTURE'] };
    }
    switch (claim.type) {
        case claim_enums_1.ClaimType.Origin:
            return (0, claims_1.validateOriginClaim)(claim);
        case claim_enums_1.ClaimType.Authorship:
            return (0, claims_1.validateAuthorityClaim)(claim);
        case claim_enums_1.ClaimType.Derivation:
            return (0, claims_1.validateDerivationClaim)(claim);
        default:
            // Structurally inspectable, but not a claim type this version can
            // structurally verify. Reported honestly as an invalid target rather
            // than waved through on the strength of a passing signature.
            return { valid: false, reasons: ['UNSUPPORTED_SOVEREIGN_CLAIM_TYPE'] };
    }
}
/**
 * Independently verifies a `SignedClaim`, reporting each dimension separately.
 *
 * Additive companion to `verifySovereignManifest`, with the same shape and the
 * same honesty rules. The claim digest and Ed25519 signature are checked with
 * exactly `verifySignedClaim`'s rules and reason codes
 * (`CLAIM_DIGEST_MISMATCH`, `CLAIM_SIGNATURE_INVALID`), mapped onto explicit
 * check outcomes, but over one snapshot of the input shared with the
 * structure and issuer checks (SOBE-SEC-01.1). What this adds on top is the two
 * things a bare digest/signature check cannot answer on its own: whether the
 * signed artifact is a structurally valid canonical sovereign claim, and
 * whether the signing key binds to the asserted issuer.
 *
 * What a passing result establishes, at most: the holder of the private key
 * matching `proof.publicKey` signed this canonical claim, and — when
 * `issuerBinding` is `verified` — the supplied resolver binds that key id to
 * the asserted issuer. It does not establish that the assertion is
 * historically true, that the issuer had authority to make it, that ownership
 * or a licence exists, that the key has not been revoked, or that the claim is
 * uncontested. A cryptographically valid claim can be `Contested`, and this
 * function neither reads nor writes claim standing.
 */
async function verifySignedSovereignClaim(input, options = {}) {
    const reasons = [];
    // Snapshot every input once (SOBE-SEC-01.1); see `verifySovereignManifest`.
    const rawClaim = (0, snapshot_1.readOnce)(input, 'claim');
    const claimSnapshot = (0, snapshot_1.canonicalSnapshot)(rawClaim);
    const claimedDigest = (0, snapshot_1.readOnce)(input, 'digest');
    const proof = (0, proof_1.snapshotSovereignProof)((0, snapshot_1.readOnce)(input, 'proof'));
    // A claim that cannot be canonicalized fails both cryptographic checks
    // below whatever its structure, so only its reason codes come from the
    // caller's object; every check that can pass reads the snapshot.
    const structuralValidation = validateVerifiableSovereignClaim(claimSnapshot ? claimSnapshot.value : rawClaim);
    const claimStructure = structuralValidation.valid ? 'valid' : 'invalid';
    if (!structuralValidation.valid) {
        reasons.push(...structuralValidation.reasons);
    }
    let claimDigest;
    let signature;
    if (claimSnapshot) {
        // `verifySignedClaim` stays the owning primitive for the digest and the
        // signature; it is handed the snapshot, never the caller's object. The
        // snapshot is plain frozen data rebuilt from its canonical bytes, so
        // canonicalizing it again reproduces exactly those bytes.
        const signed = { claim: claimSnapshot.value, digest: claimedDigest, proof };
        const cryptographic = (0, claims_1.verifySignedClaim)(signed);
        reasons.push(...cryptographic.reasons);
        claimDigest = cryptographic.reasons.includes('CLAIM_DIGEST_MISMATCH') ? 'invalid' : 'valid';
        signature = cryptographic.reasons.includes('CLAIM_SIGNATURE_INVALID') ? 'invalid' : 'valid';
    }
    else {
        // A claim that cannot be canonicalized cannot match any digest or any
        // signature, because there is no canonical serialization to recompute
        // either over. Failing both checks closed is the truthful answer; the
        // alternative — letting the canonicalizer throw out of a verification
        // call — would turn "this artifact does not verify" into a crash.
        claimDigest = 'invalid';
        signature = 'invalid';
        reasons.push('CLAIM_NOT_CANONICALIZABLE');
    }
    let issuerBinding = 'not_performed';
    if (options.verificationKeyResolver) {
        const signedIssuer = canonicalIssuerId((0, snapshot_1.readOnce)(claimSnapshot ? claimSnapshot.value : rawClaim, 'issuer'));
        const selection = selectBindingIssuer(signedIssuer, signedIssuer, options.issuer);
        if (selection.kind === 'mismatch') {
            issuerBinding = 'unverified';
            reasons.push('ISSUER_BINDING_UNVERIFIED', 'ISSUER_BINDING_ISSUER_MISMATCH');
        }
        else if (selection.kind === 'none') {
            issuerBinding = 'not_performed';
            reasons.push('ISSUER_BINDING_NOT_PERFORMED_NO_ISSUER');
        }
        else {
            const descriptor = await options.verificationKeyResolver.resolveVerificationKey(selection.issuer);
            const binding = bindIssuerKey(proof, signature, selection.issuer, descriptor);
            issuerBinding = binding.outcome;
            reasons.push(...binding.reasons);
        }
    }
    const valid = claimStructure === 'valid'
        && claimDigest === 'valid'
        && signature === 'valid'
        && issuerBinding !== 'unverified';
    return { valid, checks: { claimStructure, claimDigest, signature, issuerBinding }, reasons };
}
