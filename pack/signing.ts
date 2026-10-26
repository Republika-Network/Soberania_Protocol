import { canonicalizePackManifestPayload } from './canonical';
import { computePackHash } from './hash';
import {
  createSubjectConsentProof,
  SubjectConsentProofError,
  verifySubjectConsentProof,
  type ConsentSubjectSigner,
  type SubjectConsentProofResult,
} from '../consent/proof';
import type { PackManifestV1 } from './types';

const STATEMENT = 'pack-manifest/v1';

function canonicalContent(pack: PackManifestV1): string {
  return new TextDecoder().decode(
    canonicalizePackManifestPayload({
      version: pack.version,
      subject: pack.subject,
      created_at: pack.created_at,
      fields: pack.fields,
    })
  );
}

/**
 * Returns the pack manifest with its subject's detached proof attached. A pack
 * names its owner in `subject`; the proof is what makes that name a claim the
 * subject actually made, rather than a string anyone can write. The proof is
 * not part of the canonical payload, so `pack_hash` does not depend on it.
 */
export function signPackManifest(pack: PackManifestV1, signer: ConsentSubjectSigner): PackManifestV1 {
  const { subject_proof: _previous, ...unsigned } = pack;
  return {
    ...unsigned,
    subject_proof: createSubjectConsentProof(STATEMENT, pack.subject, canonicalContent(pack), signer),
  };
}

/**
 * Checks that the pack's subject signed exactly this manifest (its canonical
 * content and `pack_hash`). It proves who registered the pack; it does not by
 * itself prove ownership of the content the pack lists (see vault.storePack).
 */
export function verifyPackManifestProof(pack: unknown): SubjectConsentProofResult {
  if (typeof pack !== 'object' || pack === null || Array.isArray(pack)) {
    return { valid: false, code: 'CONSENT_PROOF_MALFORMED', reason: 'Pack manifest must be an object.' };
  }
  const candidate = pack as PackManifestV1;
  let content: string;
  try {
    content = canonicalContent(candidate);
  } catch {
    return { valid: false, code: 'CONSENT_PROOF_MALFORMED', reason: 'Pack manifest cannot be canonicalized.' };
  }
  const result = verifySubjectConsentProof(STATEMENT, candidate.subject, content, candidate.subject_proof);
  if (!result.valid) return result;
  if (candidate.pack_hash !== computePackHash(new TextEncoder().encode(content))) {
    return { valid: false, code: 'CONSENT_PROOF_MISMATCH', reason: 'Pack pack_hash does not match its signed content.' };
  }
  return result;
}

/** Throws a SubjectConsentProofError unless the pack is signed by its subject. */
export function assertPackManifestAuthenticated(pack: unknown): void {
  const result = verifyPackManifestProof(pack);
  if (!result.valid) {
    throw new SubjectConsentProofError(result.code, result.reason);
  }
}
