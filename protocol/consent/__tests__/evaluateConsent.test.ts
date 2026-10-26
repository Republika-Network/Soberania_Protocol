import {
  evaluateConsent as evaluateConsentRaw,
  CONSENT_DECISION_REASON_CODES,
  type ConsentRecord,
  type ConsentRequest,
} from '..';
import { signTestConsentRecord, testSubjectSigner } from '../../../tests/helpers/consentSigning';
import { createStaticRevocationCheck as staticRevocationCheck03F, verifiedNotRevokedStatus as notRevokedStatus03F } from '../../revocation';

// Consent-record decisions read revocation from an explicit port; these tests use one that answers
// "verified not revoked" unless a test supplies its own.
const consentRecordsNotRevoked = { checkRevocation: staticRevocationCheck03F(notRevokedStatus03F({ subjectId: 'fixture', subjectType: 'consent_grant' })) };
const evaluateConsent = (request: unknown, consent: unknown, options = consentRecordsNotRevoked) =>
  evaluateConsentRaw(request, consent, options);


// Consent records are signed by their subject; unsigned records grant nothing.
const SUBJECT_ID = testSubjectSigner('record-subject').did;

function buildValidConsent(overrides: Partial<ConsentRecord> = {}): ConsentRecord {
  return signTestConsentRecord({
    consent_id: 'consent-123',
    subject_id: SUBJECT_ID,
    requester_id: 'requester-1',
    resource: 'resource:profile',
    actions: ['read', 'share'],
    granted: true,
    created_at: '2026-01-01T00:00:00.000Z',
    expires_at: '2026-12-31T00:00:00.000Z',
    revoked_at: null,
    consent_hash: 'hash-abc',
    metadata: { source: 'test' },
    ...overrides,
  });
}

function buildValidRequest(overrides: Partial<ConsentRequest> = {}): ConsentRequest {
  return {
    subject_id: SUBJECT_ID,
    requester_id: 'requester-1',
    resource: 'resource:profile',
    action: 'read',
    requested_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('evaluateConsent', () => {
  it('allows when request exactly matches a granted active consent', () => {
    const decision = evaluateConsent(buildValidRequest(), buildValidConsent());

    expect(decision).toEqual({
      allowed: true,
      reason_code: CONSENT_DECISION_REASON_CODES.ALLOW,
      evaluated_at: '2026-06-01T00:00:00.000Z',
      consent_id: 'consent-123',
    });
  });

  it('denies when consent is missing', () => {
    const decision = evaluateConsent(buildValidRequest(), null);

    expect(decision.allowed).toBe(false);
    expect(decision.reason_code).toBe(CONSENT_DECISION_REASON_CODES.DENY_NO_CONSENT);
    expect(decision.consent_id).toBeNull();
  });

  it('denies when subject does not match', () => {
    const decision = evaluateConsent(buildValidRequest({ subject_id: 'subject-2' }), buildValidConsent());

    expect(decision.reason_code).toBe(CONSENT_DECISION_REASON_CODES.DENY_SUBJECT_MISMATCH);
  });

  it('denies when requester does not match', () => {
    const decision = evaluateConsent(
      buildValidRequest({ requester_id: 'requester-2' }),
      buildValidConsent()
    );

    expect(decision.reason_code).toBe(CONSENT_DECISION_REASON_CODES.DENY_REQUESTER_MISMATCH);
  });

  it('denies when resource does not match', () => {
    const decision = evaluateConsent(
      buildValidRequest({ resource: 'resource:billing' }),
      buildValidConsent()
    );

    expect(decision.reason_code).toBe(CONSENT_DECISION_REASON_CODES.DENY_RESOURCE_MISMATCH);
  });

  it('denies when action is not granted', () => {
    const decision = evaluateConsent(buildValidRequest({ action: 'delete' }), buildValidConsent());

    expect(decision.reason_code).toBe(CONSENT_DECISION_REASON_CODES.DENY_ACTION_NOT_GRANTED);
  });

  it('denies when consent exists but is not granted', () => {
    const decision = evaluateConsent(buildValidRequest(), buildValidConsent({ granted: false }));

    expect(decision.reason_code).toBe(CONSENT_DECISION_REASON_CODES.DENY_NOT_GRANTED);
  });

  it('prioritizes not-granted denial before action checks', () => {
    const decision = evaluateConsent(
      buildValidRequest({ action: 'delete' }),
      buildValidConsent({ granted: false })
    );

    expect(decision.reason_code).toBe(CONSENT_DECISION_REASON_CODES.DENY_NOT_GRANTED);
  });

  it('denies when consent is expired', () => {
    const decision = evaluateConsent(
      buildValidRequest({ requested_at: '2027-01-01T00:00:00.000Z' }),
      buildValidConsent({ expires_at: '2026-12-31T00:00:00.000Z' })
    );

    expect(decision.reason_code).toBe(CONSENT_DECISION_REASON_CODES.DENY_EXPIRED);
  });

  it('denies when request is exactly at expiration timestamp', () => {
    const decision = evaluateConsent(
      buildValidRequest({ requested_at: '2026-12-31T00:00:00.000Z' }),
      buildValidConsent({ expires_at: '2026-12-31T00:00:00.000Z' })
    );

    expect(decision.reason_code).toBe(CONSENT_DECISION_REASON_CODES.DENY_EXPIRED);
  });

  it('denies when consent has been revoked', () => {
    const decision = evaluateConsent(
      buildValidRequest({ requested_at: '2026-06-02T00:00:00.000Z' }),
      buildValidConsent({ revoked_at: '2026-06-01T12:00:00.000Z' })
    );

    expect(decision.reason_code).toBe(CONSENT_DECISION_REASON_CODES.DENY_REVOKED);
  });

  it('denies when request predates consent creation', () => {
    const decision = evaluateConsent(
      buildValidRequest({ requested_at: '2025-12-31T23:59:59.000Z' }),
      buildValidConsent({ created_at: '2026-01-01T00:00:00.000Z' })
    );

    expect(decision.reason_code).toBe(CONSENT_DECISION_REASON_CODES.DENY_INVALID_INPUT);
  });

  it('denies with invalid input for malformed request or consent', () => {
    const malformedRequest = {
      ...buildValidRequest(),
      requested_at: 'not-a-date',
    };

    const decisionFromBadRequest = evaluateConsent(malformedRequest, buildValidConsent());
    expect(decisionFromBadRequest.reason_code).toBe(CONSENT_DECISION_REASON_CODES.DENY_INVALID_INPUT);

    const malformedConsent = {
      ...buildValidConsent(),
      actions: [],
    };

    const decisionFromBadConsent = evaluateConsent(buildValidRequest(), malformedConsent);
    expect(decisionFromBadConsent.reason_code).toBe(CONSENT_DECISION_REASON_CODES.DENY_INVALID_INPUT);
  });
});
