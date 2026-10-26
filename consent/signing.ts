import { canonicalizeConsentPayload } from './canonical';
import { validateConsentObject } from './consentObject';
import { computeConsentHash } from './hash';
import {
  createSubjectConsentProof,
  SubjectConsentProofError,
  verifySubjectConsentProof,
  type ConsentSubjectSigner,
  type SubjectConsentProofResult,
} from './proof';
import type { ConsentObjectV1 } from './types';

const STATEMENT = 'consent-object/v1';

function canonicalContent(consent: ConsentObjectV1): string {
  return new TextDecoder().decode(canonicalizeConsentPayload(consent));
}

/**
 * Returns the consent with its subject's detached proof attached. The consent
 * must be well formed; only its subject can sign it.
 */
export function signConsentObject(consent: ConsentObjectV1, signer: ConsentSubjectSigner): ConsentObjectV1 {
  validateConsentObject(consent);
  const { subject_proof: _previous, ...unsigned } = consent;
  return {
    ...unsigned,
    subject_proof: createSubjectConsentProof(STATEMENT, consent.subject, canonicalContent(consent), signer),
  };
}

/**
 * Checks that the consent's subject signed exactly this consent: its canonical
 * content, its consent_hash and its subject. Structural validation stays with
 * the caller; anything that cannot be canonicalized fails here as malformed.
 */
export function verifyConsentObjectProof(consent: unknown): SubjectConsentProofResult {
  if (typeof consent !== 'object' || consent === null || Array.isArray(consent)) {
    return { valid: false, code: 'CONSENT_PROOF_MALFORMED', reason: 'Consent must be an object.' };
  }
  const candidate = consent as ConsentObjectV1;
  let content: string;
  try {
    content = canonicalContent(candidate);
  } catch {
    return { valid: false, code: 'CONSENT_PROOF_MALFORMED', reason: 'Consent content cannot be canonicalized.' };
  }
  const result = verifySubjectConsentProof(STATEMENT, candidate.subject, content, candidate.subject_proof);
  if (!result.valid) return result;
  if (candidate.consent_hash !== computeConsentHash(new TextEncoder().encode(content))) {
    return {
      valid: false,
      code: 'CONSENT_PROOF_MISMATCH',
      reason: 'Consent consent_hash does not match its signed content.',
    };
  }
  return result;
}

/** Throws a SubjectConsentProofError unless the consent is signed by its subject. */
export function assertConsentObjectAuthenticated(consent: unknown): void {
  const result = verifyConsentObjectProof(consent);
  if (!result.valid) {
    throw new SubjectConsentProofError(result.code, result.reason);
  }
}
