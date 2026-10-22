import type { EncryptedObject, GovernanceSignature, RuntimeAuthorityIdentity, TrustedKeyResolver, TrustedSigningKey } from './types';
/**
 * The crypto engine's serialization step for hashing and signing. Delegates
 * entirely to the single authoritative AOC Canonical JSON implementation
 * (see ./canonicalize.ts) — this engine must never carry its own inline
 * canonicalization logic, since any divergence here is directly
 * security-relevant (it would let the same logical payload hash/sign
 * differently depending on call path).
 */
export declare const canonicalSerialize: (value: unknown) => string;
export declare const stableHash: (value: unknown) => string;
export declare const encryptObject: (key: Uint8Array, plaintext: Uint8Array) => EncryptedObject;
export declare const decryptObject: (key: Uint8Array, encrypted: EncryptedObject) => Uint8Array;
/**
 * The runtime authority key id convention: the stable hash of the runtime id,
 * the issuer id and the exact SPKI PEM text of the public key. A key id
 * recomputed from a key and its claimed owners can only equal a configured key
 * id when all three match.
 */
export declare const deriveRuntimeAuthorityKeyId: (runtimeId: string, issuerId: string, publicKey: string) => string;
/**
 * True only for the canonical SPKI PEM text Node itself exports for an Ed25519
 * public key, so one key has exactly one accepted text (and one key id).
 */
export declare const isCanonicalEd25519PublicKey: (publicKeyPem: unknown) => publicKeyPem is string;
/**
 * Throws unless `key` is a well-formed trusted key: every identity field is a
 * non-blank string, the public key is canonical Ed25519 SPKI PEM, and the key
 * id is derived from that key and its runtime and issuer.
 */
export declare const assertTrustedSigningKey: (key: TrustedSigningKey) => void;
/**
 * A fixed set of independently configured keys. Each key is validated with
 * `assertTrustedSigningKey`; a duplicate key id throws.
 */
export declare const createTrustedKeySet: (keys: readonly TrustedSigningKey[]) => TrustedKeyResolver;
export declare const createRuntimeAuthority: (runtimeId: string, issuerId: string, authorityId?: string) => {
    identity: RuntimeAuthorityIdentity;
    privateKey: string;
};
export declare const signPayload: (payload: unknown, privateKeyPem: string, signer: RuntimeAuthorityIdentity, provenance: GovernanceSignature["provenance"]) => GovernanceSignature;
/**
 * Reads a signature envelope's fields exactly once into a frozen plain copy,
 * so an object whose getters answer differently per read cannot show one key
 * id or signer to one check and another to the next. Returns `undefined`
 * (fail closed) for anything that is not a well-formed Ed25519 envelope or
 * that throws while being read.
 */
export declare const snapshotGovernanceSignature: (value: unknown) => GovernanceSignature | undefined;
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
export declare const verifyPayloadSignature: (payload: unknown, signatureEnvelope: GovernanceSignature, trustedKeys: TrustedKeyResolver) => boolean;
//# sourceMappingURL=engine.d.ts.map