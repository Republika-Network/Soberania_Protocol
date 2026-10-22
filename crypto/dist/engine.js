"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyPayloadSignature = exports.snapshotGovernanceSignature = exports.signPayload = exports.createRuntimeAuthority = exports.createTrustedKeySet = exports.assertTrustedSigningKey = exports.isCanonicalEd25519PublicKey = exports.deriveRuntimeAuthorityKeyId = exports.decryptObject = exports.encryptObject = exports.stableHash = exports.canonicalSerialize = void 0;
const node_crypto_1 = require("node:crypto");
const canonicalize_1 = require("./canonicalize");
const NONCE_LENGTH = 12;
const KEY_LENGTH = 32;
const toBase64Url = (data) => Buffer.from(data).toString('base64url');
const fromBase64Url = (data) => new Uint8Array(Buffer.from(data, 'base64url'));
const assertKeyLength = (key) => {
    if (key.length !== KEY_LENGTH) {
        throw new Error(`Invalid key length: expected ${KEY_LENGTH} bytes`);
    }
};
/**
 * The crypto engine's serialization step for hashing and signing. Delegates
 * entirely to the single authoritative AOC Canonical JSON implementation
 * (see ./canonicalize.ts) — this engine must never carry its own inline
 * canonicalization logic, since any divergence here is directly
 * security-relevant (it would let the same logical payload hash/sign
 * differently depending on call path).
 */
const canonicalSerialize = (value) => (0, canonicalize_1.canonicalizeJSON)(value);
exports.canonicalSerialize = canonicalSerialize;
const stableHash = (value) => (0, node_crypto_1.createHash)('sha256').update((0, exports.canonicalSerialize)(value)).digest('base64url');
exports.stableHash = stableHash;
const encryptObject = (key, plaintext) => {
    assertKeyLength(key);
    const nonce = (0, node_crypto_1.randomBytes)(NONCE_LENGTH);
    const cipher = (0, node_crypto_1.createCipheriv)('aes-256-gcm', key, nonce);
    const ciphertext = Buffer.concat([
        cipher.update(plaintext),
        cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return {
        version: 1,
        algorithm: 'AES-256-GCM',
        nonce: toBase64Url(nonce),
        ciphertext: toBase64Url(ciphertext),
        auth_tag: toBase64Url(authTag),
    };
};
exports.encryptObject = encryptObject;
const decryptObject = (key, encrypted) => {
    assertKeyLength(key);
    if (encrypted.version !== 1 || encrypted.algorithm !== 'AES-256-GCM') {
        throw new Error('Unsupported encrypted object');
    }
    const nonce = fromBase64Url(encrypted.nonce);
    const ciphertext = fromBase64Url(encrypted.ciphertext);
    const authTag = fromBase64Url(encrypted.auth_tag);
    const decipher = (0, node_crypto_1.createDecipheriv)('aes-256-gcm', key, nonce);
    decipher.setAuthTag(Buffer.from(authTag));
    const plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
    ]);
    return new Uint8Array(plaintext);
};
exports.decryptObject = decryptObject;
/**
 * The runtime authority key id convention: the stable hash of the runtime id,
 * the issuer id and the exact SPKI PEM text of the public key. A key id
 * recomputed from a key and its claimed owners can only equal a configured key
 * id when all three match.
 */
const deriveRuntimeAuthorityKeyId = (runtimeId, issuerId, publicKey) => (0, exports.stableHash)({ runtimeId, issuerId, publicKey });
exports.deriveRuntimeAuthorityKeyId = deriveRuntimeAuthorityKeyId;
/**
 * True only for the canonical SPKI PEM text Node itself exports for an Ed25519
 * public key, so one key has exactly one accepted text (and one key id).
 */
const isCanonicalEd25519PublicKey = (publicKeyPem) => {
    if (typeof publicKeyPem !== 'string')
        return false;
    try {
        const key = (0, node_crypto_1.createPublicKey)(publicKeyPem);
        return key.type === 'public'
            && key.asymmetricKeyType === 'ed25519'
            && key.export({ type: 'spki', format: 'pem' }) === publicKeyPem;
    }
    catch {
        return false;
    }
};
exports.isCanonicalEd25519PublicKey = isCanonicalEd25519PublicKey;
const isNonBlankString = (value) => typeof value === 'string' && value.trim() !== '';
/**
 * Throws unless `key` is a well-formed trusted key: every identity field is a
 * non-blank string, the public key is canonical Ed25519 SPKI PEM, and the key
 * id is derived from that key and its runtime and issuer.
 */
const assertTrustedSigningKey = (key) => {
    for (const field of ['keyId', 'authorityId', 'issuerId', 'runtimeId']) {
        if (!isNonBlankString(key?.[field]))
            throw new Error(`Trusted signing key is missing ${field}.`);
    }
    if (!(0, exports.isCanonicalEd25519PublicKey)(key.publicKey)) {
        throw new Error(`Trusted signing key ${key.keyId} is not a canonical Ed25519 SPKI public key.`);
    }
    if ((0, exports.deriveRuntimeAuthorityKeyId)(key.runtimeId, key.issuerId, key.publicKey) !== key.keyId) {
        throw new Error(`Trusted signing key ${key.keyId} does not match its runtime, issuer and public key.`);
    }
};
exports.assertTrustedSigningKey = assertTrustedSigningKey;
/**
 * A fixed set of independently configured keys. Each key is validated with
 * `assertTrustedSigningKey`; a duplicate key id throws.
 */
