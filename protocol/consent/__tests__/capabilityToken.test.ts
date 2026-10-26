import * as consentBarrel from '..';
import { authorizeWithCapability } from '../capability-authorize';
import {
  CAPABILITY_REASON_CODES,
  CONSENT_DECISION_REASON_CODES,
  issueCapabilityToken as issueCapabilityTokenRaw,
  type ConsentDecision,
  type ConsentRecord,
  type ConsentRequest,
  validateCapabilityToken,
} from '..';
import { signTestConsentRecord, testSubjectSigner } from '../../../tests/helpers/consentSigning';
import { createStaticRevocationCheck as staticRevocationCheck03F, verifiedNotRevokedStatus as notRevokedStatus03F } from '../../revocation';

// Consent-record decisions read revocation from an explicit port; these tests use one that answers
// "verified not revoked" unless a test supplies its own.
const consentRecordsNotRevoked = { checkRevocation: staticRevocationCheck03F(notRevokedStatus03F({ subjectId: 'fixture', subjectType: 'consent_grant' })) };
const issueCapabilityToken = (input: Parameters<typeof issueCapabilityTokenRaw>[0], secret: string, options = consentRecordsNotRevoked) =>
  issueCapabilityTokenRaw(input, secret, options);


// Consent records are signed by their subject; unsigned records grant nothing.
const SUBJECT_ID = testSubjectSigner('record-subject').did;

const SECRET = 'test-secret';

function buildConsent(overrides: Partial<ConsentRecord> = {}): ConsentRecord {
  return signTestConsentRecord({
    consent_id: 'consent-1',
    subject_id: SUBJECT_ID,
    requester_id: 'requester-1',
    resource: 'resource:profile',
    actions: ['read', 'share'],
    granted: true,
    created_at: '2026-01-01T00:00:00.000Z',
    expires_at: '2026-12-31T00:00:00.000Z',
    revoked_at: null,
    consent_hash: 'consent-hash-1',
    ...overrides,
  });
}

