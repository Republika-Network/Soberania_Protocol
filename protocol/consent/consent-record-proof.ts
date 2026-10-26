import { canonicalizeJSON } from '../../canonicalize';
import {
  createSubjectConsentProof,
  verifySubjectConsentProof,
  type ConsentSubjectSigner,
  type SubjectConsentProofResult,
} from '../../consent/proof';
import type { ConsentRecord } from './types';

const STATEMENT = 'consent-record/v1';

/**
 * The signed content of a consent record: everything that decides what it
 * grants. `revoked_at` is left out because revocation is recorded after
 * signing and can only take authority away; `consent_hash` and `metadata` do
 * not take part in decisions.
 */
function canonicalRecordContent(record: ConsentRecord): string {
  if (!Array.isArray(record.actions)) {
    throw new TypeError('Consent record actions must be an array.');
  }
  return canonicalizeJSON({
    actions: [...record.actions].sort(),
    consent_id: record.consent_id,
    created_at: record.created_at,
    expires_at: record.expires_at,
    granted: record.granted,
    requester_id: record.requester_id,
    resource: record.resource,
    subject_id: record.subject_id,
  });
}

/** Returns the record with its subject's detached proof attached. */
export function signConsentRecord(record: ConsentRecord, signer: ConsentSubjectSigner): ConsentRecord {
  const { subject_proof: _previous, ...unsigned } = record;
  return {
    ...unsigned,
    subject_proof: createSubjectConsentProof(STATEMENT, record.subject_id, canonicalRecordContent(record), signer),
  };
}

/** Checks that the record's subject (an Ed25519 did:key) signed exactly this record. */
export function verifyConsentRecordProof(record: unknown): SubjectConsentProofResult {
  if (typeof record !== 'object' || record === null || Array.isArray(record)) {
    return { valid: false, code: 'CONSENT_PROOF_MALFORMED', reason: 'Consent record must be an object.' };
  }
  const candidate = record as ConsentRecord;
  let content: string;
  try {
    content = canonicalRecordContent(candidate);
  } catch {
    return { valid: false, code: 'CONSENT_PROOF_MALFORMED', reason: 'Consent record cannot be canonicalized.' };
  }
  return verifySubjectConsentProof(STATEMENT, candidate.subject_id, content, candidate.subject_proof);
}
