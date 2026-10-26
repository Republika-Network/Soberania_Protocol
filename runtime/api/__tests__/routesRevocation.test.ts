import { buildConsentObject as buildUnsignedConsentObject } from '../../../consent';
import { mintCapability } from '../../../protocol/capability';
import { InMemoryRevocationRegistry, revokeCapabilityToken, revokeConsent } from '../../../capability';
import { isMeteredEndpoint } from '../../usage';
import { executeRoute, isContainmentEndpoint, DEFAULT_RUNTIME_CORE, type RuntimeCore } from '../routes';
import type { RuntimeCaller } from '../../auth/apiKeys';
import { testSubjectSigner, signTestConsent } from '../../../tests/helpers/consentSigning';

// Consents in these tests are signed by their subject; unsigned consents authorize nothing.
const buildConsentObject: typeof buildUnsignedConsentObject = (...args) =>
  signTestConsent(buildUnsignedConsentObject(...args));

// An operator key holding the explicitly granted admin role.
const ADMIN: RuntimeCaller = { owner: 'operator-admin', principals: [], roles: ['admin'] };

const SUBJECT = testSubjectSigner('subject').did;
const GRANTEE = testSubjectSigner('grantee').did;
const REF_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function alwaysNotRevoked() {
  return { status: 'verified_not_revoked' as const, subjectId: 'fixture', subjectType: 'capability_grant' as const, checkedAt: new Date().toISOString(), sourceVersion: 'v1' };
}

function fixtureConsent() {
  return buildConsentObject(SUBJECT, GRANTEE, 'grant', [{ type: 'content', ref: REF_A }], ['read'], {
    now: new Date('2026-01-01T00:00:00Z'),
    expires_at: '2026-12-31T00:00:00Z',
  });
}

function mintFixtureCapability() {
  return mintCapability({
    consent: fixtureConsent(),
    requested_scope: [{ type: 'content', ref: REF_A }],
    requested_permissions: ['read'],
    issued_at: '2026-02-01T00:00:00Z',
    expires_at: '2026-03-01T00:00:00Z',
    checkConsentRevocation: () => alwaysNotRevoked(),
  });
}

// Each test gets its own core with its own revocation registry: revocation state is never
// process-global, and the routes read only the registry the core was built with.
const CLOCK = () => new Date('2026-02-15T00:00:00Z');
let core: RuntimeCore;
beforeEach(() => {
  core = { ...DEFAULT_RUNTIME_CORE, revocationRegistry: new InMemoryRevocationRegistry(), now: CLOCK };
});

const mintPayload = (consent = fixtureConsent()) => ({
  consent,
  requested_scope: [{ type: 'content', ref: REF_A }],
  requested_permissions: ['read'],
  issued_at: '2026-02-01T00:00:00Z',
  expires_at: '2026-03-01T00:00:00Z',
});

