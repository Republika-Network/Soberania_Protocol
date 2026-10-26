import type { SubjectConsentProofV1 } from '../../consent/proof';

export type ConsentRecord = {
  consent_id: string;
  subject_id: string;
  requester_id: string;
  resource: string;
  actions: string[];
  granted: boolean;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  consent_hash: string | null;
  metadata?: Record<string, unknown>;
  /** The subject's detached proof (consent/proof.ts). A record without one grants nothing. */
  subject_proof?: SubjectConsentProofV1;
};

export type ConsentRequest = {
  subject_id: string;
  requester_id: string;
  resource: string;
  action: string;
  requested_at: string;
};

export const CONSENT_DECISION_REASON_CODES = {
  ALLOW: 'ALLOW',
  DENY_NO_CONSENT: 'DENY_NO_CONSENT',
  DENY_SUBJECT_MISMATCH: 'DENY_SUBJECT_MISMATCH',
  DENY_REQUESTER_MISMATCH: 'DENY_REQUESTER_MISMATCH',
  DENY_RESOURCE_MISMATCH: 'DENY_RESOURCE_MISMATCH',
  DENY_ACTION_NOT_GRANTED: 'DENY_ACTION_NOT_GRANTED',
  DENY_NOT_GRANTED: 'DENY_NOT_GRANTED',
  DENY_EXPIRED: 'DENY_EXPIRED',
  DENY_REVOKED: 'DENY_REVOKED',
  DENY_INVALID_INPUT: 'DENY_INVALID_INPUT',
  DENY_UNAUTHENTICATED: 'DENY_UNAUTHENTICATED',
  DENY_REVOCATION_UNKNOWN: 'DENY_REVOCATION_UNKNOWN',
} as const;

export type ConsentDecisionReasonCode =
  (typeof CONSENT_DECISION_REASON_CODES)[keyof typeof CONSENT_DECISION_REASON_CODES];

export type ConsentDecision = {
  allowed: boolean;
  reason_code: ConsentDecisionReasonCode;
  evaluated_at: string;
  consent_id: string | null;
};
