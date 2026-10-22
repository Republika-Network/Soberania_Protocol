import { createHash, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import type { KeyObject } from 'node:crypto';

import { canonicalizeJSON, CANONICAL_JSON_PROFILE } from '../canonical';

/**
 * Ed25519 signing primitives native to `@aoc/protocol`.
 *
 * `@aoc/protocol` has zero runtime-package dependencies (see
 * `scripts/check-version-graph.mjs`'s `role === 'protocol'` rule and
 * `docs/release/RELEASE_CANDIDATE_READINESS.md`), so this module cannot
 * import `@aoc-runtime/crypto`'s `signPayload`/`verifyPayloadSignature`/
 * `GovernanceSignature` even though they are the existing production-real
 * Ed25519 implementation this slice was asked to "connect". Instead, this
 * module reimplements the *identical primitive pattern* natively:
 * Ed25519 sign/verify via Node's built-in `node:crypto` over the SHA-256
 * digest of the `aoc-canonical-json/1` serialization of the payload — the
 * exact same algorithm choices `crypto/engine.ts`'s `signPayload`/
 * `verifyPayloadSignature`/`stableHash` make, using the one authoritative
 * canonicalizer (now owned by `@aoc/protocol/canonical`, which
 * `crypto/canonicalize.ts` itself re-exports). No new cryptographic
 * algorithm is introduced. See
 * `docs/architecture/sovereign-asset-core.md` for the full rationale.
 */

export interface SovereignSigningKey {
  readonly keyId: string;
  readonly algorithm: 'ed25519';
  readonly publicKey: string;
}

export interface SovereignKeyPair {
  readonly signingKey: SovereignSigningKey;
  readonly privateKeyPem: string;
}

export interface SovereignProof {
  readonly algorithm: 'ed25519';
  readonly canonicalizationProfile: typeof CANONICAL_JSON_PROFILE;
  readonly keyId: string;
  readonly publicKey: string;
  readonly signature: string;
  readonly signedAt: string;
  readonly payloadHash: string;
}

function digestCanonicalPayload(payload: unknown): string {
  return digestCanonicalBytes(canonicalizeJSON(payload));
}

/** Lowercase hex SHA-256 of an already-canonical serialization. */
export function digestCanonicalBytes(canonical: string): string {
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * A proof's fields, each read exactly once from the caller's object and
 * validated to be a string. Verification works only from this frozen copy,
 * so a proof object whose getters or proxy traps answer differently on each
 * read cannot show one key to the signature check and another to issuer
 * binding.
 */
export interface SovereignProofSnapshot {
  readonly algorithm: string;
  readonly canonicalizationProfile: string;
  readonly keyId: string;
  readonly publicKey: string;
  readonly signature: string;
  readonly signedAt: string;
  readonly payloadHash: string;
}

const PROOF_FIELDS = ['algorithm', 'canonicalizationProfile', 'keyId', 'publicKey', 'signature', 'signedAt', 'payloadHash'] as const;

/**
 * Returns `undefined` (fail closed) when `value` is not an object, any field
 * is not a string, or reading it throws (e.g. a hostile proxy trap).
 */
export function snapshotSovereignProof(value: unknown): SovereignProofSnapshot | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const snapshot: Record<string, string> = {};
  try {
    for (const field of PROOF_FIELDS) {
      const fieldValue: unknown = (value as Record<string, unknown>)[field];
      if (typeof fieldValue !== 'string') {
        return undefined;
      }
      snapshot[field] = fieldValue;
    }
  } catch {
    return undefined;
  }
  return Object.freeze(snapshot) as unknown as SovereignProofSnapshot;
}

/**
 * The key identity convention: a `keyId` is the lowercase hex SHA-256 of the
 * exact SPKI PEM text of the public key. Because the digest commits to the
 * PEM text, and the PEM text determines the key, a `keyId` recomputed from a
 * proof's `publicKey` can only equal a registered `keyId` when the proof
 * carries that registered key. The text is hashed as-is (no re-encoding), so
 * every key id ever produced by `generateSovereignKeyPair` keeps its value.
 */
export function deriveSovereignKeyId(publicKeyPem: string): string {
  return createHash('sha256').update(publicKeyPem).digest('hex');
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
function parseEd25519PublicKey(publicKeyPem: string): KeyObject | undefined {
  try {
    const key = createPublicKey(publicKeyPem);
    if (key.type !== 'public' || key.asymmetricKeyType !== 'ed25519') {
      return undefined;
    }
    return key.export({ type: 'spki', format: 'pem' }) === publicKeyPem ? key : undefined;
  } catch {
    return undefined;
  }
}

/** Accepts only a public Ed25519 OKP JWK (no private `d`); anything else fails closed. */
function parseEd25519Jwk(jwk: unknown): KeyObject | undefined {
  if (typeof jwk !== 'object' || jwk === null || Array.isArray(jwk)) {
    return undefined;
  }
  try {
    const fields = jwk as Record<string, unknown>;
    const kty = fields.kty;
    const crv = fields.crv;
    const x = fields.x;
    if (kty !== 'OKP' || crv !== 'Ed25519' || typeof x !== 'string' || x === '' || 'd' in fields) {
      return undefined;
    }
    const key = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x }, format: 'jwk' });
    return key.type === 'public' && key.asymmetricKeyType === 'ed25519' ? key : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Compares the Ed25519 key in a proof's `publicKey` (SPKI PEM) with a JWK, by
 * canonical SPKI DER bytes. `'unsupported'` means the JWK is not a public
 * Ed25519 OKP key; `'mismatch'` covers a proof key that is not Ed25519 too.
 */
export function compareSovereignPublicKeyToJwk(publicKeyPem: string, jwk: unknown): 'match' | 'mismatch' | 'unsupported' {
  const jwkKey = parseEd25519Jwk(jwk);
  if (!jwkKey) {
    return 'unsupported';
  }
  const proofKey = parseEd25519PublicKey(publicKeyPem);
  if (!proofKey) {
    return 'mismatch';
  }
  const spki = (key: KeyObject) => key.export({ type: 'spki', format: 'der' });
  return spki(jwkKey).equals(spki(proofKey)) ? 'match' : 'mismatch';
}

/**
 * Generates a fresh Ed25519 key pair for signing sovereign manifests/claims.
 * Test/fixture callers should label their generated keys clearly; production
 * composition must source real keys from its own key-management
 * infrastructure rather than silently falling back to a generated or
 * hard-coded test key.
 */
export function generateSovereignKeyPair(): SovereignKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
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
export function signSovereignPayload(
  payload: unknown,
  privateKeyPem: string,
  signingKey: SovereignSigningKey,
  now: Date = new Date(),
): SovereignProof {
  const payloadHash = digestCanonicalPayload(payload);
  const signatureBytes = sign(null, Buffer.from(payloadHash, 'hex'), privateKeyPem);

  return {
    algorithm: 'ed25519',
    canonicalizationProfile: CANONICAL_JSON_PROFILE,
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
export function verifySovereignSignature(payload: unknown, proof: SovereignProof): boolean {
  const snapshot = snapshotSovereignProof(proof);
  if (!snapshot) {
    return false;
  }
  let canonical: string;
  try {
    canonical = canonicalizeJSON(payload);
  } catch {
    return false;
  }
  return verifySovereignSignatureOverCanonical(canonical, snapshot);
}

/**
 * Verifies `proof` over an already-canonical serialization. Callers that also
 * digest or inspect the payload use this with the same canonical string, so
 * every check examines the very bytes the signature covers.
 */
export function verifySovereignSignatureOverCanonical(canonical: string, proof: SovereignProofSnapshot): boolean {
  if (proof.algorithm !== 'ed25519') {
    return false;
  }
  if (proof.canonicalizationProfile !== CANONICAL_JSON_PROFILE) {
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
    return verify(null, Buffer.from(payloadHash, 'hex'), publicKey, Buffer.from(proof.signature, 'base64url'));
  } catch {
    return false;
  }
}
