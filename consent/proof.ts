import crypto, { type KeyObject } from 'crypto';
import { canonicalizeJSON } from '../canonicalize';
import { sha256Hex } from '../storage/hash';

/**
 * Subject consent proofs (consent-object-spec.md §10.2).
 *
 * A consent says something on behalf of its subject, so it authorizes nothing
 * unless the subject signed it. This module is the single signing and
 * verification contract for every consent statement in this repository:
 *
 * - The subject is a `did:key` Ed25519 identifier. The verification key is
 *   always derived from the subject DID itself; a proof never supplies its own
 *   key, so a proof cannot name a key that the subject does not control.
 * - The proof is detached: it travels next to the consent (`subject_proof`) and
 *   is excluded from the consent's canonical payload, so `consent_hash` and
 *   every capability that references it stay stable.
 * - The signature covers a domain-separated, versioned statement holding the
 *   full canonical consent content and its hash. The verifier recomputes both
 *   from the consent it is given and never trusts the hash or content claimed
 *   by the proof.
 *
 * A consent without a valid proof is legacy migration data: it may be parsed
 * and displayed, but it must never authorize, mint, consume or revoke.
 */

export const SUBJECT_CONSENT_PROOF_TYPE = 'AocSubjectConsentProof';
export const SUBJECT_CONSENT_PROOF_VERSION = 1;
export const SUBJECT_CONSENT_PROOF_ALG = 'Ed25519';
const SIGNING_DOMAIN = 'aoc:subject-consent-proof';

export type SubjectConsentStatement = 'consent-object/v1' | 'consent-record/v1' | 'pack-manifest/v1';

export type SubjectConsentProofV1 = {
  type: typeof SUBJECT_CONSENT_PROOF_TYPE;
  version: typeof SUBJECT_CONSENT_PROOF_VERSION;
  alg: typeof SUBJECT_CONSENT_PROOF_ALG;
  statement: SubjectConsentStatement;
  /** `${subjectDid}#${multibase key}`: the subject's own did:key verification method. */
  verification_method: string;
  /** SHA-256 (hex) of the canonical consent content. */
  content_hash: string;
  /** Ed25519 signature (base64url, unpadded) over the signing input. */
  signature: string;
};

export type SubjectConsentProofFailureCode =
  | 'CONSENT_UNSIGNED'
  | 'CONSENT_PROOF_MALFORMED'
  | 'CONSENT_SUBJECT_UNRESOLVABLE'
  | 'CONSENT_PROOF_MISMATCH'
  | 'CONSENT_SIGNATURE_INVALID';

export type SubjectConsentProofResult =
  | { valid: true }
  | { valid: false; code: SubjectConsentProofFailureCode; reason: string };

/** Signs on behalf of one did:key subject. The private key never has to leave the signer. */
export type ConsentSubjectSigner = {
  readonly did: string;
  sign(message: Uint8Array): Uint8Array;
};

export class SubjectConsentProofError extends Error {
  readonly code: SubjectConsentProofFailureCode;

  constructor(code: SubjectConsentProofFailureCode, reason: string) {
    super(reason);
    this.name = 'SubjectConsentProofError';
    this.code = code;
  }
}

// --- did:key (Ed25519) ---

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const ED25519_MULTICODEC = [0xed, 0x01];
const DID_KEY_PREFIX = 'did:key:z';
const MAX_DID_KEY_LENGTH = 128;

function base58Encode(bytes: Uint8Array): string {
  let value = 0n;
  for (const byte of bytes) value = value * 256n + BigInt(byte);
  let out = '';
  while (value > 0n) {
    out = BASE58_ALPHABET[Number(value % 58n)] + out;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    out = '1' + out;
  }
  return out;
}

