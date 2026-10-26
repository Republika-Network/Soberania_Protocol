/**
 * Hosted authorization hardening.
 *
 * - Time-bound decisions on the hosted routes run at the core's trusted clock. A caller-supplied
 *   `now` is refused, so an expired consent, capability or credential cannot be revived by
 *   presenting a past timestamp. Trusted embedders and tests inject the clock on the core.
 * - A control-plane grant is revoked only by an authenticated party with authority over that
 *   stored grant (its subject, its requester, or an admin), never by whoever names an identifier
 *   in the body. Idempotency keys are scoped per revoker, so one party cannot squat another's key.
 * - A consent record's revocation is read from an authoritative port keyed by consent_id. The
 *   presented record's unsigned `revoked_at` can only take access away; without a port, or with
 *   one that cannot answer, every decision is a denial.
 */
import { buildConsentObject as buildUnsignedConsentObject } from '../../consent';
import { InMemoryRevocationRegistry } from '../../capability';
import { mintCapability } from '../../protocol/capability';
import {
  CONSENT_DECISION_REASON_CODES,
  evaluateConsent,
  issueCapabilityToken,
  type ConsentDecisionOptions,
  type ConsentRecord,
} from '../../protocol/consent';
import {
  ALWAYS_UNKNOWN_REVOCATION_CHECK,
  createStaticRevocationCheck,
  revokedStatus,
  verifiedNotRevokedStatus,
} from '../../protocol/revocation';
import { DEFAULT_RUNTIME_CORE, executeRoute, type RuntimeCore } from '../../runtime/api/routes';
import type { RuntimeCaller } from '../../runtime/auth/apiKeys';
import {
  AccessGrantRequesterMismatchError,
  AccessGrantRevocationUnauthorizedError,
  ControlPlaneService,
  RevocationIdempotencyConflictError,
} from '../../runtime/controlPlane';
import { DataAccessService } from '../../runtime/access/service';
import { RlusdPayoutExecutorService } from '../../runtime/payout/rlusdPayoutExecutor.service';
import { RlusdPayoutAdapter } from '../../runtime/payout/payoutAdapters/rlusd.adapter';
import {
  DEFAULT_TRUST_ISSUERS,
  InMemoryTrustService,
  identityRegistrationPayload,
} from '../../enterprise/src/assurance/trust';
import { createRuntimeAuthority, createTrustedKeySet, signPayload } from '@aoc-runtime/crypto';
import { signTestConsent, signTestConsentRecord, testSubjectSigner } from '../helpers/consentSigning';

const buildConsentObject: typeof buildUnsignedConsentObject = (...args) =>
  signTestConsent(buildUnsignedConsentObject(...args));

const SUBJECT = testSubjectSigner('subject').did;
const GRANTEE = testSubjectSigner('grantee').did;
const REF_A = 'a'.repeat(64);
const ADMIN: RuntimeCaller = { owner: 'operator-admin', principals: [], roles: ['admin'] };
const caller = (principals: string[]): RuntimeCaller => ({ owner: `key:${principals.join('+')}`, principals, roles: [] });
const at = (iso: string) => () => new Date(iso);
const coreAt = (iso: string, overrides: Partial<RuntimeCore> = {}): RuntimeCore =>
  ({ ...DEFAULT_RUNTIME_CORE, revocationRegistry: new InMemoryRevocationRegistry(), controlPlaneService: new ControlPlaneService(), now: at(iso), ...overrides });
const data = (result: ReturnType<typeof executeRoute>) => result.data as Record<string, unknown> | undefined;