const createTrustedKeySet = (keys) => {
    const byId = new Map();
    for (const key of keys) {
        (0, exports.assertTrustedSigningKey)(key);
        if (byId.has(key.keyId))
            throw new Error(`Duplicate trusted signing key ${key.keyId}.`);
        const { keyId, publicKey, authorityId, issuerId, runtimeId } = key;
        byId.set(keyId, Object.freeze({ keyId, publicKey, authorityId, issuerId, runtimeId }));
    }
    return { resolveTrustedKey: (keyId) => byId.get(keyId) };
};
exports.createTrustedKeySet = createTrustedKeySet;
const createRuntimeAuthority = (runtimeId, issuerId, authorityId = `authority:${runtimeId}`) => {
    const { publicKey, privateKey } = (0, node_crypto_1.generateKeyPairSync)('ed25519');
    const pub = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const priv = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const keyId = (0, exports.deriveRuntimeAuthorityKeyId)(runtimeId, issuerId, pub);
    return {
        identity: { authorityId, issuerId, runtimeId, algorithm: 'ed25519', publicKey: pub, keyId },
        privateKey: priv
    };
};
exports.createRuntimeAuthority = createRuntimeAuthority;
const signPayload = (payload, privateKeyPem, signer, provenance) => {
    const payloadHash = (0, exports.stableHash)(payload);
    const signatureBytes = (0, node_crypto_1.sign)(null, Buffer.from(payloadHash), privateKeyPem);
    const signedAt = new Date().toISOString();
    return {
        algorithm: 'ed25519',
        keyId: signer.keyId,
        signer,
        signature: Buffer.from(signatureBytes).toString('base64url'),
        signedAt,
        payloadHash,
        provenance
    };
};
exports.signPayload = signPayload;
const SIGNER_FIELDS = ['keyId', 'publicKey', 'authorityId', 'issuerId', 'runtimeId'];
/**
 * Reads a resolver's answer exactly once into a frozen plain copy, so the key
 * that is compared with the envelope is the key the signature is verified
 * with. `undefined` unless every field is a string.
 */
const snapshotTrustedSigningKey = (value) => {
    if (typeof value !== 'object' || value === null)
        return undefined;
    const fields = value;
    const copy = {};
    for (const field of SIGNER_FIELDS) {
        const fieldValue = fields[field];
        if (typeof fieldValue !== 'string')
            return undefined;
        copy[field] = fieldValue;
    }
    return Object.freeze(copy);
};
/**
 * Reads a signature envelope's fields exactly once into a frozen plain copy,
 * so an object whose getters answer differently per read cannot show one key
 * id or signer to one check and another to the next. Returns `undefined`
 * (fail closed) for anything that is not a well-formed Ed25519 envelope or
 * that throws while being read.
 */
const snapshotGovernanceSignature = (value) => {
    try {
        if (typeof value !== 'object' || value === null)
            return undefined;
        const envelope = value;
        const algorithm = envelope.algorithm;
        const keyId = envelope.keyId;
        const signature = envelope.signature;
        const signedAt = envelope.signedAt;
        const payloadHash = envelope.payloadHash;
        const signer = envelope.signer;
        const provenance = envelope.provenance;
        if (algorithm !== 'ed25519' || !isNonBlankString(keyId) || typeof signature !== 'string' || typeof signedAt !== 'string' || typeof payloadHash !== 'string')
            return undefined;
        if (typeof signer !== 'object' || signer === null)
            return undefined;
        const signerFields = signer;
        const copy = {};
        for (const field of [...SIGNER_FIELDS, 'algorithm']) {
            const fieldValue = signerFields[field];
            if (typeof fieldValue !== 'string')
                return undefined;
            copy[field] = fieldValue;
        }
        if (copy.algorithm !== 'ed25519')
            return undefined;
        return Object.freeze({
            algorithm: 'ed25519',
            keyId,
            signer: Object.freeze(copy),
            signature,
            signedAt,
            payloadHash,
            provenance: provenance,
        });
    }
    catch {
        return undefined;
    }
};
exports.snapshotGovernanceSignature = snapshotGovernanceSignature;
/**
 * Verifies `signatureEnvelope` over `payload` against a key the caller trusts
 * independently of the envelope.
 *
 * The key is resolved from `trustedKeys` by the envelope's key id and the
 * signature is checked with that resolved key; the public key the envelope
 * carries is never used to verify. Every signer identity field the envelope
 * claims (key id, public key, authority, issuer, runtime) must equal the
 * trusted key's, so a valid signature cannot be relabelled with another
 * signer's identity. Fails closed (`false`) when no resolver is supplied, the
 * key id is unknown to it, any field differs, the payload cannot be hashed, the
 * hash differs, or the signature does not verify.
 *
 * A `true` result establishes that the configured key signed this payload. It
 * does not establish that the signer is authorized to do anything; that is the
 * caller's decision.
 */
const verifyPayloadSignature = (payload, signatureEnvelope, trustedKeys) => {
    try {
        if (typeof trustedKeys?.resolveTrustedKey !== 'function')
            return false;
        const envelope = (0, exports.snapshotGovernanceSignature)(signatureEnvelope);
        if (!envelope)
            return false;
        const trusted = snapshotTrustedSigningKey(trustedKeys.resolveTrustedKey(envelope.keyId));
        if (!trusted || trusted.keyId !== envelope.keyId)
            return false;
        for (const field of SIGNER_FIELDS) {
            if (envelope.signer[field] !== trusted[field])
                return false;
        }
        const payloadHash = (0, exports.stableHash)(payload);
        if (payloadHash !== envelope.payloadHash)
            return false;
        return (0, node_crypto_1.verify)(null, Buffer.from(payloadHash), trusted.publicKey, Buffer.from(envelope.signature, 'base64url'));
    }
    catch {
        return false;
    }
};
exports.verifyPayloadSignature = verifyPayloadSignature;