function base58Decode(text: string): Uint8Array | null {
  let value = 0n;
  for (const char of text) {
    const digit = BASE58_ALPHABET.indexOf(char);
    if (digit < 0) return null;
    value = value * 58n + BigInt(digit);
  }
  const bytes: number[] = [];
  while (value > 0n) {
    bytes.unshift(Number(value % 256n));
    value /= 256n;
  }
  for (const char of text) {
    if (char !== '1') break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

function rawEd25519PublicKey(key: KeyObject): Uint8Array {
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new Error('did:key subjects must use Ed25519 keys.');
  }
  const jwk = key.export({ format: 'jwk' });
  return Uint8Array.from(Buffer.from(String(jwk.x), 'base64url'));
}

/** did:key identifier for an Ed25519 public (or private) key. */
export function didKeyFromEd25519Key(key: KeyObject): string {
  const publicKey = key.type === 'private' ? crypto.createPublicKey(key) : key;
  const raw = rawEd25519PublicKey(publicKey);
  return DID_KEY_PREFIX + base58Encode(Uint8Array.from([...ED25519_MULTICODEC, ...raw]));
}

/**
 * Resolves the Ed25519 public key a did:key identifier encodes. Returns null for
 * anything that is not a canonical Ed25519 did:key: other DID methods, other key
 * types, wrong lengths and non-canonical encodings are all unresolvable.
 */
export function resolveDidKeyEd25519(did: unknown): KeyObject | null {
  if (typeof did !== 'string' || did.length > MAX_DID_KEY_LENGTH || !did.startsWith(DID_KEY_PREFIX)) {
    return null;
  }
  const encoded = did.slice(DID_KEY_PREFIX.length);
  const decoded = base58Decode(encoded);
  if (
    decoded === null ||
    decoded.length !== 34 ||
    decoded[0] !== ED25519_MULTICODEC[0] ||
    decoded[1] !== ED25519_MULTICODEC[1] ||
    base58Encode(decoded) !== encoded
  ) {
    return null;
  }
  // Bytes that are not a valid Ed25519 point leave the subject unresolvable, and
  // every verifier rejects a consent whose subject cannot be resolved (fail closed).
  let publicKey: KeyObject | null = null;
  try {
    publicKey = crypto.createPublicKey({
      key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(decoded.subarray(2)).toString('base64url') },
      format: 'jwk',
    });
  } catch {
    publicKey = null;
  }
  return publicKey;
}

function verificationMethodFor(did: string): string {
  return `${did}#${did.slice('did:key:'.length)}`;
}

/** A signer for the did:key subject derived from an Ed25519 private key. */
export function createDidKeySigner(privateKey: KeyObject): ConsentSubjectSigner {
  if (privateKey.type !== 'private' || privateKey.asymmetricKeyType !== 'ed25519') {
    throw new Error('A did:key consent signer requires an Ed25519 private key.');
  }
  const did = didKeyFromEd25519Key(privateKey);
  return {
    did,
    sign: (message) => Uint8Array.from(crypto.sign(null, Buffer.from(message), privateKey)),
  };
}

// --- Shared signing contract ---

function signingInput(
  statement: SubjectConsentStatement,
  verificationMethod: string,
  canonicalContent: string,
  contentHash: string
): Uint8Array {
  return new TextEncoder().encode(
    canonicalizeJSON({
      alg: SUBJECT_CONSENT_PROOF_ALG,
      content: JSON.parse(canonicalContent),
      content_hash: contentHash,
      domain: SIGNING_DOMAIN,
      statement,
      type: SUBJECT_CONSENT_PROOF_TYPE,
      verification_method: verificationMethod,
      version: SUBJECT_CONSENT_PROOF_VERSION,
    })
  );
}

/**
 * Creates a subject proof over canonical consent content. The signer must be the
 * subject: a proof made by any other key is refused here and would fail
 * verification anyway.
 */
