"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.digestCanonicalBytes = digestCanonicalBytes;
exports.snapshotSovereignProof = snapshotSovereignProof;
exports.deriveSovereignKeyId = deriveSovereignKeyId;
exports.compareSovereignPublicKeyToJwk = compareSovereignPublicKeyToJwk;
exports.generateSovereignKeyPair = generateSovereignKeyPair;
exports.signSovereignPayload = signSovereignPayload;
exports.verifySovereignSignature = verifySovereignSignature;
exports.verifySovereignSignatureOverCanonical = verifySovereignSignatureOverCanonical;
const node_crypto_1 = require("node:crypto");
const canonical_1 = require("../canonical");
function digestCanonicalPayload(payload) {
    return digestCanonicalBytes((0, canonical_1.canonicalizeJSON)(payload));
}
/** Lowercase hex SHA-256 of an already-canonical serialization. */
function digestCanonicalBytes(canonical) {
    return (0, node_crypto_1.createHash)('sha256').update(canonical).digest('hex');
}
const PROOF_FIELDS = ['algorithm', 'canonicalizationProfile', 'keyId', 'publicKey', 'signature', 'signedAt', 'payloadHash'];
/**
 * Returns `undefined` (fail closed) when `value` is not an object, any field
 * is not a string, or reading it throws (e.g. a hostile proxy trap).
 */
function snapshotSovereignProof(value) {
    if (typeof value !== 'object' || value === null) {
        return undefined;
    }
    const snapshot = {};
    try {
        for (const field of PROOF_FIELDS) {
            const fieldValue = value[field];
            if (typeof fieldValue !== 'string') {
                return undefined;
            }
            snapshot[field] = fieldValue;
        }
    }
    catch {
        return undefined;
    }
    return Object.freeze(snapshot);
}
/**
 * The key identity convention: a `keyId` is the lowercase hex SHA-256 of the
 * exact SPKI PEM text of the public key. Because the digest commits to the
 * PEM text, and the PEM text determines the key, a `keyId` recomputed from a
 * proof's `publicKey` can only equal a registered `keyId` when the proof
 * carries that registered key. The text is hashed as-is (no re-encoding), so
 * every key id ever produced by `generateSovereignKeyPair` keeps its value.
 */
function deriveSovereignKeyId(publicKeyPem) {
    return (0, node_crypto_1.createHash)('sha256').update(publicKeyPem).digest('hex');
}
/**
 * Parses `publicKeyPem` as an Ed25519 public key, accepting only the
 * canonical encoding: the text must be byte-for-byte the SPKI PEM that Node
 * itself exports for the parsed key — exactly what `generateSovereignKeyPair`
 * emits. That rejects other key types, private-key PEM, trailing text, extra
 * PEM blocks, and re-wrapped or CRLF-converted PEM, so one key has exactly one
 * accepted text and therefore exactly one key id. Returns `undefined` (fail
 * closed) for anything else.
 */
function parseEd25519PublicKey(publicKeyPem) {
    try {
        const key = (0, node_crypto_1.createPublicKey)(publicKeyPem);
        if (key.type !== 'public' || key.asymmetricKeyType !== 'ed25519') {
            return undefined;
        }
        return key.export({ type: 'spki', format: 'pem' }) === publicKeyPem ? key : undefined;
    }
    catch {
        return undefined;
    }
}
/** Accepts only a public Ed25519 OKP JWK (no private `d`); anything else fails closed. */
function parseEd25519Jwk(jwk) {
    if (typeof jwk !== 'object' || jwk === null || Array.isArray(jwk)) {
        return undefined;
    }
    try {
        const fields = jwk;
        const kty = fields.kty;
        const crv = fields.crv;
        const x = fields.x;
        if (kty !== 'OKP' || crv !== 'Ed25519' || typeof x !== 'string' || x === '' || 'd' in fields) {
            return undefined;
        }
        const key = (0, node_crypto_1.createPublicKey)({ key: { kty: 'OKP', crv: 'Ed25519', x }, format: 'jwk' });
        return key.type === 'public' && key.asymmetricKeyType === 'ed25519' ? key : undefined;
    }
    catch {
        return undefined;
    }
}
/**
 * Compares the Ed25519 key in a proof's `publicKey` (SPKI PEM) with a JWK, by
 * canonical SPKI DER bytes. `'unsupported'` means the JWK is not a public
 * Ed25519 OKP key; `'mismatch'` covers a proof key that is not Ed25519 too.
 */
