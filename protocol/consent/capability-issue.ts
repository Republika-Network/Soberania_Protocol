import { createHash } from 'crypto';
import { buildCanonicalCapabilityPayload, hashCapabilityPayload } from './capability-hash';
import { signCapabilityHash } from './capability-sign';
import {
  CAPABILITY_REASON_CODES,
  type CapabilityIssuanceInput,
  type CapabilityToken,
} from './capability-types';
import { CONSENT_DECISION_REASON_CODES } from './types';
import { isValidConsentRecord, isValidConsentRequest } from './validate';
import { verifyConsentRecordProof } from './consent-record-proof';
import { evaluateConsent, type ConsentDecisionOptions } from './evaluate';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidIsoDateString(value: unknown): value is string {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function deriveNonce(input: CapabilityIssuanceInput): string {
  const fingerprint = JSON.stringify([
    input.consent.consent_id,
    input.request.subject_id,
    input.request.requester_id,
    input.request.resource,
    input.request.action,
    input.request.requested_at,
    input.decision.evaluated_at,
  ]);

  return createHash('sha256').update(fingerprint).digest('hex');
}

function assertIssuable(input: CapabilityIssuanceInput, secret: string, options: ConsentDecisionOptions): void {
  if (!isValidConsentRecord(input.consent) || !isValidConsentRequest(input.request)) {
    throw new Error(CAPABILITY_REASON_CODES.INVALID_INPUT);
  }

  if (!isNonEmptyString(secret)) {
    throw new Error(CAPABILITY_REASON_CODES.INVALID_INPUT);
  }

  // Issue only from a record its subject signed; never trust that the decision
  // passed in was made over an authenticated record.
  if (!verifyConsentRecordProof(input.consent).valid) {
    throw new Error(CAPABILITY_REASON_CODES.CONSENT_UNAUTHENTICATED);
  }

  if (!isValidIsoDateString(input.decision.evaluated_at)) {
    throw new Error(CAPABILITY_REASON_CODES.INVALID_INPUT);
  }

  if (input.decision.allowed !== true || input.decision.reason_code !== CONSENT_DECISION_REASON_CODES.ALLOW) {
    throw new Error(CAPABILITY_REASON_CODES.DECISION_NOT_ALLOWED);
  }

  if (input.decision.consent_id !== input.consent.consent_id) {
    throw new Error(CAPABILITY_REASON_CODES.CONSENT_MISMATCH);
  }

  if (input.request.subject_id !== input.consent.subject_id) {
    throw new Error(CAPABILITY_REASON_CODES.SUBJECT_MISMATCH);
  }

  if (input.request.requester_id !== input.consent.requester_id) {
    throw new Error(CAPABILITY_REASON_CODES.REQUESTER_MISMATCH);
  }

  if (input.request.resource !== input.consent.resource) {
    throw new Error(CAPABILITY_REASON_CODES.RESOURCE_MISMATCH);
  }

  if (!input.consent.actions.includes(input.request.action)) {
    throw new Error(CAPABILITY_REASON_CODES.ACTION_MISMATCH);
  }

  // Re-decide here instead of trusting the decision handed in: the record must
  // still grant this request (granted, not revoked per the authoritative port, not expired).
  if (evaluateConsent(input.request, input.consent, options).reason_code !== CONSENT_DECISION_REASON_CODES.ALLOW) {
    throw new Error(CAPABILITY_REASON_CODES.DECISION_NOT_ALLOWED);
  }
}

export function issueCapabilityToken(input: CapabilityIssuanceInput, secret: string, options: ConsentDecisionOptions): CapabilityToken {
  assertIssuable(input, secret, options);

  const issuedAt = new Date(input.decision.evaluated_at).toISOString();
  const nonce = deriveNonce(input);

  const payload = buildCanonicalCapabilityPayload({
    consent_id: input.consent.consent_id,
    subject_id: input.request.subject_id,
    requester_id: input.request.requester_id,
    resource: input.request.resource,
    action: input.request.action,
    issued_at: issuedAt,
    expires_at: input.consent.expires_at,
    nonce,
  });

  const capabilityHash = hashCapabilityPayload(payload);
  const signature = signCapabilityHash(capabilityHash, secret);

  return {
    capability_id: capabilityHash,
    ...payload,
    capability_hash: capabilityHash,
    signature,
  };
}