describe('runtime/api/routes.ts — /enforcement/evaluate and /execution/authorize actually check revocation', () => {
  it('REGRESSION (was fail-open): a revoked capability is denied via the real API route, not silently allowed', () => {
    const capability = mintFixtureCapability();

    // Before revocation: the route allows the request.
    const before = executeRoute('/enforcement/evaluate', {
      consent: fixtureConsent(),
      capability,
      requested_scope: [{ type: 'content', ref: REF_A }],
      requested_permissions: ['read'],
    }, core, ADMIN);
    expect(before.success).toBe(true);
    expect(before.data && 'allowed' in before.data ? before.data.allowed : undefined).toBe(true);

    // Operator containment of this token, through the core's registry.
    revokeCapabilityToken(capability.capability_hash, core.revocationRegistry);

    const after = executeRoute('/enforcement/evaluate', {
      consent: fixtureConsent(),
      capability,
      requested_scope: [{ type: 'content', ref: REF_A }],
      requested_permissions: ['read'],
    }, core, ADMIN);

    expect(after.success).toBe(true);
    expect(after.data && 'allowed' in after.data ? after.data.allowed : undefined).toBe(false);
    expect(after.data && 'reason_code' in after.data ? after.data.reason_code : undefined).toBe('CAPABILITY_REVOKED');
  });

  it('REGRESSION (was fail-open): /execution/authorize also denies a revoked capability', () => {
    const capability = mintFixtureCapability();
    revokeCapabilityToken(capability.capability_hash, core.revocationRegistry);

    const result = executeRoute('/execution/authorize', {
      consent: fixtureConsent(),
      capability,
      requested_scope: [{ type: 'content', ref: REF_A }],
      requested_permissions: ['read'],
      execution_target: { adapter: 'hrkey', operation: 'read_content' },
    }, core, ADMIN);

    expect(result.success).toBe(true);
    expect(result.data && 'authorized' in result.data ? result.data.authorized : undefined).toBe(false);
  });

  it('a client-supplied `isRevoked` field in the JSON payload is ignored (cannot be used to fake "not revoked")', () => {
    const capability = mintFixtureCapability();
    revokeCapabilityToken(capability.capability_hash, core.revocationRegistry);

    const result = executeRoute('/enforcement/evaluate', {
      consent: fixtureConsent(),
      capability,
      requested_scope: [{ type: 'content', ref: REF_A }],
      requested_permissions: ['read'],
      isRevoked: () => false, // attempted spoof; must have no effect
    } as unknown, core, ADMIN);

    expect(result.data && 'allowed' in result.data ? result.data.allowed : undefined).toBe(false);
  });

  it('a consent revoked by its subject denies every capability minted from it, with an earlier `now` too', () => {
    const consent = fixtureConsent();
    const capability = mintFixtureCapability();
    revokeConsent(
      { consent_hash: consent.consent_hash, revocation_consent_hash: 'e'.repeat(64), subject: SUBJECT, revoked_at: '2026-02-10T00:00:00Z' },
      core.revocationRegistry
    );

    for (const clock of ['2026-02-15T00:00:00Z', '2026-02-05T00:00:00Z']) {
      const result = executeRoute('/enforcement/evaluate', {
        consent,
        capability,
        requested_scope: [{ type: 'content', ref: REF_A }],
        requested_permissions: ['read'],
      }, { ...core, now: () => new Date(clock) }, ADMIN);
      expect(result.data && 'allowed' in result.data ? result.data.allowed : undefined).toBe(false);
      expect(result.data && 'reason_code' in result.data ? result.data.reason_code : undefined).toBe('CONSENT_INACTIVE');
    }
  });

  it('revocation state lives in the core, not in the process: another core does not see it', () => {
    const capability = mintFixtureCapability();
    revokeCapabilityToken(capability.capability_hash, core.revocationRegistry);
    const other: RuntimeCore = { ...DEFAULT_RUNTIME_CORE, revocationRegistry: new InMemoryRevocationRegistry(), now: CLOCK };
    const result = executeRoute('/enforcement/evaluate', {
      consent: fixtureConsent(),
      capability,
      requested_scope: [{ type: 'content', ref: REF_A }],
      requested_permissions: ['read'],
    }, other, ADMIN);
    expect(result.data && 'allowed' in result.data ? result.data.allowed : undefined).toBe(true);
  });
});