export function createSubjectConsentProof(
  statement: SubjectConsentStatement,
  subject: string,
  canonicalContent: string,
  signer: ConsentSubjectSigner
): SubjectConsentProofV1 {
  if (resolveDidKeyEd25519(subject) === null) {
    throw new SubjectConsentProofError(
      'CONSENT_SUBJECT_UNRESOLVABLE',
      'Consent subject must be an Ed25519 did:key identifier to be signed.'
    );
  }
  if (signer.did !== subject) {
    throw new SubjectConsentProofError(
      'CONSENT_PROOF_MISMATCH',
      'Only the consent subject can sign its consent.'
    );
  }
  const contentHash = sha256Hex(new TextEncoder().encode(canonicalContent));
  const verificationMethod = verificationMethodFor(subject);
  const signature = signer.sign(signingInput(statement, verificationMethod, canonicalContent, contentHash));
  return {
    type: SUBJECT_CONSENT_PROOF_TYPE,
    version: SUBJECT_CONSENT_PROOF_VERSION,
    alg: SUBJECT_CONSENT_PROOF_ALG,
    statement,
    verification_method: verificationMethod,
    content_hash: contentHash,
    signature: Buffer.from(signature).toString('base64url'),
  };
}

function fail(code: SubjectConsentProofFailureCode, reason: string): SubjectConsentProofResult {
  return { valid: false, code, reason };
}

/** Reads each proof field exactly once, so the checked values are the verified ones. */
function snapshotProof(proof: unknown): SubjectConsentProofV1 | null {
  if (typeof proof !== 'object' || proof === null || Array.isArray(proof)) return null;
  const record = proof as Record<string, unknown>;
  const copy = {
    type: record.type,
    version: record.version,
    alg: record.alg,
    statement: record.statement,
    verification_method: record.verification_method,
    content_hash: record.content_hash,
    signature: record.signature,
  };
  if (
    copy.type !== SUBJECT_CONSENT_PROOF_TYPE ||
    copy.version !== SUBJECT_CONSENT_PROOF_VERSION ||
    copy.alg !== SUBJECT_CONSENT_PROOF_ALG ||
    (copy.statement !== 'consent-object/v1' && copy.statement !== 'consent-record/v1' && copy.statement !== 'pack-manifest/v1') ||
    typeof copy.verification_method !== 'string' ||
    typeof copy.content_hash !== 'string' ||
    typeof copy.signature !== 'string'
  ) {
    return null;
  }
  return copy as SubjectConsentProofV1;
}

/**
 * Verifies a subject proof over canonical consent content. `subject` and
 * `canonicalContent` must come from the consent being authorized, never from
 * the proof.
 */
export function verifySubjectConsentProof(
  statement: SubjectConsentStatement,
  subject: unknown,
  canonicalContent: string,
  proofInput: unknown
): SubjectConsentProofResult {
  if (proofInput === undefined || proofInput === null) {
    return fail('CONSENT_UNSIGNED', 'Consent carries no subject proof; unsigned consent authorizes nothing.');
  }
  const proof = snapshotProof(proofInput);
  if (proof === null) {
    return fail('CONSENT_PROOF_MALFORMED', 'Consent subject proof is malformed or uses an unsupported version.');
  }
  const publicKey = resolveDidKeyEd25519(subject);
  if (publicKey === null) {
    return fail('CONSENT_SUBJECT_UNRESOLVABLE', 'Consent subject is not an Ed25519 did:key identifier.');
  }
  const contentHash = sha256Hex(new TextEncoder().encode(canonicalContent));
  if (
    proof.statement !== statement ||
    proof.verification_method !== verificationMethodFor(subject as string) ||
    proof.content_hash !== contentHash
  ) {
    return fail('CONSENT_PROOF_MISMATCH', 'Consent subject proof does not belong to this consent and subject.');
  }
  const signature = Buffer.from(proof.signature, 'base64url');
  if (signature.length !== 64 || signature.toString('base64url') !== proof.signature) {
    return fail('CONSENT_PROOF_MALFORMED', 'Consent subject proof signature is not a canonical Ed25519 signature.');
  }
  let verified = false;
  try {
    verified = crypto.verify(
      null,
      Buffer.from(signingInput(statement, proof.verification_method, canonicalContent, contentHash)),
      publicKey,
      signature
    );
  } catch {
    verified = false;
  }
  if (!verified) {
    return fail('CONSENT_SIGNATURE_INVALID', 'Consent subject proof signature does not verify against the subject key.');
  }
  return { valid: true };
}
