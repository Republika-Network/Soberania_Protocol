import { createCipheriv, createDecipheriv, createHash, createPublicKey, generateKeyPairSync, randomBytes, sign, verify } from 'node:crypto';

import { canonicalizeJSON } from './canonicalize';
import type { EncryptedObject, GovernanceSignature, RuntimeAuthorityIdentity, TrustedKeyResolver, TrustedSigningKey } from './types';

const NONCE_LENGTH = 12;
const KEY_LENGTH = 32;

const toBase64Url = (data: Uint8Array): string =>
  Buffer.from(data).toString('base64url');

const fromBase64Url = (data: string): Uint8Array =>
  new Uint8Array(Buffer.from(data, 'base64url'));

const assertKeyLength = (key: Uint8Array): void => {
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
export const canonicalSerialize = (value: unknown): string => canonicalizeJSON(value);

export const stableHash = (value: unknown): string =>
  createHash('sha256').update(canonicalSerialize(value)).digest('base64url');

export const encryptObject = (
  key: Uint8Array,
  plaintext: Uint8Array
): EncryptedObject => {
  assertKeyLength(key);

  const nonce = randomBytes(NONCE_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);

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

export const decryptObject = (
  key: Uint8Array,
  encrypted: EncryptedObject
): Uint8Array => {
  assertKeyLength(key);

  if (encrypted.version !== 1 || encrypted.algorithm !== 'AES-256-GCM') {
    throw new Error('Unsupported encrypted object');
  }

  const nonce = fromBase64Url(encrypted.nonce);
  const ciphertext = fromBase64Url(encrypted.ciphertext);
  const authTag = fromBase64Url(encrypted.auth_tag);

  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(Buffer.from(authTag));

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return new Uint8Array(plaintext);
};

/**
 * The runtime authority key id convention: the stable hash of the runtime id,
 * the issuer id and the exact SPKI PEM text of the public key. A key id
 * recomputed from a key and its claimed owners can only equal a configured key
 * id when all three match.
 */
export const deriveRuntimeAuthorityKeyId = (runtimeId: string, issuerId: string, publicKey: string): string =>
  stableHash({ runtimeId, issuerId, publicKey });

/**
 * True only for the canonical SPKI PEM text Node itself exports for an Ed25519
 * public key, so one key has exactly one accepted text (and one key id).
 */
export const isCanonicalEd25519PublicKey = (publicKeyPem: unknown): publicKeyPem is string => {
  if (typeof publicKeyPem !== 'string') return false;
  try {
    const key = createPublicKey(publicKeyPem);
    return key.type === 'public'
      && key.asymmetricKeyType === 'ed25519'
      && key.export({ type: 'spki', format: 'pem' }) === publicKeyPem;
  } catch {
    return false;
  }
};

const isNonBlankString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';

/**
 * Throws unless `key` is a well-formed trusted key: every identity field is a
 * non-blank string, the public key is canonical Ed25519 SPKI PEM, and the key
 * id is derived from that key and its runtime and issuer.
 */
export const assertTrustedSigningKey = (key: TrustedSigningKey): void => {
  for (const field of ['keyId', 'authorityId', 'issuerId', 'runtimeId'] as const) {
    if (!isNonBlankString(key?.[field])) throw new Error(`Trusted signing key is missing ${field}.`);
  }
  if (!isCanonicalEd25519PublicKey(key.publicKey)) {
    throw new Error(`Trusted signing key ${key.keyId} is not a canonical Ed25519 SPKI public key.`);
  }
  if (deriveRuntimeAuthorityKeyId(key.runtimeId, key.issuerId, key.publicKey) !== key.keyId) {
    throw new Error(`Trusted signing key ${key.keyId} does not match its runtime, issuer and public key.`);
  }
};

/**
 * A fixed set of independently configured keys. Each key is validated with
 * `assertTrustedSigningKey`; a duplicate key id throws.
 */
export const createTrustedKeySet = (keys: readonly TrustedSigningKey[]): TrustedKeyResolver => {
  const byId = new Map<string, TrustedSigningKey>();
  for (const key of keys) {
    assertTrustedSigningKey(key);
    if (byId.has(key.keyId)) throw new Error(`Duplicate trusted signing key ${key.keyId}.`);
    const { keyId, publicKey, authorityId, issuerId, runtimeId } = key;
    byId.set(keyId, Object.freeze({ keyId, publicKey, authorityId, issuerId, runtimeId }));
  }
  return { resolveTrustedKey: (keyId) => byId.get(keyId) };
};

export const createRuntimeAuthority = (runtimeId: string, issuerId: string, authorityId = `authority:${runtimeId}`): {
  identity: RuntimeAuthorityIdentity;
  privateKey: string;
} => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pub = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const priv = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const keyId = deriveRuntimeAuthorityKeyId(runtimeId, issuerId, pub);

  return {
    identity: { authorityId, issuerId, runtimeId, algorithm: 'ed25519', publicKey: pub, keyId },
    privateKey: priv
  };
};

export const signPayload = (
  payload: unknown,
  privateKeyPem: string,
  signer: RuntimeAuthorityIdentity,
  provenance: GovernanceSignature['provenance']
): GovernanceSignature => {
  const payloadHash = stableHash(payload);
  const signatureBytes = sign(null, Buffer.from(payloadHash), privateKeyPem);
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

const SIGNER_FIELDS = ['keyId', 'publicKey', 'authorityId', 'issuerId', 'runtimeId'] as const;

/**
 * Reads a resolver's answer exactly once into a frozen plain copy, so the key
 * that is compared with the envelope is the key the signature is verified
 * with. `undefined` unless every field is a string.
 */
const snapshotTrustedSigningKey = (value: unknown): TrustedSigningKey | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;
  const fields = value as Record<string, unknown>;
  const copy: Record<string, string> = {};
  for (const field of SIGNER_FIELDS) {
    const fieldValue = fields[field];
    if (typeof fieldValue !== 'string') return undefined;
    copy[field] = fieldValue;
  }
  return Object.freeze(copy) as unknown as TrustedSigningKey;
};

/**
 * Reads a signature envelope's fields exactly once into a frozen plain copy,
 * so an object whose getters answer differently per read cannot show one key
 * id or signer to one check and another to the next. Returns `undefined`
 * (fail closed) for anything that is not a well-formed Ed25519 envelope or
 * that throws while being read.
 */
export const snapshotGovernanceSignature = (value: unknown): GovernanceSignature | undefined => {
  try {
    if (typeof value !== 'object' || value === null) return undefined;
    const envelope = value as Record<string, unknown>;
    const algorithm = envelope.algorithm;
    const keyId = envelope.keyId;
    const signature = envelope.signature;
    const signedAt = envelope.signedAt;
    const payloadHash = envelope.payloadHash;
    const signer = envelope.signer;
    const provenance = envelope.provenance;
    if (algorithm !== 'ed25519' || !isNonBlankString(keyId) || typeof signature !== 'string' || typeof signedAt !== 'string' || typeof payloadHash !== 'string') return undefined;
    if (typeof signer !== 'object' || signer === null) return undefined;
    const signerFields = signer as Record<string, unknown>;
    const copy: Record<string, string> = {};
    for (const field of [...SIGNER_FIELDS, 'algorithm'] as const) {
      const fieldValue = signerFields[field];
      if (typeof fieldValue !== 'string') return undefined;
      copy[field] = fieldValue;
    }
    if (copy.algorithm !== 'ed25519') return undefined;
    return Object.freeze({
      algorithm: 'ed25519',
      keyId,
      signer: Object.freeze(copy) as unknown as RuntimeAuthorityIdentity,
      signature,
      signedAt,
      payloadHash,
      provenance: provenance as GovernanceSignature['provenance'],
    });
  } catch {
    return undefined;
  }
};

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
export const verifyPayloadSignature = (
  payload: unknown,
  signatureEnvelope: GovernanceSignature,
  trustedKeys: TrustedKeyResolver
): boolean => {
  try {
    if (typeof trustedKeys?.resolveTrustedKey !== 'function') return false;
    const envelope = snapshotGovernanceSignature(signatureEnvelope);
    if (!envelope) return false;

    const trusted = snapshotTrustedSigningKey(trustedKeys.resolveTrustedKey(envelope.keyId));
    if (!trusted || trusted.keyId !== envelope.keyId) return false;
    for (const field of SIGNER_FIELDS) {
      if (envelope.signer[field] !== trusted[field]) return false;
    }

    const payloadHash = stableHash(payload);
    if (payloadHash !== envelope.payloadHash) return false;

    return verify(null, Buffer.from(payloadHash), trusted.publicKey, Buffer.from(envelope.signature, 'base64url'));
  } catch {
    return false;
  }
};