describe('runtime/api/routes.ts — /capability/mint reads consent revocation from the core registry', () => {
  it('mints from a live consent and refuses once the subject has revoked it', () => {
    const consent = fixtureConsent();
    const live = executeRoute('/capability/mint', mintPayload(consent), core, ADMIN);
    expect(live.success).toBe(true);

    revokeConsent(
      { consent_hash: consent.consent_hash, revocation_consent_hash: 'e'.repeat(64), subject: SUBJECT, revoked_at: '2026-02-10T00:00:00Z' },
      core.revocationRegistry
    );
    const revoked = executeRoute('/capability/mint', mintPayload(consent), core, ADMIN);
    expect(revoked.success).toBe(false);
    expect(revoked.error?.message).toMatch(/revoked/);
  });

  it('a client-supplied checkConsentRevocation field cannot force an allow for a revoked consent', () => {
    const consent = fixtureConsent();
    revokeConsent(
      { consent_hash: consent.consent_hash, revocation_consent_hash: 'e'.repeat(64), subject: SUBJECT, revoked_at: '2026-02-10T00:00:00Z' },
      core.revocationRegistry
    );
    const result = executeRoute('/capability/mint', {
      ...mintPayload(consent),
      checkConsentRevocation: () => ({ status: 'verified_not_revoked' }), // attempted spoof; must be overwritten server-side
    } as unknown, core, ADMIN);
    expect(result.success).toBe(false);
    expect(result.error?.message).toMatch(/revoked/);
  });

  it('fails closed when the core registry cannot answer', () => {
    const broken: RuntimeCore = {
      ...DEFAULT_RUNTIME_CORE,
      now: CLOCK,
      revocationRegistry: {
        isRevoked: () => { throw new Error('store down'); },
        revoke: () => undefined,
        isConsentRevoked: () => { throw new Error('store down'); },
        revokeConsent: () => undefined,
      },
    };
    const minted = executeRoute('/capability/mint', mintPayload(), broken, ADMIN);
    expect(minted.success).toBe(false);
    expect(minted.error?.message).toMatch(/revocation_unknown/);

    const evaluated = executeRoute('/enforcement/evaluate', {
      consent: fixtureConsent(),
      capability: mintFixtureCapability(),
      requested_scope: [{ type: 'content', ref: REF_A }],
      requested_permissions: ['read'],
    }, broken, ADMIN);
    expect(evaluated.data && 'allowed' in evaluated.data ? evaluated.data.allowed : undefined).toBe(false);
  });
});

describe('runtime/api/routes.ts — billing safety override (ADR §13)', () => {
  it('/access/grant/revoke is a containment endpoint and is never metered/priced', () => {
    expect(isContainmentEndpoint('/access/grant/revoke')).toBe(true);
    expect(isMeteredEndpoint('/access/grant/revoke')).toBe(false);
  });

  it('revoking a grant end-to-end through executeRoute succeeds and is idempotent', () => {
    const core = DEFAULT_RUNTIME_CORE;
    const request = core.controlPlaneService.createAccessRequest({
      subject_id: 'subject-route-1',
      requester_id: 'requester-route-1',
      dataset_id: 'dataset-1',
      purpose: 'analysis',
      requested_scope: ['content:a'],
    });
    const { grant } = core.controlPlaneService.decideAccessRequest({ request_id: request.request_id, decision: 'approve' });
    expect(grant).toBeDefined();

    const first = executeRoute('/access/grant/revoke', { grant_id: grant!.grant_id, idempotency_key: 'route-idem-1' }, DEFAULT_RUNTIME_CORE, ADMIN);
    const second = executeRoute('/access/grant/revoke', { grant_id: grant!.grant_id, idempotency_key: 'route-idem-1' }, DEFAULT_RUNTIME_CORE, ADMIN);

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect((first.data as { revocationId?: string })?.revocationId).toBe((second.data as { revocationId?: string })?.revocationId);
  });

  it('idempotency conflict on /access/grant/revoke is surfaced as a stable error, not a silent overwrite', () => {
    const core = DEFAULT_RUNTIME_CORE;
    const requestA = core.controlPlaneService.createAccessRequest({
      subject_id: 'subject-route-a',
      requester_id: 'requester-route-a',
      dataset_id: 'dataset-1',
      purpose: 'analysis',
      requested_scope: ['content:a'],
    });
    const { grant: grantA } = core.controlPlaneService.decideAccessRequest({ request_id: requestA.request_id, decision: 'approve' });
    const requestB = core.controlPlaneService.createAccessRequest({
      subject_id: 'subject-route-b',
      requester_id: 'requester-route-b',
      dataset_id: 'dataset-1',
      purpose: 'analysis',
      requested_scope: ['content:a'],
    });
    const { grant: grantB } = core.controlPlaneService.decideAccessRequest({ request_id: requestB.request_id, decision: 'approve' });

    executeRoute('/access/grant/revoke', { grant_id: grantA!.grant_id, idempotency_key: 'route-conflict-1' }, DEFAULT_RUNTIME_CORE, ADMIN);
    const conflict = executeRoute('/access/grant/revoke', { grant_id: grantB!.grant_id, idempotency_key: 'route-conflict-1' }, DEFAULT_RUNTIME_CORE, ADMIN);

    expect(conflict.success).toBe(false);
    expect(conflict.error?.code).toBe('IDEMPOTENCY_CONFLICT');
  });
});