function buildRequest(overrides: Partial<ConsentRequest> = {}): ConsentRequest {
  return {
    subject_id: SUBJECT_ID,
    requester_id: 'requester-1',
    resource: 'resource:profile',
    action: 'read',
    requested_at: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

function buildDecision(overrides: Partial<ConsentDecision> = {}): ConsentDecision {
  return {
    allowed: true,
    reason_code: CONSENT_DECISION_REASON_CODES.ALLOW,
    evaluated_at: '2026-05-01T00:00:00.000Z',
    consent_id: 'consent-1',
    ...overrides,
  };
}

describe('capability token issuance', () => {
  it('issues a capability token from valid consent + request + allowed decision', () => {
    const token = issueCapabilityToken(
      {
        consent: buildConsent(),
        request: buildRequest(),
        decision: buildDecision(),
      },
      SECRET
    );

    expect(token.capability_id).toBe(token.capability_hash);
    expect(token.signature).toHaveLength(64);
    expect(token.action).toBe('read');
  });

  it('refuses issuance when decision.allowed is false', () => {
    expect(() =>
      issueCapabilityToken(
        {
          consent: buildConsent(),
          request: buildRequest(),
          decision: buildDecision({
            allowed: false,
            reason_code: CONSENT_DECISION_REASON_CODES.DENY_NOT_GRANTED,
          }),
        },
        SECRET
      )
    ).toThrow(CAPABILITY_REASON_CODES.DECISION_NOT_ALLOWED);
  });

  it('refuses issuance when consent/request mismatch', () => {
    expect(() =>
      issueCapabilityToken(
        {
          consent: buildConsent(),
          request: buildRequest({ resource: 'resource:billing' }),
          decision: buildDecision(),
        },
        SECRET
      )
    ).toThrow(CAPABILITY_REASON_CODES.RESOURCE_MISMATCH);
  });
});

describe('capability token validation', () => {
  it('validates a correctly issued token', () => {
    const token = issueCapabilityToken(
      {
        consent: buildConsent(),
        request: buildRequest(),
        decision: buildDecision(),
      },
      SECRET
    );

    expect(validateCapabilityToken(token, SECRET)).toEqual({
      valid: true,
      reason_code: CAPABILITY_REASON_CODES.VALID,
    });
  });

  it('fails on malformed token', () => {
    expect(validateCapabilityToken({ invalid: true }, SECRET)).toEqual({
      valid: false,
      reason_code: CAPABILITY_REASON_CODES.INVALID_INPUT,
    });
  });

  it('fails when hash is tampered', () => {
    const token = issueCapabilityToken(
      {
        consent: buildConsent(),
        request: buildRequest(),
        decision: buildDecision(),
      },
      SECRET
    );

    const tampered = { ...token, resource: 'resource:billing' };

    expect(validateCapabilityToken(tampered, SECRET)).toEqual({
      valid: false,
      reason_code: CAPABILITY_REASON_CODES.INVALID_HASH,
    });
  });

  it('fails when signature is tampered', () => {
    const token = issueCapabilityToken(
      {
        consent: buildConsent(),
        request: buildRequest(),
        decision: buildDecision(),
      },
      SECRET
    );

    expect(validateCapabilityToken({ ...token, signature: 'abc' }, SECRET)).toEqual({
      valid: false,
      reason_code: CAPABILITY_REASON_CODES.INVALID_SIGNATURE,
    });
  });

  it('fails when token is expired at exact boundary timestamp', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-12-31T00:00:00.000Z'));

    const token = issueCapabilityToken(
      {
        consent: buildConsent({ expires_at: '2026-12-31T00:00:00.000Z' }),
        request: buildRequest(),
        decision: buildDecision(),
      },
      SECRET
    );

    expect(validateCapabilityToken(token, SECRET)).toEqual({
      valid: false,
      reason_code: CAPABILITY_REASON_CODES.EXPIRED,
    });

    jest.useRealTimers();
  });

  it('fails when metadata is invalid', () => {
    const token = issueCapabilityToken(
      {
        consent: buildConsent(),
        request: buildRequest(),
        decision: buildDecision(),
      },
      SECRET
    );

    expect(validateCapabilityToken({ ...token, metadata: [] }, SECRET)).toEqual({
      valid: false,
      reason_code: CAPABILITY_REASON_CODES.INVALID_INPUT,
    });
  });
});

describe('capability token authorization (disabled path, SOBE-SEC-03J)', () => {
  it('never allows: a request that exactly matches a valid capability token is denied CAPABILITY_PATH_DISABLED', () => {
    const token = issueCapabilityToken(
      {
        consent: buildConsent(),
        request: buildRequest(),
        decision: buildDecision(),
      },
      SECRET
    );

    const result = authorizeWithCapability(buildRequest(), token, SECRET);

    expect(result.allowed).toBe(false);
    expect(result.reason_code).toBe(CAPABILITY_REASON_CODES.CAPABILITY_PATH_DISABLED);
    expect(result.capability_id).toBe(token.capability_id);
  });

  it('is no longer exported from the protocol/consent barrel', () => {
    expect((consentBarrel as Record<string, unknown>).authorizeWithCapability).toBeUndefined();
  });

  it('denies on requester mismatch', () => {
    const token = issueCapabilityToken(
      {
        consent: buildConsent(),
        request: buildRequest(),
        decision: buildDecision(),
      },
      SECRET
    );

    const result = authorizeWithCapability(
      buildRequest({ requester_id: 'requester-2' }),
      token,
      SECRET
    );

    expect(result.allowed).toBe(false);
    expect(result.reason_code).toBe(CAPABILITY_REASON_CODES.REQUESTER_MISMATCH);
  });

  it('denies on resource mismatch', () => {
    const token = issueCapabilityToken(
      {
        consent: buildConsent(),
        request: buildRequest(),
        decision: buildDecision(),
      },
      SECRET
    );

    const result = authorizeWithCapability(buildRequest({ resource: 'resource:billing' }), token, SECRET);

    expect(result.allowed).toBe(false);
    expect(result.reason_code).toBe(CAPABILITY_REASON_CODES.RESOURCE_MISMATCH);
  });

  it('denies on action mismatch', () => {
    const token = issueCapabilityToken(
      {
        consent: buildConsent(),
        request: buildRequest(),
        decision: buildDecision(),
      },
      SECRET
    );

    const result = authorizeWithCapability(buildRequest({ action: 'delete' }), token, SECRET);

    expect(result.allowed).toBe(false);
    expect(result.reason_code).toBe(CAPABILITY_REASON_CODES.ACTION_MISMATCH);
  });

  it('denies when token validation fails', () => {
    const token = issueCapabilityToken(
      {
        consent: buildConsent(),
        request: buildRequest(),
        decision: buildDecision(),
      },
      SECRET
    );

    const result = authorizeWithCapability(buildRequest(), { ...token, signature: 'tampered' }, SECRET);

    expect(result.allowed).toBe(false);
    expect(result.reason_code).toBe(CAPABILITY_REASON_CODES.DENY_INVALID_CAPABILITY);
    expect(result.capability_id).toBeNull();
  });
});
