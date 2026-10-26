import { buildConsentObject as buildUnsignedConsentObject } from '../../../consent';
import {
  doesConsentAllowScope,
  evaluateConsentState,
  isConsentActive,
  isConsentRevoked,
  normalizeConsent,
  parseConsent,
  validateConsent,
} from '..';
import {
  createStaticRevocationCheck,
  revocationLookupFailedStatus,
  revokedStatus,
  verifiedNotRevokedStatus,
} from '../../revocation';
import { testSubjectSigner, signTestConsent } from '../../../tests/helpers/consentSigning';

// Consents in these tests are signed by their subject; unsigned consents authorize nothing.
const buildConsentObject: typeof buildUnsignedConsentObject = (...args) =>
  signTestConsent(buildUnsignedConsentObject(...args));

const SUBJECT = testSubjectSigner('subject').did;
const GRANTEE = testSubjectSigner('grantee').did;
const REF_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const notRevoked = createStaticRevocationCheck(
  verifiedNotRevokedStatus({ subjectId: 'consent-fixture', subjectType: 'consent_grant' })
);
const revoked = createStaticRevocationCheck(
  revokedStatus({
    subjectId: 'consent-fixture',
    subjectType: 'consent_grant',
    revocationId: 'rev-1',
    reasonCode: 'REVOKED',
    revokedAt: '2025-01-02T00:00:00Z',
  })
);
const unavailable = createStaticRevocationCheck(
  revocationLookupFailedStatus({ subjectId: 'consent-fixture', subjectType: 'consent_grant' })
);