describe('V2: hosted decisions run at the server clock', () => {
  const consent = buildConsentObject(SUBJECT, GRANTEE, 'grant', [{ type: 'content', ref: REF_A }], ['read'], {
    now: new Date('2026-01-01T00:00:00Z'),
    expires_at: '2026-12-31T00:00:00Z',
  });
  const capability = mintCapability({
    consent,
    requested_scope: [{ type: 'content', ref: REF_A }],
    requested_permissions: ['read'],
    issued_at: '2026-02-01T00:00:00Z',
    expires_at: '2026-03-01T00:00:00Z',
    checkConsentRevocation: createStaticRevocationCheck(verifiedNotRevokedStatus({ subjectId: 'fixture', subjectType: 'consent_grant' })),
  });
  const body = { consent, capability, requested_scope: [{ type: 'content', ref: REF_A }], requested_permissions: ['read'], grantee: GRANTEE };

  it('N10: an expired capability is denied at the server clock, and a past `now` in the body is refused', () => {
    const core = coreAt('2026-06-01T00:00:00Z');
    const denied = executeRoute('/enforcement/evaluate', body, core, caller([GRANTEE]));
    expect(data(denied)?.allowed).toBe(false);
    expect(data(denied)?.reason_code).toBe('CAPABILITY_EXPIRED');
    for (const endpoint of ['/enforcement/evaluate', '/execution/authorize'] as const) {
      const revived = executeRoute(endpoint, { ...body, now: '2026-02-15T00:00:00Z', execution_target: { adapter: 'x', operation: 'read' } }, core, caller([GRANTEE]));
      expect(revived.success).toBe(false);
      expect(revived.error?.code).toBe('INVALID_REQUEST');
      expect(revived.error?.message).toMatch(/server clock/);
    }
  });

  it('positive control: the trusted core clock is what decides', () => {
    const live = executeRoute('/enforcement/evaluate', body, coreAt('2026-02-15T00:00:00Z'), caller([GRANTEE]));
    expect(data(live)?.allowed).toBe(true);
    const exec = executeRoute('/execution/authorize', { ...body, execution_target: { adapter: 'x', operation: 'read' } }, coreAt('2026-02-15T00:00:00Z'), caller([GRANTEE]));
    expect(data(exec)?.authorized).toBe(true);
  });

  describe('N11: identity-backed data access and verification', () => {
    const issuer = createRuntimeAuthority('runtime:kyc', 'kyc-global-v1');
    const provenance = { runtimeSource: 'test', timestamp: '2026-01-01T00:00:00.000Z' };
    const credential = {
      credential_ref: 'cred:1', subject_hash: 'subject:1', issuer_id: 'kyc-global-v1', credential_hash: 'x', metadata_hash: 'y',
      kyc_level: 'institutional' as const, issued_at: '2026-01-01T00:00:00.000Z', expires_at: '2026-03-01T00:00:00.000Z',
    };
    const identityConsent = { consent_id: 'consent:1', subject_hash: 'subject:1', consumer_id: 'consumer:1', issuer_id: 'kyc-global-v1', granted_at: '2026-01-01T00:00:00.000Z' };
    const trustCore = (clock: string): RuntimeCore => {
      const trust = new InMemoryTrustService(DEFAULT_TRUST_ISSUERS, { trustedIssuerKeys: createTrustedKeySet([issuer.identity]) });
      trust.registerCredential({ ...credential, issuer_signature: signPayload(identityRegistrationPayload('credential', credential), issuer.privateKey, issuer.identity, provenance) });
      trust.grantConsent({ ...identityConsent, issuer_signature: signPayload(identityRegistrationPayload('consent', identityConsent), issuer.privateKey, issuer.identity, provenance) });
      const payoutExecutor = new RlusdPayoutExecutorService(trust, new RlusdPayoutAdapter());
      return coreAt(clock, { trustService: trust, dataAccessService: new DataAccessService(trust), payoutExecutor });
    };
    const accessBody = { subject_hash: 'subject:1', consumer_id: 'consumer:1', dataset_id: 'ds', purpose: 'p' };
    const verifyBody = { subject_hash: 'subject:1', consumer_id: 'consumer:1' };

    it('an expired credential denies at the server clock; a past `now` in the body is refused', () => {
      const core = trustCore('2026-06-01T00:00:00Z');
      expect(data(executeRoute('/data/access', accessBody, core, caller(['consumer:1'])))?.allowed).toBe(false);
      expect(data(executeRoute('/trust/verify', verifyBody, core, caller(['consumer:1'])))?.valid).toBe(false);
      for (const endpoint of ['/data/access', '/trust/verify'] as const) {
        const revived = executeRoute(endpoint, { ...accessBody, now: '2026-02-01T00:00:00.000Z' }, core, caller(['consumer:1']));
        expect(revived.success).toBe(false);
        expect(revived.error?.code).toBe('INVALID_REQUEST');
      }
    });

    it('positive control: at a trusted clock within validity the same requests succeed', () => {
      const core = trustCore('2026-02-01T00:00:00Z');
      expect(data(executeRoute('/data/access', accessBody, core, caller(['consumer:1'])))?.allowed).toBe(true);
      expect(data(executeRoute('/trust/verify', verifyBody, core, caller(['consumer:1'])))?.valid).toBe(true);
    });
  });
});

