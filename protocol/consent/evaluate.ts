import {
  CONSENT_DECISION_REASON_CODES,
  type ConsentDecision,
  type ConsentDecisionReasonCode,
  type ConsentRecord,
  type ConsentRequest,
} from './types';
import { isValidConsentRecord, isValidConsentRequest } from './validate';
import { verifyConsentRecordProof } from './consent-record-proof';
import type { RevocationCheckPort, RevocationStatus } from '../revocation';

const FALLBACK_EVALUATED_AT = '1970-01-01T00:00:00.000Z';

/**
 * Where a consent record's revocation is decided. The record a caller presents is not an
 * authority: its `revoked_at` can only take access away, never give it back. The port is
 * mandatory; without one every decision is DENY_REVOCATION_UNKNOWN. There is no in-memory
 * default: a deployment wires its own registry.
 */
export type ConsentDecisionOptions = {
  checkRevocation: RevocationCheckPort;
};

function authoritativeRevocation(consentId: string, options: ConsentDecisionOptions | undefined): RevocationStatus['status'] | 'unknown' {
  const check = options?.checkRevocation;
  if (typeof check !== 'function') return 'unknown';
  try {
    const status = check({ subjectId: consentId, subjectType: 'consent_grant' });
    return status && typeof status.status === 'string' ? status.status : 'unknown';
  } catch {
    return 'unknown';
  }
}

function toTimeMs(value: string): number {
  return new Date(value).getTime();
}

function toDecision(
  allowed: boolean,
  reason_code: ConsentDecisionReasonCode,
  evaluated_at: string,
  consent_id: string | null
): ConsentDecision {
  return {
    allowed,
    reason_code,
    evaluated_at,
    consent_id,
  };
}

function resolveEvaluatedAt(request: unknown): string {
  if (request && typeof request === 'object') {
    const requestedAt = (request as Partial<ConsentRequest>).requested_at;

    if (typeof requestedAt === 'string' && Number.isFinite(Date.parse(requestedAt))) {
      return new Date(requestedAt).toISOString();
    }
  }

  return FALLBACK_EVALUATED_AT;
}

function resolveConsentId(consent: unknown): string | null {
  if (consent && typeof consent === 'object') {
    const consentId = (consent as Partial<ConsentRecord>).consent_id;
    if (typeof consentId === 'string' && consentId.trim().length > 0) {
      return consentId;
    }
  }

  return null;
}

export function evaluateConsent(
  request: ConsentRequest | unknown,
  consent: ConsentRecord | null | undefined | unknown,
  options: ConsentDecisionOptions
): ConsentDecision {
  const evaluatedAt = resolveEvaluatedAt(request);
  const consentId = resolveConsentId(consent);

  if (!isValidConsentRequest(request)) {
    return toDecision(false, CONSENT_DECISION_REASON_CODES.DENY_INVALID_INPUT, evaluatedAt, consentId);
  }

  if (consent == null) {
    return toDecision(false, CONSENT_DECISION_REASON_CODES.DENY_NO_CONSENT, evaluatedAt, null);
  }

  if (!isValidConsentRecord(consent)) {
    return toDecision(false, CONSENT_DECISION_REASON_CODES.DENY_INVALID_INPUT, evaluatedAt, consentId);
  }

  // Only a record signed by its subject grants anything.
  if (!verifyConsentRecordProof(consent).valid) {
    return toDecision(false, CONSENT_DECISION_REASON_CODES.DENY_UNAUTHENTICATED, evaluatedAt, consent.consent_id);
  }

  if (request.subject_id !== consent.subject_id) {
    return toDecision(false, CONSENT_DECISION_REASON_CODES.DENY_SUBJECT_MISMATCH, evaluatedAt, consent.consent_id);
  }

  if (request.requester_id !== consent.requester_id) {
    return toDecision(false, CONSENT_DECISION_REASON_CODES.DENY_REQUESTER_MISMATCH, evaluatedAt, consent.consent_id);
  }

  if (request.resource !== consent.resource) {
    return toDecision(false, CONSENT_DECISION_REASON_CODES.DENY_RESOURCE_MISMATCH, evaluatedAt, consent.consent_id);
  }

  if (!consent.granted) {
    return toDecision(false, CONSENT_DECISION_REASON_CODES.DENY_NOT_GRANTED, evaluatedAt, consent.consent_id);
  }

  if (!consent.actions.includes(request.action)) {
    return toDecision(false, CONSENT_DECISION_REASON_CODES.DENY_ACTION_NOT_GRANTED, evaluatedAt, consent.consent_id);
  }

  const requestedAtMs = toTimeMs(request.requested_at);
  const createdAtMs = toTimeMs(consent.created_at);

  // Fail closed when a request predates consent issuance. A consent cannot authorize
  // access that was requested before the consent itself existed.
  if (requestedAtMs < createdAtMs) {
    return toDecision(false, CONSENT_DECISION_REASON_CODES.DENY_INVALID_INPUT, evaluatedAt, consent.consent_id);
  }

  // Revocation is read from the authoritative port, keyed by consent_id. Stripping or editing
  // the presented record's unsigned fields changes nothing here.
  const revocation = authoritativeRevocation(consent.consent_id, options);
  if (revocation === 'revoked') {
    return toDecision(false, CONSENT_DECISION_REASON_CODES.DENY_REVOKED, evaluatedAt, consent.consent_id);
  }
  if (revocation !== 'verified_not_revoked') {
    return toDecision(false, CONSENT_DECISION_REASON_CODES.DENY_REVOCATION_UNKNOWN, evaluatedAt, consent.consent_id);
  }

  // A revoked_at on the presented record is advisory and can only deny: it takes effect at the
  // exact timestamp (`>=`) and afterwards.
  if (consent.revoked_at !== null && requestedAtMs >= toTimeMs(consent.revoked_at)) {
    return toDecision(false, CONSENT_DECISION_REASON_CODES.DENY_REVOKED, evaluatedAt, consent.consent_id);
  }

  // Expiration is inclusive (`>=`) to match revocation semantics and keep
  // time-bound policy checks deterministic at exact boundary instants.
  if (consent.expires_at !== null && requestedAtMs >= toTimeMs(consent.expires_at)) {
    return toDecision(false, CONSENT_DECISION_REASON_CODES.DENY_EXPIRED, evaluatedAt, consent.consent_id);
  }

  return toDecision(true, CONSENT_DECISION_REASON_CODES.ALLOW, evaluatedAt, consent.consent_id);
}
