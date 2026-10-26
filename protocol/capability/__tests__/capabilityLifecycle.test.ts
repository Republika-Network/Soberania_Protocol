import { buildConsentObject as buildUnsignedConsentObject } from '../../../consent';
import {
  projectCapabilityScopeMatch,
  evaluateCapabilityState,
  mintCapability,
  verifyCapability,
} from '..';
import { createStaticRevocationCheck, revokedStatus, verifiedNotRevokedStatus } from '../../revocation';
import { testSubjectSigner, signTestConsent } from '../../../tests/helpers/consentSigning';

// Consents in these tests are signed by their subject; unsigned consents authorize nothing.
const buildConsentObject: typeof buildUnsignedConsentObject = (...args) =>
  signTestConsent(buildUnsignedConsentObject(...args));

const SUBJECT = testSubjectSigner('subject').did;
const GRANTEE = testSubjectSigner('grantee').did;
const REF_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const REF_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const notRevoked = createStaticRevocationCheck(
  verifiedNotRevokedStatus({ subjectId: 'fixture', subjectType: 'capability_grant' })
);
const revoked = createStaticRevocationCheck(
  revokedStatus({
    subjectId: 'fixture',
    subjectType: 'capability_grant',
    revocationId: 'rev-1',
    reasonCode: 'REVOKED',
    revokedAt: '2026-02-16T00:00:00Z',
  })
);

function buildConsent() {
  return buildConsentObject(
    SUBJECT,
    GRANTEE,
    'grant',
    [
      { type: 'content', ref: REF_A },
      { type: 'pack', ref: REF_B },
    ],
    ['read', 'share'],
    {
      now: new Date('2026-01-01T00:00:00Z'),
      expires_at: '2026-12-31T00:00:00Z',
      marketMakerId: 'mm-01',
    }
  );
}

function mintFixture() {
  return mintCapability({
    consent: buildConsent(),
    requested_scope: [{ type: 'content', ref: REF_A }],
    requested_permissions: ['read'],
    issued_at: '2026-02-01T00:00:00Z',
    expires_at: '2026-03-01T00:00:00Z',
    marketMakerId: 'mm-01',
    checkConsentRevocation: notRevoked,
  });
}