describe('V3/V4: control-plane grant revocation is bound to the stored grant and the authenticated revoker', () => {
  function grantFor(core: RuntimeCore, subject: string, requester: string): string {
    const created = executeRoute('/access/request', { subject_id: subject, requester_id: requester, dataset_id: 'ds', purpose: 'p' }, core, caller([requester]));
    const requestId = (data(created) as { request_id: string }).request_id;
    const approved = executeRoute('/access/request/decision', { request_id: requestId, subject_id: subject, decision: 'approve' }, core, caller([subject]));
    return ((data(approved) as { grant: { grant_id: string } }).grant).grant_id;
  }
  const activeFor = (core: RuntimeCore, requester: string) =>
    (executeRoute('/access/grants/active', { requester_id: requester }, core, caller([requester])).data as unknown[]).length;

  it('N5: a caller naming itself as requester cannot revoke a grant it is not party to', () => {
    const core = coreAt('2026-02-15T00:00:00Z');
    const grantId = grantFor(core, 'subject:s1', 'requester:victim-co');
    const attack = executeRoute('/access/grant/revoke', { grant_id: grantId, requester_id: 'requester:attacker' }, core, caller(['requester:attacker']));
    expect(attack.success).toBe(false);
    expect(attack.error?.code).toBe('CALLER_NOT_AUTHORIZED');
    const bare = executeRoute('/access/grant/revoke', { grant_id: grantId }, core, caller(['requester:attacker']));
    expect(bare.success).toBe(false);
    expect(bare.error?.code).toBe('CALLER_NOT_AUTHORIZED');
    expect(activeFor(core, 'requester:victim-co')).toBe(1);
  });

  it('positive controls: the grant\'s subject, its requester and an admin can revoke it', () => {
    for (const [who, principal] of [['subject', 'subject:s1'], ['requester', 'requester:victim-co']] as const) {
      const core = coreAt('2026-02-15T00:00:00Z');
      const grantId = grantFor(core, 'subject:s1', 'requester:victim-co');
      const result = executeRoute('/access/grant/revoke', { grant_id: grantId, reason: `by ${who}` }, core, caller([principal]));
      expect(result.success).toBe(true);
      expect((data(result) as { grant: { status: string } }).grant.status).toBe('revoked');
      expect(activeFor(core, 'requester:victim-co')).toBe(0);
    }
    const core = coreAt('2026-02-15T00:00:00Z');
    const grantId = grantFor(core, 'subject:s1', 'requester:victim-co');
    expect(executeRoute('/access/grant/revoke', { grant_id: grantId }, core, ADMIN).success).toBe(true);
  });

  it('body identifiers that contradict the stored grant are refused even for an authorized revoker', () => {
    const service = new ControlPlaneService();
    const request = service.createAccessRequest({ subject_id: 'subject:s1', requester_id: 'requester:r1', dataset_id: 'ds', purpose: 'p', requested_scope: [] });
    const { grant } = service.decideAccessRequest({ request_id: request.request_id, decision: 'approve' });
    const subject = { owner: 'key:s1', principals: ['subject:s1'] };
    expect(() => service.revokeGrant({ grant_id: grant!.grant_id, requester_id: 'requester:other', authority: subject })).toThrow(AccessGrantRequesterMismatchError);
    expect(() => service.revokeGrant({ grant_id: grant!.grant_id, authority: { owner: 'key:x', principals: ['subject:other'] } })).toThrow(AccessGrantRevocationUnauthorizedError);
    expect(() => service.revokeGrant({ grant_id: grant!.grant_id, authority: undefined as never })).toThrow(AccessGrantRevocationUnauthorizedError);
    expect(service.listActiveGrants({ subject_id: 'subject:s1' })).toHaveLength(1);
    expect(service.revokeGrant({ grant_id: grant!.grant_id, subject_id: 'subject:s1', requester_id: 'requester:r1', authority: subject }).grant.status).toBe('revoked');
  });

  it('N6: an idempotency key used by one party does not block or expose another party\'s revocation', () => {
    const core = coreAt('2026-02-15T00:00:00Z');
    const attackerGrant = grantFor(core, 'subject:attacker', 'requester:attacker');
    const victimGrant = grantFor(core, 'subject:s1', 'requester:x');
    const attackerFirst = executeRoute('/access/grant/revoke', { grant_id: attackerGrant, idempotency_key: 'revoke-1' }, core, caller(['subject:attacker']));
    expect(attackerFirst.success).toBe(true);

    const victim = executeRoute('/access/grant/revoke', { grant_id: victimGrant, idempotency_key: 'revoke-1' }, core, caller(['subject:s1']));
    expect(victim.success).toBe(true);
    expect((data(victim) as { grant: { grant_id: string }; idempotentReplay: boolean }).grant.grant_id).toBe(victimGrant);
    expect((data(victim) as { idempotentReplay: boolean }).idempotentReplay).toBe(false);

    // Each party's replay returns only its own revocation.
    const attackerReplay = executeRoute('/access/grant/revoke', { grant_id: attackerGrant, idempotency_key: 'revoke-1' }, core, caller(['subject:attacker']));
    expect((data(attackerReplay) as { grant: { grant_id: string }; idempotentReplay: boolean }).grant.grant_id).toBe(attackerGrant);
    expect((data(attackerReplay) as { idempotentReplay: boolean }).idempotentReplay).toBe(true);
    const victimReplay = executeRoute('/access/grant/revoke', { grant_id: victimGrant, idempotency_key: 'revoke-1' }, core, caller(['subject:s1']));
    expect((data(victimReplay) as { revocationId: string }).revocationId).toBe((data(victim) as { revocationId: string }).revocationId);
    // The attacker cannot learn the victim's revocation by presenting the victim's grant under its key.
    const probe = executeRoute('/access/grant/revoke', { grant_id: victimGrant, idempotency_key: 'revoke-1' }, core, caller(['subject:attacker']));
    expect(probe.success).toBe(false);
    expect(probe.error?.code).toBe('CALLER_NOT_AUTHORIZED');
  });

  it('replay safety within one revoker is unchanged: same key, different payload is a conflict', () => {
    const service = new ControlPlaneService();
    const authority = { owner: 'operator', principals: [] as string[], admin: true };
    const mk = (subject: string) => {
      const request = service.createAccessRequest({ subject_id: subject, requester_id: 'r', dataset_id: 'ds', purpose: 'p', requested_scope: [] });
      return service.decideAccessRequest({ request_id: request.request_id, decision: 'approve' }).grant!.grant_id;
    };
    const a = mk('subject:a');
    const b = mk('subject:b');
    const first = service.revokeGrant({ grant_id: a, idempotency_key: 'k', authority });
    expect(service.revokeGrant({ grant_id: a, idempotency_key: 'k', authority }).revocationId).toBe(first.revocationId);
    expect(() => service.revokeGrant({ grant_id: b, idempotency_key: 'k', authority })).toThrow(RevocationIdempotencyConflictError);
    expect(service.listActiveGrants({ subject_id: 'subject:b' })).toHaveLength(1);
    expect(service.listRevocationEvidence(a)[0].revoked_by).toBe('operator');
  });
});