describe('protocol consent core extraction', () => {
  it('accepts a valid active consent', () => {
    const consent = buildConsentObject(
      SUBJECT,
      GRANTEE,
      'grant',
      [{ type: 'content', ref: REF_A }],
      ['read'],
      {
        now: new Date('2025-01-01T00:00:00Z'),
        expires_at: '2025-12-31T00:00:00Z',
      }
    );

    const parsed = parseConsent(consent);
    const normalized = normalizeConsent(parsed);
    const validation = validateConsent(normalized);
    const state = evaluateConsentState(normalized, { now: new Date('2025-06-01T00:00:00Z'), checkRevocation: notRevoked });

    expect(validation.valid).toBe(true);
    expect(state.state).toBe('active');
    expect(isConsentActive(normalized, { now: new Date('2025-06-01T00:00:00Z'), checkRevocation: notRevoked })).toBe(true);
    expect(
      doesConsentAllowScope(normalized, {
        scope: [{ type: 'content', ref: REF_A }],
        permissions: ['read'],
        now: new Date('2025-06-01T00:00:00Z'),
        checkRevocation: notRevoked,
      })
    ).toBe(true);
  });

  it('marks expired consent as expired and deny scope', () => {
    const consent = buildConsentObject(
      SUBJECT,
      GRANTEE,
      'grant',
      [{ type: 'content', ref: REF_A }],
      ['read'],
      {
        now: new Date('2025-01-01T00:00:00Z'),
        expires_at: '2025-01-02T00:00:00Z',
      }
    );

    const state = evaluateConsentState(consent, { now: new Date('2025-01-03T00:00:00Z'), checkRevocation: notRevoked });
    expect(state.state).toBe('expired');
    expect(
      doesConsentAllowScope(consent, {
        scope: [{ type: 'content', ref: REF_A }],
        permissions: ['read'],
        now: new Date('2025-01-03T00:00:00Z'),
        checkRevocation: notRevoked,
      })
    ).toBe(false);
  });

  it('marks consent as revoked when the canonical revocation check reports revoked', () => {
    const consent = buildConsentObject(
      SUBJECT,
      GRANTEE,
      'grant',
      [{ type: 'content', ref: REF_A }],
      ['read'],
      { now: new Date('2025-01-01T00:00:00Z') }
    );

    const state = evaluateConsentState(consent, {
      now: new Date('2025-01-03T00:00:00Z'),
      checkRevocation: revoked,
    });

    expect(state.state).toBe('revoked');
    expect(state.revocationStatus?.status).toBe('revoked');
    expect(isConsentRevoked(consent, { checkRevocation: revoked })).toBe(true);
  });

  it('FAIL-CLOSED REGRESSION: an unavailable revocation source blocks, never "not revoked"', () => {
    // This is the negative proof required by the sprint: a revocation lookup failure must never
    // collapse into "active". The naive anti-pattern (`return data?.reason ?? null` on a DB
    // error) would make this consent look active; the canonical model must not.
    const consent = buildConsentObject(
      SUBJECT,
      GRANTEE,
      'grant',
      [{ type: 'content', ref: REF_A }],
      ['read'],
      { now: new Date('2025-01-01T00:00:00Z'), expires_at: '2025-12-31T00:00:00Z' }
    );

    const state = evaluateConsentState(consent, { now: new Date('2025-06-01T00:00:00Z'), checkRevocation: unavailable });

    expect(state.state).not.toBe('active');
    expect(state.state).toBe('revocation_unknown');
    expect(state.revocationStatus?.status).toBe('unknown');

    expect(isConsentActive(consent, { now: new Date('2025-06-01T00:00:00Z'), checkRevocation: unavailable })).toBe(false);
    expect(
      doesConsentAllowScope(consent, {
        scope: [{ type: 'content', ref: REF_A }],
        permissions: ['read'],
        now: new Date('2025-06-01T00:00:00Z'),
        checkRevocation: unavailable,
      })
    ).toBe(false);
  });

  it('FAIL-CLOSED REGRESSION: a checkRevocation port that throws blocks instead of leaking the exception into an allow', () => {
    const consent = buildConsentObject(
      SUBJECT,
      GRANTEE,
      'grant',
      [{ type: 'content', ref: REF_A }],
      ['read'],
      { now: new Date('2025-01-01T00:00:00Z'), expires_at: '2025-12-31T00:00:00Z' }
    );

    const throwingCheck = () => {
      throw new Error('registry connection reset');
    };

    const state = evaluateConsentState(consent, { now: new Date('2025-06-01T00:00:00Z'), checkRevocation: throwingCheck });

    expect(state.state).toBe('revocation_unknown');
    expect(state.revocationStatus?.status).toBe('unknown');
  });

  it('fails closed on invalid or incomplete scope requests', () => {
    const consent = buildConsentObject(
      SUBJECT,
      GRANTEE,
      'grant',
      [{ type: 'content', ref: REF_A }],
      ['read'],
      { now: new Date('2025-01-01T00:00:00Z') }
    );

    expect(
      doesConsentAllowScope(consent, {
        scope: [],
        permissions: ['read'],
        now: new Date('2025-01-01T01:00:00Z'),
        checkRevocation: notRevoked,
      })
    ).toBe(false);

    expect(
      doesConsentAllowScope(consent, {
        scope: [{ type: 'content', ref: '' }],
        permissions: ['read'],
        now: new Date('2025-01-01T01:00:00Z'),
        checkRevocation: notRevoked,
      })
    ).toBe(false);
  });

  it('denies when request permissions are invalid or not granted', () => {
    const consent = buildConsentObject(
      SUBJECT,
      GRANTEE,
      'grant',
      [{ type: 'content', ref: REF_A }],
      ['read'],
      { now: new Date('2025-01-01T00:00:00Z') }
    );

    expect(
      doesConsentAllowScope(consent, {
        scope: [{ type: 'content', ref: REF_A }],
        permissions: ['store'],
        checkRevocation: notRevoked,
      })
    ).toBe(false);

    expect(
      doesConsentAllowScope(consent, {
        scope: [{ type: 'content', ref: REF_A }],
        permissions: [''],
        checkRevocation: notRevoked,
      })
    ).toBe(false);
  });

  it('denies on subject/grantee binding mismatch', () => {
    const consent = buildConsentObject(
      SUBJECT,
      GRANTEE,
      'grant',
      [{ type: 'content', ref: REF_A }],
      ['read'],
      { now: new Date('2025-01-01T00:00:00Z'), marketMakerId: 'hrkey-v1' }
    );

    expect(
      doesConsentAllowScope(consent, {
        scope: [{ type: 'content', ref: REF_A }],
        permissions: ['read'],
        subject: 'did:key:z6MkDifferentSubject1234567890abc',
        checkRevocation: notRevoked,
      })
    ).toBe(false);

    expect(
      doesConsentAllowScope(consent, {
        scope: [{ type: 'content', ref: REF_A }],
        permissions: ['read'],
        grantee: 'did:key:z6MkDifferentGrantee1234567890abc',
        checkRevocation: notRevoked,
      })
    ).toBe(false);

    expect(
      doesConsentAllowScope(consent, {
        scope: [{ type: 'content', ref: REF_A }],
        permissions: ['read'],
        marketMakerId: 'another-mm',
        checkRevocation: notRevoked,
      })
    ).toBe(false);
  });

  it('fails closed with missing critical fields', () => {
    expect(() => parseConsent({})).toThrow('Consent field "subject" must be a string.');
    expect(() => parseConsent({ subject: SUBJECT, grantee: GRANTEE, action: 'grant' })).toThrow(
      'Consent field "scope" must be a non-empty array.'
    );
    expect(() =>
      parseConsent({
        subject: SUBJECT,
        grantee: GRANTEE,
        action: 'grant',
        scope: [{ type: 'content', ref: REF_A }],
      })
    ).toThrow('Consent field "permissions" must be a non-empty array.');

    const malformed = {
      version: '1.0',
      subject: SUBJECT,
      grantee: GRANTEE,
      action: 'grant',
      scope: [{ type: 'content', ref: REF_A }],
      permissions: ['read'],
      issued_at: '2025-01-01T00:00:00Z',
      expires_at: null,
      prior_consent: null,
      consent_hash: 'not-a-hash',
    } as any;

    const validation = validateConsent(malformed);
    expect(validation.valid).toBe(false);
  });

  it('invalid state denies by default', () => {
    const malformed = {
      version: '1.0',
      subject: SUBJECT,
      grantee: GRANTEE,
      action: 'grant',
      scope: [{ type: 'content', ref: REF_A }],
      permissions: ['read'],
      issued_at: 'invalid-date',
      expires_at: null,
      prior_consent: null,
      consent_hash: REF_A,
    } as any;

    const state = evaluateConsentState(malformed, {
      now: new Date('2025-01-01T00:00:00Z'),
      checkRevocation: notRevoked,
    });

    expect(state.state).toBe('invalid');
    expect(
      doesConsentAllowScope(malformed, {
        scope: [{ type: 'content', ref: REF_A }],
        permissions: ['read'],
        checkRevocation: notRevoked,
      })
    ).toBe(false);
  });
});