function compareSovereignPublicKeyToJwk(publicKeyPem, jwk) {
    const jwkKey = parseEd25519Jwk(jwk);
    if (!jwkKey) {
        return 'unsupported';
    }
    const proofKey = parseEd25519PublicKey(publicKeyPem);
    if (!proofKey) {
        return 'mismatch';
    }
    const spki = (key) => key.export({ type: 'spki', format: 'der' });
    return spki(jwkKey).equals(spki(proofKey)) ? 'match' : 'mismatch';
}
/**
 * Generates a fresh Ed25519 key pair for signing sovereign manifests/claims.
 * Test/fixture callers should label their generated keys clearly; production
 * composition must source real keys from its own key-management
 * infrastructure rather than silently falling back to a generated or
 * hard-coded test key.
 */
function generateSovereignKeyPair() {
    const { publicKey, privateKey } = (0, node_crypto_1.generateKeyPairSync)('ed25519');
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const keyId = deriveSovereignKeyId(publicKeyPem);
    return {
        signingKey: { keyId, algorithm: 'ed25519', publicKey: publicKeyPem },
        privateKeyPem,
    };
}
/**
 * Signs `payload` (any canonicalizable value) and returns a portable proof.
 * The signature covers the SHA-256 digest of the payload's
 * `aoc-canonical-json/1` serialization — any later mutation of the payload,
 * however small, changes `payloadHash` and invalidates the signature.
 */
function signSovereignPayload(payload, privateKeyPem, signingKey, now = new Date()) {
    const payloadHash = digestCanonicalPayload(payload);
    const signatureBytes = (0, node_crypto_1.sign)(null, Buffer.from(payloadHash, 'hex'), privateKeyPem);
    return {
        algorithm: 'ed25519',
        canonicalizationProfile: canonical_1.CANONICAL_JSON_PROFILE,
        keyId: signingKey.keyId,
        publicKey: signingKey.publicKey,
        signature: signatureBytes.toString('base64url'),
        signedAt: now.toISOString(),
        payloadHash,
    };
}
/**
 * Recomputes the payload digest and verifies the Ed25519 signature over it.
 * Returns `false` (fail closed) for any unsupported algorithm/profile,
 * digest mismatch, or cryptographic verification failure — including
 * malformed signature/key material that throws inside Node's `verify()`,
 * and any `publicKey` that is not an Ed25519 SPKI public key.
 *
 * A `true` result proves only that the holder of `proof.publicKey` signed the
 * payload. It says nothing about who that holder is; issuer binding is a
 * separate check (see `verifySovereignManifest`).
 */
function verifySovereignSignature(payload, proof) {
    const snapshot = snapshotSovereignProof(proof);
    if (!snapshot) {
        return false;
    }
    let canonical;
    try {
        canonical = (0, canonical_1.canonicalizeJSON)(payload);
    }
    catch {
        return false;
    }
    return verifySovereignSignatureOverCanonical(canonical, snapshot);
}
/**
 * Verifies `proof` over an already-canonical serialization. Callers that also
 * digest or inspect the payload use this with the same canonical string, so
 * every check examines the very bytes the signature covers.
 */
function verifySovereignSignatureOverCanonical(canonical, proof) {
    if (proof.algorithm !== 'ed25519') {
        return false;
    }
    if (proof.canonicalizationProfile !== canonical_1.CANONICAL_JSON_PROFILE) {
        return false;
    }
    const publicKey = parseEd25519PublicKey(proof.publicKey);
    if (!publicKey) {
        return false;
    }
    const payloadHash = digestCanonicalBytes(canonical);
    if (payloadHash !== proof.payloadHash) {
        return false;
    }
    try {
        return (0, node_crypto_1.verify)(null, Buffer.from(payloadHash, 'hex'), publicKey, Buffer.from(proof.signature, 'base64url'));
    }
    catch {
        return false;
    }
}