describe('V5: consent-record revocation is authoritative, not a field on the presented record', () => {
  const subject = testSubjectSigner('record-subject');
  const record = (): ConsentRecord => signTestConsentRecord({
    consent_id: 'c-1', subject_id: subject.did, requester_id: 'req:1', resource: 'dataset:1', actions: ['read'], granted: true,
    created_at: '2025-01-01T00:00:00.000Z', expires_at: null, revoked_at: null, consent_hash: null,
  });
  const request = { subject_id: subject.did, requester_id: 'req:1', resource: 'dataset:1', action: 'read', requested_at: '2025-03-01T00:00:00.000Z' };
  const allowed = { allowed: true, reason_code: 'ALLOW' as const, evaluated_at: '2025-03-01T00:00:00.000Z', consent_id: 'c-1' };
  const clear: ConsentDecisionOptions = { checkRevocation: createStaticRevocationCheck(verifiedNotRevokedStatus({ subjectId: 'c-1', subjectType: 'consent_grant' })) };
  const revoked: ConsentDecisionOptions = {
    checkRevocation: createStaticRevocationCheck(revokedStatus({ subjectId: 'c-1', subjectType: 'consent_grant', revocationId: 'rev-1', reasonCode: 'REVOKED', revokedAt: '2025-02-01T00:00:00.000Z' })),
  };

  it('N7: stripping revoked_at from the presented record does not un-revoke it', () => {
    const stripped = { ...record(), revoked_at: null };
    expect(evaluateConsent(request, stripped, revoked).reason_code).toBe(CONSENT_DECISION_REASON_CODES.DENY_REVOKED);
    expect(() => issueCapabilityToken({ consent: stripped, request, decision: allowed }, 'operator-secret', revoked)).toThrow('DECISION_NOT_ALLOWED');
  });

  it('fails closed without a port, with an unknown answer, or with a throwing port', () => {
    const unknownPort: ConsentDecisionOptions = { checkRevocation: ALWAYS_UNKNOWN_REVOCATION_CHECK };
    const throwing: ConsentDecisionOptions = { checkRevocation: () => { throw new Error('registry down'); } };
    for (const options of [undefined as unknown as ConsentDecisionOptions, {} as ConsentDecisionOptions, unknownPort, throwing]) {
      expect(evaluateConsent(request, record(), options).reason_code).toBe(CONSENT_DECISION_REASON_CODES.DENY_REVOCATION_UNKNOWN);
      expect(() => issueCapabilityToken({ consent: record(), request, decision: allowed }, 'operator-secret', options)).toThrow('DECISION_NOT_ALLOWED');
    }
  });

  it('positive control: a record the port reports clear is allowed and issues a token', () => {
    expect(evaluateConsent(request, record(), clear).reason_code).toBe(CONSENT_DECISION_REASON_CODES.ALLOW);
    expect(issueCapabilityToken({ consent: record(), request, decision: allowed }, 'operator-secret', clear).consent_id).toBe('c-1');
  });

  it('a revoked_at on the presented record can only deny', () => {
    expect(evaluateConsent(request, { ...record(), revoked_at: '2025-02-01T00:00:00.000Z' }, clear).reason_code).toBe(CONSENT_DECISION_REASON_CODES.DENY_REVOKED);
    expect(evaluateConsent(request, { ...record(), revoked_at: '2025-04-01T00:00:00.000Z' }, clear).reason_code).toBe(CONSENT_DECISION_REASON_CODES.ALLOW);
  });
});