describe('protocol capability lifecycle', () => {
  it('mint válido', () => {
    const capability = mintFixture();

    expect(capability.parent_consent_hash).toHaveLength(64);
    expect(capability.capability_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(capability.scope).toEqual([{ type: 'content', ref: REF_A }]);
    expect(capability.permissions).toEqual(['read']);
  });

  it('mint bloquea cuando el consent padre no puede verificarse como no revocado', () => {
    expect(() =>
      mintCapability({
        consent: buildConsent(),
        requested_scope: [{ type: 'content', ref: REF_A }],
        requested_permissions: ['read'],
        issued_at: '2026-02-01T00:00:00Z',
        expires_at: '2026-03-01T00:00:00Z',
        marketMakerId: 'mm-01',
        checkConsentRevocation: revoked,
      })
    ).toThrow(/Consent must be ACTIVE to mint capability/);
  });

  it('mint con scope inválido -> throw', () => {
    expect(() =>
      mintCapability({
        consent: buildConsent(),
        requested_scope: [{ type: 'field', ref: REF_A }],
        requested_permissions: ['read'],
        issued_at: '2026-02-01T00:00:00Z',
        expires_at: '2026-03-01T00:00:00Z',
        checkConsentRevocation: notRevoked,
      })
    ).toThrow('requested_scope must be a subset of consent.scope.');
  });

  it('mint con permissions inválidos -> throw', () => {
    expect(() =>
      mintCapability({
        consent: buildConsent(),
        requested_scope: [{ type: 'content', ref: REF_A }],
        requested_permissions: ['aggregate'],
        issued_at: '2026-02-01T00:00:00Z',
        expires_at: '2026-03-01T00:00:00Z',
        checkConsentRevocation: notRevoked,
      })
    ).toThrow('requested_permissions must be a subset of consent.permissions.');
  });

  it('mint con expires inválido -> throw', () => {
    expect(() =>
      mintCapability({
        consent: buildConsent(),
        requested_scope: [{ type: 'content', ref: REF_A }],
        requested_permissions: ['read'],
        issued_at: '2026-02-01T00:00:00Z',
        expires_at: '2027-01-01T00:00:00Z',
        checkConsentRevocation: notRevoked,
      })
    ).toThrow('expires_at cannot exceed consent.expires_at.');
  });

  it('verify válido', () => {
    const capability = mintFixture();

    const result = verifyCapability(capability);
    expect(result.valid).toBe(true);
  });

  it('verify con hash incorrecto -> invalid', () => {
    const capability = mintFixture();

    const invalid = {
      ...capability,
      capability_hash: 'f'.repeat(64),
    };

    const result = verifyCapability(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Capability hash integrity mismatch.');
  });

  it('evaluate active', () => {
    const capability = mintFixture();

    const state = evaluateCapabilityState(capability, { now: new Date('2026-02-15T00:00:00Z'), checkRevocation: notRevoked });
    expect(state.state).toBe('active');
  });

  it('evaluate expired', () => {
    const capability = mintFixture();

    const state = evaluateCapabilityState(capability, { now: new Date('2026-04-01T00:00:00Z'), checkRevocation: notRevoked });
    expect(state.state).toBe('expired');
  });

  it('evaluate not_yet_active', () => {
    const capability = mintCapability({
      consent: buildConsent(),
      requested_scope: [{ type: 'content', ref: REF_A }],
      requested_permissions: ['read'],
      issued_at: '2026-02-01T00:00:00Z',
      not_before: '2026-02-10T00:00:00Z',
      expires_at: '2026-03-01T00:00:00Z',
      marketMakerId: 'mm-01',
      checkConsentRevocation: notRevoked,
    });

    const state = evaluateCapabilityState(capability, { now: new Date('2026-02-05T00:00:00Z'), checkRevocation: notRevoked });
    expect(state.state).toBe('not_yet_active');
  });

  it('evaluate revoked', () => {
    const capability = mintFixture();

    const state = evaluateCapabilityState(capability, {
      now: new Date('2026-02-15T00:00:00Z'),
      checkRevocation: revoked,
    });

    expect(state.state).toBe('revoked');
  });

  it('FAIL-CLOSED REGRESSION: unknown revocation status blocks even though the capability has not expired', () => {
    const capability = mintFixture();
    const unavailable = createStaticRevocationCheck({
      status: 'unknown',
      checkedAt: '2026-02-15T00:00:00Z',
      errorCode: 'REVOCATION_LOOKUP_TIMEOUT',
      category: 'timeout',
      retryable: true,
    });

    const state = evaluateCapabilityState(capability, { now: new Date('2026-02-15T00:00:00Z'), checkRevocation: unavailable });

    expect(state.state).toBe('revocation_unknown');
    expect(
      projectCapabilityScopeMatch(capability, {
        requested_scope: [{ type: 'content', ref: REF_A }],
        requested_permissions: ['read'],
        now: new Date('2026-02-15T00:00:00Z'),
        checkRevocation: unavailable,
      })
    ).toBe(false);
  });

  it('access permitido', () => {
    const capability = mintFixture();

    expect(
      projectCapabilityScopeMatch(capability, {
        requested_scope: [{ type: 'content', ref: REF_A }],
        requested_permissions: ['read'],
        subject: SUBJECT,
        grantee: GRANTEE,
        marketMakerId: 'mm-01',
        now: new Date('2026-02-15T00:00:00Z'),
        checkRevocation: notRevoked,
      })
    ).toBe(true);
  });

  it('access con scope fuera -> deny', () => {
    const capability = mintFixture();

    expect(
      projectCapabilityScopeMatch(capability, {
        requested_scope: [{ type: 'pack', ref: REF_B }],
        requested_permissions: ['read'],
        now: new Date('2026-02-15T00:00:00Z'),
        checkRevocation: notRevoked,
      })
    ).toBe(false);
  });

  it('access con permission fuera -> deny', () => {
    const capability = mintFixture();

    expect(
      projectCapabilityScopeMatch(capability, {
        requested_scope: [{ type: 'content', ref: REF_A }],
        requested_permissions: ['derive'],
        now: new Date('2026-02-15T00:00:00Z'),
        checkRevocation: notRevoked,
      })
    ).toBe(false);
  });

  it('binding mismatch -> deny', () => {
    const capability = mintFixture();

    expect(
      projectCapabilityScopeMatch(capability, {
        requested_scope: [{ type: 'content', ref: REF_A }],
        requested_permissions: ['read'],
        subject: 'did:key:z6MkDifferentSubject1234567890abc',
        now: new Date('2026-02-15T00:00:00Z'),
        checkRevocation: notRevoked,
      })
    ).toBe(false);
  });
});
