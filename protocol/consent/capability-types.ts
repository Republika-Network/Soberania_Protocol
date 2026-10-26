import type { ConsentDecision, ConsentRecord, ConsentRequest } from './types';

export const CAPABILITY_REASON_CODES = {
  VALID: 'VALID',
  INVALID_INPUT: 'INVALID_INPUT',
  INVALID_SIGNATURE: 'INVALID_SIGNATURE',
  INVALID_HASH: 'INVALID_HASH',
  EXPIRED: 'EXPIRED',
  SUBJECT_MISMATCH: 'SUBJECT_MISMATCH',
  REQUESTER_MISMATCH: 'REQUESTER_MISMATCH',
  RESOURCE_MISMATCH: 'RESOURCE_MISMATCH',
  ACTION_MISMATCH: 'ACTION_MISMATCH',
  CONSENT_MISMATCH: 'CONSENT_MISMATCH',
  CONSENT_UNAUTHENTICATED: 'CONSENT_UNAUTHENTICATED',
  DECISION_NOT_ALLOWED: 'DECISION_NOT_ALLOWED',
  DENY_INVALID_CAPABILITY: 'DENY_INVALID_CAPABILITY',
  CAPABILITY_PATH_DISABLED: 'CAPABILITY_PATH_DISABLED',
  ALLOW: 'ALLOW',
} as const;

export type CapabilityReasonCode =
  (typeof CAPABILITY_REASON_CODES)[keyof typeof CAPABILITY_REASON_CODES];

export type CapabilityToken = {
  capability_id: string;
  consent_id: string;
  subject_id: string;
  requester_id: string;
  resource: string;
  action: string;
  issued_at: string;
  expires_at: string | null;
  nonce: string;
  capability_hash: string;
  signature: string;
  metadata?: Record<string, unknown>;
};

export type CapabilityIssuanceInput = {
  consent: ConsentRecord;
  request: ConsentRequest;
  decision: ConsentDecision;
};

export type CapabilityValidationResult = {
  valid: boolean;
  reason_code: CapabilityReasonCode;
};

export type CapabilityAuthorizationRequest = {
  consent_id?: string;
  subject_id: string;
  requester_id: string;
  resource: string;
  action: string;
};

export type CapabilityAuthorizationResult = {
  allowed: boolean;
  reason_code: CapabilityReasonCode;
  evaluated_at: string;
  capability_id: string | null;
};

export type CanonicalCapabilityPayload = {
  consent_id: string;
  subject_id: string;
  requester_id: string;
  resource: string;
  action: string;
  issued_at: string;
  expires_at: string | null;
  nonce: string;
};
