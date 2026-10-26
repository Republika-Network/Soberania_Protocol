/**
 * Consent and capability enforcement.
 *
 * A capability is honoured only together with the consent it was minted from and only
 * within that consent; data packs only honour consents from their owner; runtime consent
 * grants count only when signed by their subject (and delegate); hosted callers act only
 * for the principals their API key was configured for; identity records need their
 * issuer's signature.
 *
 * Consents (and consent records) authorize only with their subject's did:key signature
 * (consent/proof.ts): unsigned, wrongly signed, altered or re-attached proofs are refused
 * on every path that stores, mints from, evaluates, consumes or revokes them.
 */
import {
  buildConsentObject as buildUnsignedConsentObject,
  canonicalizeConsentPayload,
  computeConsentHash,
  createSubjectConsentProof,
  resolveDidKeyEd25519,
  signConsentObject,
  SubjectConsentProofError,
  validateConsentObject,
  verifyConsentObjectProof,
} from '../../consent';
import type { ConsentObjectV1 } from '../../consent';
import { doesConsentAllowScope, evaluateConsent as evaluateConsentRaw, evaluateConsentState, issueCapabilityToken as issueCapabilityTokenRaw, signConsentRecord, type ConsentRecord } from '../../protocol/consent';
import {
  canonicalizeCapabilityPayload,
  computeCapabilityHash,
  mintCapabilityToken,
  resetNonceRegistry,
  verifyCapabilityToken as verifyCapabilityTokenRaw,
} from '../../capability';
import { evaluateCapabilityAccess as evaluateCapabilityAccessRaw, capabilityAccessReasonCodes } from '../../enforcement';
import { consumeCapabilityAccess as consumeCapabilityAccessRaw } from '../../protocol/capabilities';
import { verifyCapabilityConsentBinding } from '../../protocol/capabilities/consentBinding';
import { enforceCapability as enforceCapabilityRaw } from '../../protocol/capabilities/capabilityEnforcer';
import { interpretWithCapability as interpretWithCapabilityRaw } from '../../interpreter';
import { createInMemoryVault } from '../../vault';
import { buildPackManifest as buildUnsignedPackManifest } from '../../pack';
import type { FieldReference } from '../../pack/types';
import { buildStoragePointer } from '../../storage';
import { mintCapability } from '../../protocol/capability';
import { computeCapabilityDeterministicHash } from '../../protocol/capability/capability-object';
import { ENFORCEMENT_REASON_CODES, evaluateEnforcement } from '../../protocol/enforcement';
import { authorizeExecution } from '../../protocol/execution';
import { createStaticRevocationCheck, revokedStatus, verifiedNotRevokedStatus } from '../../protocol/revocation';
import type { RevocationCheckPort } from '../../protocol/revocation';
import { DEFAULT_RUNTIME_CORE, executeRoute } from '../../runtime/api/routes';
import { InMemoryApiKeyStore, type RuntimeCaller } from '../../runtime/auth/apiKeys';
import * as runtimeSurface from '../../runtime';
import {
  DEFAULT_TRUST_ISSUERS,
  InMemoryTrustService,
  identityRegistrationPayload,
} from '../../enterprise/src/assurance/trust';

import { createRuntimeAuthority, createTrustedKeySet, signPayload, stableHash } from '@aoc-runtime/crypto';
import type { CapabilityRef, ConsentGrant, SignedConsentGrant } from '@aoc-runtime/shared-types';
import { ConsentRuntime } from '@aoc-runtime/consent-runtime';
import { CapabilityRuntime } from '@aoc-runtime/capability-runtime';
import { AuthorizationRuntime } from '@aoc-runtime/authorization-runtime';
import { testSubjectSigner, signTestConsent, signTestPack } from '../helpers/consentSigning';
import { TEST_TRUST_DOMAIN, testContentOwnership } from '../helpers/contentOwnership';
import { InMemoryRevocationRegistry } from '../../capability/registries/InMemoryRevocationRegistry';

// Packs stored in a vault are signed by their subject; an unsigned pack names an owner nobody vouched for.
const buildPackManifest: typeof buildUnsignedPackManifest = (...args) =>
  signTestPack(buildUnsignedPackManifest(...args));


const consentRecordsNotRevoked = { checkRevocation: createStaticRevocationCheck(verifiedNotRevokedStatus({ subjectId: 'fixture', subjectType: 'consent_grant' })) };
const evaluateConsent = (request: unknown, consent: unknown, options = consentRecordsNotRevoked) =>
  evaluateConsentRaw(request, consent, options);
const issueCapabilityToken = (input: Parameters<typeof issueCapabilityTokenRaw>[0], secret: string, options = consentRecordsNotRevoked) =>
  issueCapabilityTokenRaw(input, secret, options);


// Every authorization path reads revocation from an injected registry; these
// tests share one and pass it unless a test supplies its own.
const revocationRegistry = new InMemoryRevocationRegistry();
const evaluateCapabilityAccess: typeof evaluateCapabilityAccessRaw = (input) =>
  evaluateCapabilityAccessRaw({ ...input, registries: { revocationRegistry, ...input.registries } });
const consumeCapabilityAccess: typeof consumeCapabilityAccessRaw = (input) =>
  consumeCapabilityAccessRaw({ ...input, registries: { revocationRegistry, ...input.registries } });
const enforceCapability: typeof enforceCapabilityRaw = (input) =>
  enforceCapabilityRaw({ ...input, registries: { revocationRegistry, ...input.registries } });
const verifyCapabilityToken: typeof verifyCapabilityTokenRaw = (token, consent, opts, registries) =>
  verifyCapabilityTokenRaw(token, consent, opts, { revocationRegistry, ...registries });
const interpretWithCapability: typeof interpretWithCapabilityRaw = (input, dependencies = {}) =>
  interpretWithCapabilityRaw(input, { ...dependencies, registries: { revocationRegistry, ...dependencies.registries } });


// Consents in these tests are signed by their subject; unsigned consents authorize nothing.
const buildConsentObject: typeof buildUnsignedConsentObject = (...args) =>
  signTestConsent(buildUnsignedConsentObject(...args));

const OWNER = testSubjectSigner('subject').did;
const READER = testSubjectSigner('grantee').did;
const OTHER = testSubjectSigner('other').did;
const CONTENT_A = 'a'.repeat(64);
const CONTENT_B = 'b'.repeat(64);
const NOW = new Date('2025-06-15T10:00:00Z');
const SOON = new Date('2025-06-15T10:01:00Z');

beforeEach(() => {
  resetNonceRegistry();
});

function consentFor(subject: string, grantee: string, scope = [{ type: 'content' as const, ref: CONTENT_A }], permissions = ['read']): ConsentObjectV1 {
  return buildConsentObject(subject, grantee, 'grant', scope, permissions, { now: NOW, expires_at: '2026-01-15T14:30:00Z' });
}

/** A token for CONTENT_A/read whose holder rewrote scope and permissions and recomputed its hash. */
function widenedToken() {
  const consent = consentFor(OWNER, READER);
  const token = mintCapabilityToken(consent, [{ type: 'content', ref: CONTENT_A }], ['read'], '2025-06-15T10:05:00Z', { now: NOW }) as Record<string, unknown>;
  const widened: Record<string, unknown> = { ...token, permissions: ['read', 'share'], scope: [{ type: 'content', ref: CONTENT_B }] };
  widened.capability_hash = computeCapabilityHash(canonicalizeCapabilityPayload(widened as never));
  return { consent, token, widened };
}

describe('capability access requires its parent consent and stays within it', () => {
  it('denies a capability evaluated without its consent', () => {
    const { token } = widenedToken();
    const decision = evaluateCapabilityAccess({ capability: token, action: 'read', resource: { type: 'content', ref: CONTENT_A }, now: SOON.toISOString() });
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.CONSENT_INVALID);
  });

  it('denies a capability that references a consent that does not exist', () => {
    const { widened } = widenedToken();
    const fabricated: Record<string, unknown> = { ...widened, consent_ref: 'f'.repeat(64) };
    fabricated.capability_hash = computeCapabilityHash(canonicalizeCapabilityPayload(fabricated as never));
    expect(evaluateCapabilityAccess({ capability: fabricated, action: 'share', resource: { type: 'content', ref: CONTENT_B }, now: SOON.toISOString() }).allowed).toBe(false);
  });

  it('denies a widened capability even when its genuine consent is supplied', () => {
    const { consent, widened } = widenedToken();
    const decision = evaluateCapabilityAccess({ capability: widened, consent, action: 'share', resource: { type: 'content', ref: CONTENT_B }, now: SOON.toISOString() });
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.CONSENT_MISMATCH);
  });

  it('denies a capability whose scope alone exceeds the consent', () => {
    const { consent, token } = widenedToken();
    const wider: Record<string, unknown> = { ...token, scope: [{ type: 'content', ref: CONTENT_B }] };
    wider.capability_hash = computeCapabilityHash(canonicalizeCapabilityPayload(wider as never));
    const decision = evaluateCapabilityAccess({ capability: wider, consent, action: 'read', resource: { type: 'content', ref: CONTENT_B }, now: SOON.toISOString() });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/scope is not covered/);
  });

  it('denies a capability that starts before its consent was issued', () => {
    const { consent, token } = widenedToken();
    const early: Record<string, unknown> = { ...token, issued_at: '2025-06-15T09:00:00Z', not_before: '2025-06-15T09:00:00Z' };
    early.capability_hash = computeCapabilityHash(canonicalizeCapabilityPayload(early as never));
    const lateConsent = buildConsentObject(OWNER, READER, 'grant', [{ type: 'content', ref: CONTENT_A }], ['read'], { now: new Date('2025-06-15T09:30:00Z'), expires_at: '2026-01-15T14:30:00Z' });
    const bound: Record<string, unknown> = { ...early, consent_ref: lateConsent.consent_hash };
    bound.capability_hash = computeCapabilityHash(canonicalizeCapabilityPayload(bound as never));
    const decision = evaluateCapabilityAccess({ capability: bound, consent: lateConsent, action: 'read', resource: { type: 'content', ref: CONTENT_A }, now: SOON.toISOString() });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/before the parent consent was issued/);
    void consent;
  });

  it('denies a capability whose permissions alone exceed the consent', () => {
    const { consent, token } = widenedToken();
    const extra: Record<string, unknown> = { ...token, permissions: ['read', 'share'] };
    extra.capability_hash = computeCapabilityHash(canonicalizeCapabilityPayload(extra as never));
    expect(evaluateCapabilityAccess({ capability: extra, consent, action: 'read', resource: { type: 'content', ref: CONTENT_A }, now: SOON.toISOString() }).allowed).toBe(false);
  });

  it('denies a capability of another subject presented with this consent', () => {
    const { consent } = widenedToken();
    const foreign = mintCapabilityToken(consentFor(OTHER, READER), [{ type: 'content', ref: CONTENT_A }], ['read'], '2025-06-15T10:05:00Z', { now: NOW });
    expect(evaluateCapabilityAccess({ capability: foreign, consent, action: 'read', resource: { type: 'content', ref: CONTENT_A }, now: SOON.toISOString() }).allowed).toBe(false);
  });

  it('allows a capability that stays within its consent', () => {
    const { consent, token } = widenedToken();
    expect(evaluateCapabilityAccess({ capability: token, consent, action: 'read', resource: { type: 'content', ref: CONTENT_A }, now: SOON.toISOString() }).allowed).toBe(true);
  });

  it('consumption denies without consent and does not spend the token', () => {
    const { consent, token } = widenedToken();
    const request = { capability: token, action: 'read', resource: { type: 'content' as const, ref: CONTENT_A }, now: SOON, consume: true };
    const denied = consumeCapabilityAccess(request);
    expect(denied.allowed).toBe(false);
    expect(denied.reasonCode).toBe(capabilityAccessReasonCodes.CONSENT_INVALID);
    expect(denied.reason).toMatch(/required for capability consumption/);
    expect(denied.consumed).toBe(false);
    expect(consumeCapabilityAccess({ ...request, consent }).allowed).toBe(true);
  });

  it('the legacy enforcement bridge denies without consent and denies widened scope with it', () => {
    const { consent, widened } = widenedToken();
    expect(enforceCapability({ required_scope: `content:${CONTENT_B}`, token: widened as never, consent: undefined as never, now: SOON }).allowed).toBe(false);
    expect(enforceCapability({ required_scope: `content:${CONTENT_B}`, token: widened as never, consent, now: SOON }).allowed).toBe(false);
  });

  it('the interpreter denies a widened capability presented without consent', () => {
    const { widened } = widenedToken();
    const response = interpretWithCapability({ capability: widened as never, action: 'share', resource: `content:${CONTENT_B}`, input: { query: 'q' }, now: SOON.toISOString() });
    expect(response.allowed).toBe(false);
    expect(response.error?.code).toBe(capabilityAccessReasonCodes.CONSENT_INVALID);
  });
});

describe('the vault honours only consents from the pack owner', () => {
  function ownerVault() {
    const vault = createInMemoryVault({ trustDomain: TEST_TRUST_DOMAIN, contentOwnership: testContentOwnership({ [CONTENT_A]: OWNER, [CONTENT_B]: OWNER }).authority });
    const fields: FieldReference[] = [
      { field_id: 'full-name', content_id: CONTENT_A, storage: buildStoragePointer('local', '1'.repeat(64)), bytes: 100 },
      { field_id: 'birth-date', content_id: CONTENT_B, storage: buildStoragePointer('local', '2'.repeat(64)), bytes: 64 },
    ];
    const pack_hash = vault.storePack(buildPackManifest(OWNER, fields, { now: NOW }));
    vault.registerSdlMapping('person.name.legal.full', 'full-name');
    vault.registerSdlMapping('person.birth.date', 'birth-date');
    return { vault, pack_hash };
  }

  function read(subject: string, scope = [{ type: 'content' as const, ref: CONTENT_A }, { type: 'content' as const, ref: CONTENT_B }]) {
    const { vault, pack_hash } = ownerVault();
    const hash = vault.storeConsent(consentFor(subject, READER, scope));
    const token = vault.mintCapability(hash, scope, ['read'], '2025-06-15T10:05:00Z', { now: NOW });
    return { vault, pack_hash, token };
  }

  it('denies a consent issued by someone other than the pack owner, even when it names the owner\'s content', () => {
    const { vault, pack_hash, token } = read(READER);
    const result = vault.requestAccess({ capability_token: token, sdl_paths: ['person.name.legal.full'], pack_ref: pack_hash }, { now: SOON });
    expect(result.policy.decision).toBe('DENY');
    expect(result.policy.reason_codes).toEqual(['CONSENT_MISMATCH']);
    expect(result.resolved_fields).toEqual([]);
  });

  it('denies a token widened beyond the owner\'s consent', () => {
    const { vault, pack_hash, token } = read(OWNER, [{ type: 'content', ref: CONTENT_A }]);
    const widened: Record<string, unknown> = { ...token, scope: [{ type: 'content', ref: CONTENT_B }] };
    widened.capability_hash = computeCapabilityHash(canonicalizeCapabilityPayload(widened as never));
    const result = vault.requestAccess({ capability_token: widened as never, sdl_paths: ['person.birth.date'], pack_ref: pack_hash }, { now: SOON });
    expect(result.policy.decision).toBe('DENY');
  });

  it('allows the owner\'s consent within its scope', () => {
    const { vault, pack_hash, token } = read(OWNER);
    const result = vault.requestAccess({ capability_token: token, sdl_paths: ['person.name.legal.full', 'person.birth.date'], pack_ref: pack_hash }, { now: SOON });
    expect(result.policy.decision).toBe('ALLOW');
    expect(result.resolved_fields.map((field) => field.field_id)).toEqual(['birth-date', 'full-name']);
  });
});

describe('protocol enforcement requires the active parent consent', () => {
  const notRevoked: RevocationCheckPort = createStaticRevocationCheck(verifiedNotRevokedStatus({ subjectId: 'fixture', subjectType: 'capability_grant' }));
  const consentRevoked: RevocationCheckPort = (subject) =>
    subject.subjectType === 'consent_grant'
      ? revokedStatus({ subjectId: subject.subjectId, subjectType: 'consent_grant', revocationId: 'rev-1', reasonCode: 'REVOKED', revokedAt: '2026-02-10T00:00:00Z' })
      : verifiedNotRevokedStatus({ subjectId: subject.subjectId, subjectType: subject.subjectType });

  const consent = buildConsentObject(OWNER, READER, 'grant', [{ type: 'content', ref: CONTENT_A }], ['read'], {
    now: new Date('2026-01-01T00:00:00Z'),
    expires_at: '2026-12-31T00:00:00Z',
  });
  const capability = mintCapability({
    consent,
    requested_scope: [{ type: 'content', ref: CONTENT_A }],
    requested_permissions: ['read'],
    issued_at: '2026-02-01T00:00:00Z',
    expires_at: '2026-03-01T00:00:00Z',
    checkConsentRevocation: notRevoked,
  });
  const request = (overrides: Record<string, unknown> = {}) => ({
    consent,
    capability,
    requested_scope: [{ type: 'content' as const, ref: CONTENT_A }],
    requested_permissions: ['read'],
    now: new Date('2026-02-15T00:00:00Z'),
    ...overrides,
  });
  const rehashed = (changes: Record<string, unknown>) => {
    const { capability_hash: _hash, ...rest } = { ...capability, ...changes };
    return { ...rest, capability_hash: computeCapabilityDeterministicHash(rest as never) };
  };

  it('allows a capability with its active consent', () => {
    expect(evaluateEnforcement(request(), notRevoked).allowed).toBe(true);
  });

  it('rejects a request without a consent', () => {
    const { consent: _omitted, ...withoutConsent } = request();
    const decision = evaluateEnforcement(withoutConsent as never, notRevoked);
    expect(decision.allowed).toBe(false);
    expect(decision.reason_code).toBe(ENFORCEMENT_REASON_CODES.REQUEST_INVALID);
  });

  it('denies a self-hashed capability that was not minted from the supplied consent', () => {
    const decision = evaluateEnforcement(request({ capability: rehashed({ parent_consent_hash: 'c'.repeat(64) }) }), notRevoked);
    expect(decision.reason_code).toBe(ENFORCEMENT_REASON_CODES.CONSENT_MISMATCH);
  });

  it('denies a self-hashed capability widened beyond its consent', () => {
    const widened = rehashed({ scope: [{ type: 'content', ref: CONTENT_B }], permissions: ['read', 'share'] });
    const decision = evaluateEnforcement(request({ capability: widened, requested_scope: [{ type: 'content', ref: CONTENT_B }] }), notRevoked);
    expect(decision.allowed).toBe(false);
    expect(decision.reason_code).toBe(ENFORCEMENT_REASON_CODES.CONSENT_MISMATCH);
  });

  it('denies a self-hashed capability whose scope alone exceeds its consent', () => {
    const widened = rehashed({ scope: [{ type: 'content', ref: CONTENT_B }] });
    const decision = evaluateEnforcement(request({ capability: widened, requested_scope: [{ type: 'content', ref: CONTENT_B }] }), notRevoked);
    expect(decision.reason_code).toBe(ENFORCEMENT_REASON_CODES.CONSENT_MISMATCH);
    expect(decision.reasons.join(' ')).toMatch(/scope is not covered/);
  });

  it('denies a self-hashed capability that keeps the parent hash but names another subject or grantee', () => {
    expect(evaluateEnforcement(request({ capability: rehashed({ subject: OTHER }), subject: OTHER }), notRevoked).reason_code).toBe(ENFORCEMENT_REASON_CODES.CONSENT_MISMATCH);
    expect(evaluateEnforcement(request({ capability: rehashed({ grantee: OTHER }), grantee: OTHER }), notRevoked).reason_code).toBe(ENFORCEMENT_REASON_CODES.CONSENT_MISMATCH);
  });

  it('denies a self-hashed capability that starts before, or outlives, its consent', () => {
    expect(evaluateEnforcement(request({ capability: rehashed({ issued_at: '2025-12-01T00:00:00Z' }) }), notRevoked).reason_code).toBe(ENFORCEMENT_REASON_CODES.CONSENT_MISMATCH);
    expect(evaluateEnforcement(request({ capability: rehashed({ expires_at: '2027-06-01T00:00:00Z' }) }), notRevoked).reason_code).toBe(ENFORCEMENT_REASON_CODES.CONSENT_MISMATCH);
  });

  it('denies when the parent consent is revoked', () => {
    const decision = evaluateEnforcement(request(), consentRevoked);
    expect(decision.allowed).toBe(false);
    expect(decision.reason_code).toBe(ENFORCEMENT_REASON_CODES.CONSENT_INACTIVE);
  });

  it('denies a consent of another subject', () => {
    const decision = evaluateEnforcement(request({ consent: consentFor(OTHER, READER) }), notRevoked);
    expect(decision.reason_code).toBe(ENFORCEMENT_REASON_CODES.CONSENT_MISMATCH);
  });

  it('execution authorization applies the same consent requirement', () => {
    const target = { execution_target: { adapter: 'fixture', operation: 'read' } };
    expect(authorizeExecution({ ...request(), ...target }, notRevoked).authorized).toBe(true);
    expect(authorizeExecution({ ...request(), ...target }, consentRevoked).authorized).toBe(false);
  });
});

describe('runtime consent grants count only when signed by their subject', () => {
  const alice = createRuntimeAuthority('runtime:alice', 'actor:alice', 'authority:alice');
  const bob = createRuntimeAuthority('runtime:bob', 'actor:bob', 'authority:bob');
  const mallory = createRuntimeAuthority('runtime:mallory', 'actor:mallory', 'authority:mallory');
  const trustedKeys = createTrustedKeySet([alice.identity, bob.identity, mallory.identity]);
  const provenance = { runtimeSource: 'test-suite', timestamp: '2026-01-01T00:00:00.000Z' };
  const capability: CapabilityRef = { capabilityId: 'cap:records', action: 'read', resource: 'records', scope: { organizationId: 'org:a', path: '/alice' } };
  const AT = '2026-02-01T00:00:00.000Z';

  const issue = (grant: ConsentGrant, signer = alice): SignedConsentGrant<ConsentGrant> => {
    const grantHash = stableHash(grant);
    return { grant, grantHash, issuerSignature: signPayload({ grantHash, grant }, signer.privateKey, signer.identity, provenance) };
  };
  // Alice owns /alice in the deployment's records; the grant's subject must be her.
  const resourceOwnership = { ownerOf: async () => 'actor:alice' };
  const runtimeWith = (grants: SignedConsentGrant<ConsentGrant>[]) => new ConsentRuntime({ getActiveGrants: async () => grants }, { trustedKeys, resourceOwnership });
  const own: ConsentGrant = { grantId: 'g:own', subjectActorId: 'actor:alice', capability, issuedAt: '2026-01-01T00:00:00.000Z' };
  const delegated: ConsentGrant = { ...own, grantId: 'g:delegated', delegateActorId: 'actor:bob' };
  const consentRuntime = new ConsentRuntime({ getActiveGrants: async () => [] }, { trustedKeys, resourceOwnership });
  const countersigned = consentRuntime.signDelegation(issue(delegated), bob.privateKey, bob.identity, 'test-suite');

  it('allows the subject\'s own signed grant', async () => {
    expect((await runtimeWith([issue(own)]).evaluate({ actorId: 'actor:alice', capability, at: AT })).allowed).toBe(true);
  });

  it('denies a grant for the subject signed by another trusted key', async () => {
    expect((await runtimeWith([issue(own, mallory)]).evaluate({ actorId: 'actor:alice', capability, at: AT })).allowed).toBe(false);
  });

  it('denies a grant to an actor who is neither its delegate nor, without a delegate, its subject', async () => {
    expect((await runtimeWith([issue(own)]).evaluate({ actorId: 'actor:mallory', capability, at: AT })).allowed).toBe(false);
    expect((await runtimeWith([countersigned]).evaluate({ actorId: 'actor:mallory', capability, at: AT })).allowed).toBe(false);
  });

  it('requires the delegate\'s countersignature for a delegated grant', async () => {
    expect((await runtimeWith([issue(delegated)]).evaluate({ actorId: 'actor:bob', capability, at: AT })).allowed).toBe(false);
    expect((await runtimeWith([countersigned]).evaluate({ actorId: 'actor:bob', capability, at: AT })).allowed).toBe(true);
  });

  it('ignores a grant for a different capability', async () => {
    const other = issue({ ...own, capability: { ...capability, resource: 'payroll' } });
    const decision = await runtimeWith([other]).evaluate({ actorId: 'actor:alice', capability, at: AT });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('no_grant');
  });

  it('denies unsigned grants', async () => {
    const unsigned = { grant: own, grantHash: stableHash(own) } as unknown as SignedConsentGrant<ConsentGrant>;
    expect((await runtimeWith([unsigned]).evaluate({ actorId: 'actor:alice', capability, at: AT })).allowed).toBe(false);
  });

  it('refuses to construct without trusted keys', () => {
    expect(() => new ConsentRuntime({ getActiveGrants: async () => [] }, undefined as never)).toThrow(/trusted keys/);
  });

  it('authorization end to end allows a signed grant and denies a mis-signed one', async () => {
    const allowGovernance = { evaluate: async () => ({ allowed: true, reasons: [], policySourceIds: [], inheritedScopeChain: [] }) };
    const audit = { finalizeDecision: (decision: unknown) => decision };
    const capabilities = new CapabilityRuntime({ resolve: async () => [capability] });
    const input = {
      actor: { actorId: 'actor:alice', actorType: 'human' as const, organizationId: 'org:a' },
      namespace: { organizationId: 'org:a', path: '/alice/records' },
      scope: { scopeId: 'scope:a', namespace: { organizationId: 'org:a', path: '/alice' }, allowedActorTypes: ['human' as const] },
      action: 'read',
      resource: 'records',
      at: AT,
    };
    const authorize = (grants: SignedConsentGrant<ConsentGrant>[]) =>
      new AuthorizationRuntime(allowGovernance as never, capabilities, runtimeWith(grants), audit as never).evaluate(input as never);
    expect((await authorize([issue(own)])).allowed).toBe(true);
    const denied = await authorize([issue(own, mallory)]);
    expect(denied.allowed).toBe(false);
    expect(denied.failedStage).toBe('consent');
  });
});

describe('capability namespaces contain whole path segments', () => {
  const capability: CapabilityRef = { capabilityId: 'cap:1', action: 'read', resource: 'records', scope: { organizationId: 'org:a', path: '/alice' } };
  const evaluate = (path: string, scopePath = '/alice') =>
    new CapabilityRuntime({ resolve: async () => [{ ...capability, scope: { organizationId: 'org:a', path: scopePath } }] }).evaluate({
      actor: { actorId: 'actor:alice', actorType: 'human', organizationId: 'org:a' } as never,
      namespace: { organizationId: 'org:a', path } as never,
      action: 'read',
      resource: 'records',
    });

  it('does not let "/alice" cover "/alice-other"', async () => {
    expect((await evaluate('/alice-other')).allowed).toBe(false);
  });

  it('covers the scope itself and paths beneath it', async () => {
    expect((await evaluate('/alice')).allowed).toBe(true);
    expect((await evaluate('/alice/records')).allowed).toBe(true);
    expect((await evaluate('/alice/records', '/alice/')).allowed).toBe(true);
    expect((await evaluate('/anything', '/')).allowed).toBe(true);
  });
});

describe('hosted runtime callers act only for their configured principals', () => {
  const caller = (principals: string[], roles: RuntimeCaller['roles'] = []): RuntimeCaller => ({ owner: `key:${principals.join(',') || 'none'}`, principals, roles });
  const ADMIN = caller([], ['admin']);
  const route = (endpoint: Parameters<typeof executeRoute>[0], payload: unknown, as?: RuntimeCaller) => executeRoute(endpoint, payload, DEFAULT_RUNTIME_CORE, as);

  it('ships no development API keys', () => {
    expect('DEFAULT_API_KEYS' in runtimeSurface).toBe(false);
    expect(new InMemoryApiKeyStore().get('aoc_free_dev_key')).toBeUndefined();
  });

  it('rejects a route call with no authenticated caller', () => {
    expect(route('/access/requests', { subject_id: 'subject:1' }).error?.code).toBe('CALLER_NOT_AUTHORIZED');
  });

  it('a requester cannot approve its own access request on the subject\'s behalf', () => {
    const requester = caller(['requester:r1']);
    const created = route('/access/request', { subject_id: 'subject:s1', requester_id: 'requester:r1', dataset_id: 'ds', purpose: 'p' }, requester);
    expect(created.success).toBe(true);
    const requestId = (created.data as { request_id: string }).request_id;
    expect(route('/access/request/decision', { request_id: requestId, subject_id: 'subject:s1', decision: 'approve' }, requester).error?.code).toBe('CALLER_NOT_AUTHORIZED');
    expect(route('/access/request', { subject_id: 'subject:s1', requester_id: 'requester:other', dataset_id: 'ds', purpose: 'p' }, requester).error?.code).toBe('CALLER_NOT_AUTHORIZED');

    const subject = caller(['subject:s1']);
    const approved = route('/access/request/decision', { request_id: requestId, subject_id: 'subject:s1', decision: 'approve' }, subject);
    expect(approved.success).toBe(true);
    const grantId = (approved.data as { grant: { grant_id: string } }).grant.grant_id;

    expect(route('/access/grants/active', {}, requester).error?.code).toBe('CALLER_NOT_AUTHORIZED');
    expect(route('/access/grants/active', { requester_id: 'requester:r1' }, requester).success).toBe(true);
    expect(route('/access/grant/revoke', { grant_id: grantId, subject_id: 'subject:s1' }, caller(['subject:other'])).error?.code).toBe('CALLER_NOT_AUTHORIZED');
    expect(route('/access/grant/revoke', { grant_id: grantId, subject_id: 'subject:s1' }, subject).success).toBe(true);
  });

  it('binds consumers, grantees and consent subjects to the caller', () => {
    const consent = consentFor(OWNER, READER);
    const mint = { consent, requested_scope: [{ type: 'content', ref: CONTENT_A }], requested_permissions: ['read'], issued_at: '2025-06-15T10:00:00Z', expires_at: '2025-07-01T00:00:00Z' };
    expect(route('/capability/mint', mint, caller([READER])).error?.code).toBe('CALLER_NOT_AUTHORIZED');
    // The subject passes the caller check and mints from its live consent.
    expect(route('/capability/mint', mint, caller([OWNER])).success).toBe(true);
    expect(route('/enforcement/evaluate', { capability: {}, consent, requested_scope: [], requested_permissions: [], grantee: READER }, caller([OTHER])).error?.code).toBe('CALLER_NOT_AUTHORIZED');
    expect(route('/data/access', { subject_hash: 'h', consumer_id: 'consumer:a', dataset_id: 'ds', purpose: 'p' }, caller(['consumer:b'])).error?.code).toBe('CALLER_NOT_AUTHORIZED');
    expect(route('/payout/callback', {}, caller(['consumer:b'])).error?.code).toBe('CALLER_NOT_AUTHORIZED');
    expect(route('/access/requests', { subject_id: 'subject:any' }, ADMIN).success).toBe(true);
  });
});

describe('identity credentials and consents need their issuer\'s signature', () => {
  const issuer = createRuntimeAuthority('runtime:kyc-global', 'kyc-global-v1');
  const impostor = createRuntimeAuthority('runtime:impostor', 'issuer:impostor');
  const trustedIssuerKeys = createTrustedKeySet([issuer.identity, impostor.identity]);
  const provenance = { runtimeSource: 'test-suite', timestamp: '2026-01-01T00:00:00.000Z' };
  const credential = {
    credential_ref: 'cred:1', subject_hash: 'subject:1', issuer_id: 'kyc-global-v1', credential_hash: 'x', metadata_hash: 'y',
    kyc_level: 'institutional' as const, issued_at: '2026-01-01T00:00:00.000Z',
  };
  const consent = { consent_id: 'consent:1', subject_hash: 'subject:1', consumer_id: 'consumer:1', issuer_id: 'kyc-global-v1', granted_at: '2026-01-01T00:00:00.000Z' };
  const signCredential = (by = issuer, record = credential) =>
    ({ ...record, issuer_signature: signPayload(identityRegistrationPayload('credential', record), by.privateKey, by.identity, provenance) });
  const signConsent = (by = issuer, record = consent) =>
    ({ ...record, issuer_signature: signPayload(identityRegistrationPayload('consent', record), by.privateKey, by.identity, provenance) });
  const verifyInput = { subject_hash: 'subject:1', consumer_id: 'consumer:1', now: new Date('2026-02-01T00:00:00.000Z') };

  it('registers records signed by the named issuer', () => {
    const trust = new InMemoryTrustService(DEFAULT_TRUST_ISSUERS, { trustedIssuerKeys });
    trust.registerCredential(signCredential());
    trust.grantConsent(signConsent());
    expect(trust.verifyIdentity(verifyInput).valid).toBe(true);
  });

  it('refuses unsigned records, records signed by another trusted issuer, and altered records', () => {
    const trust = new InMemoryTrustService(DEFAULT_TRUST_ISSUERS, { trustedIssuerKeys });
    expect(() => trust.registerCredential({ ...credential } as never)).toThrow(/not signed/);
    expect(() => trust.registerCredential(signCredential(impostor))).toThrow(/not signed/);
    expect(() => trust.registerCredential({ ...signCredential(), kyc_level: 'basic' })).toThrow(/not signed/);
    expect(() => trust.grantConsent({ ...signConsent(), consumer_id: 'consumer:attacker' })).toThrow(/not signed/);
    expect(() => trust.grantConsent({ ...signCredential(), ...consent } as never)).toThrow(/not signed/);
    expect(trust.verifyIdentity(verifyInput).valid).toBe(false);
  });

  it('refuses all registration when no issuer keys are configured', () => {
    const trust = new InMemoryTrustService(DEFAULT_TRUST_ISSUERS);
    expect(() => trust.registerCredential(signCredential())).toThrow(/No trusted issuer keys/);
    expect(() => trust.grantConsent(signConsent())).toThrow(/No trusted issuer keys/);
  });
});

describe('consents authorize only with their subject\'s did:key signature', () => {
  const ATTACKER = testSubjectSigner('attacker');
  const ownerSigner = testSubjectSigner('subject');
  const notRevoked: RevocationCheckPort = createStaticRevocationCheck(verifiedNotRevokedStatus({ subjectId: 'fixture', subjectType: 'capability_grant' }));
  const SCOPE = [{ type: 'content' as const, ref: CONTENT_A }, { type: 'content' as const, ref: CONTENT_B }];

  const unsignedFor = (subject: string, scope = SCOPE) =>
    buildUnsignedConsentObject(subject, READER, 'grant', scope, ['read'], { now: NOW, expires_at: '2026-01-15T14:30:00Z' });
  /** A consent naming the owner as subject, "signed" with the attacker's key. */
  const forgedWithAttackerKey = (): ConsentObjectV1 => {
    const unsigned = unsignedFor(OWNER);
    const content = new TextDecoder().decode(canonicalizeConsentPayload(unsigned));
    return { ...unsigned, subject_proof: createSubjectConsentProof('consent-object/v1', OWNER, content, { did: OWNER, sign: ATTACKER.sign }) };
  };
  /** The owner's genuine consent, altered after signing and rehashed by the attacker. */
  const alteredAfterSigning = (): ConsentObjectV1 => {
    const genuine = signConsentObject(unsignedFor(OWNER, [{ type: 'content', ref: CONTENT_A }]), ownerSigner);
    const altered = { ...genuine, scope: SCOPE, permissions: ['read', 'share'] };
    return { ...altered, consent_hash: computeConsentHash(canonicalizeConsentPayload(altered)) };
  };
  /** A proof the owner made for one consent, attached to another consent of the owner's. */
  const substitutedProof = (): ConsentObjectV1 => {
    const genuine = signConsentObject(unsignedFor(OWNER, [{ type: 'content', ref: CONTENT_A }]), ownerSigner);
    return { ...unsignedFor(OWNER), subject_proof: genuine.subject_proof };
  };
  const forgeries: Array<[string, () => ConsentObjectV1, string]> = [
    ['missing its signature (legacy)', () => unsignedFor(OWNER), 'CONSENT_UNSIGNED'],
    ['attributed to the owner but signed with another key', forgedWithAttackerKey, 'CONSENT_SIGNATURE_INVALID'],
    ['changed after signing', alteredAfterSigning, 'CONSENT_PROOF_MISMATCH'],
    ['carrying a proof made for another consent', substitutedProof, 'CONSENT_PROOF_MISMATCH'],
    ['with a non-did:key subject', () => ({ ...unsignedFor('did:aoc:owner-legacy-123'), subject_proof: substitutedProof().subject_proof }), 'CONSENT_SUBJECT_UNRESOLVABLE'],
  ];

  function ownerVault() {
    const vault = createInMemoryVault({ trustDomain: TEST_TRUST_DOMAIN, contentOwnership: testContentOwnership({ [CONTENT_A]: OWNER, [CONTENT_B]: OWNER }).authority });
    const fields: FieldReference[] = [
      { field_id: 'full-name', content_id: CONTENT_A, storage: buildStoragePointer('local', '1'.repeat(64)), bytes: 100 },
      { field_id: 'birth-date', content_id: CONTENT_B, storage: buildStoragePointer('local', '2'.repeat(64)), bytes: 64 },
    ];
    const pack_hash = vault.storePack(buildPackManifest(OWNER, fields, { now: NOW }));
    vault.registerSdlMapping('person.name.legal.full', 'full-name');
    vault.registerSdlMapping('person.birth.date', 'birth-date');
    return { vault, pack_hash };
  }

  /** A capability hand-built (and self-hashed) from a consent, bypassing every minting check. */
  function selfMinted(consent: ConsentObjectV1): Record<string, unknown> {
    const genuine = signConsentObject(unsignedFor(OWNER), ownerSigner);
    const token: Record<string, unknown> = { ...mintCapabilityToken(genuine, SCOPE, ['read'], '2025-06-15T10:05:00Z', { now: NOW }), consent_ref: consent.consent_hash };
    token.capability_hash = computeCapabilityHash(canonicalizeCapabilityPayload(token as never));
    return token;
  }

  describe.each(forgeries)('a consent %s', (_label, forge, code) => {
    it('fails proof verification with a specific reason', () => {
      const result = verifyConsentObjectProof(forge());
      expect(result.valid).toBe(false);
      expect(!result.valid && result.code).toBe(code);
    });

    it('is refused by the vault, which then cannot mint from it', () => {
      const { vault } = ownerVault();
      const forged = forge();
      expect(() => vault.storeConsent(forged)).toThrow(SubjectConsentProofError);
      expect(vault.getStore().consents.size).toBe(0);
      expect(() => vault.mintCapability(forged.consent_hash, SCOPE, ['read'], '2025-06-15T10:05:00Z', { now: NOW })).toThrow(/Consent not found/);
    });

    it('cannot mint a capability token or a protocol capability', () => {
      expect(() => mintCapabilityToken(forge(), SCOPE, ['read'], '2025-06-15T10:05:00Z', { now: NOW })).toThrow(SubjectConsentProofError);
      expect(() => mintCapability({
        consent: forge(),
        requested_scope: SCOPE,
        requested_permissions: ['read'],
        issued_at: '2025-06-15T10:00:30Z',
        expires_at: '2025-06-15T10:05:00Z',
        checkConsentRevocation: notRevoked,
      })).toThrow(/not signed by its subject/);
    });

    it('does not authorize a capability built from it on any evaluation or consumption path', () => {
      const forged = forge();
      const token = selfMinted(forged);
      const access = { capability: token, consent: forged, action: 'read', resource: { type: 'content' as const, ref: CONTENT_A }, now: SOON.toISOString() };
      expect(evaluateCapabilityAccess(access).reasonCode).toBe(capabilityAccessReasonCodes.CONSENT_UNAUTHENTICATED);
      const consumed = consumeCapabilityAccess(access as never);
      expect(consumed.allowed).toBe(false);
      expect(consumed.reasonCode).toBe(capabilityAccessReasonCodes.CONSENT_UNAUTHENTICATED);
      expect(enforceCapability({
        required_scope: `content:${CONTENT_A}`,
        token: token as never,
        consent: forged,
        resource_context: { resource_type: 'content', content_ref: CONTENT_A },
        request_context: { subject: OWNER, grantee: READER, endpoint: 'test' },
        now: SOON,
      }).allowed).toBe(false);
      const interpreted = interpretWithCapability({ capability: token as never, consent: forged, action: 'read', resource: `content:${CONTENT_A}`, input: { query: 'q' }, now: SOON.toISOString() });
      expect(interpreted.allowed).toBe(false);
      expect(interpreted.error?.code).toBe(capabilityAccessReasonCodes.CONSENT_UNAUTHENTICATED);
    });

    it('does not satisfy protocol enforcement or execution authorization', () => {
      const forged = forge();
      const protocolCapability = (() => {
        const base = {
          parent_consent_hash: forged.consent_hash,
          subject: OWNER,
          grantee: READER,
          scope: [...SCOPE].sort((a, b) => a.ref.localeCompare(b.ref)),
          permissions: ['read'],
          issued_at: '2025-06-15T10:00:30Z',
          expires_at: '2025-06-15T10:05:00Z',
        };
        return { capability_hash: computeCapabilityDeterministicHash(base as never), ...base };
      })();
      const request = { consent: forged, capability: protocolCapability, requested_scope: [{ type: 'content' as const, ref: CONTENT_A }], requested_permissions: ['read'], now: SOON };
      const decision = evaluateEnforcement(request, notRevoked);
      expect(decision.allowed).toBe(false);
      expect([ENFORCEMENT_REASON_CODES.CONSENT_UNAUTHENTICATED, ENFORCEMENT_REASON_CODES.CONSENT_INVALID]).toContain(decision.reason_code);
      expect(authorizeExecution({ ...request, execution_target: { adapter: 'fixture', operation: 'read' } }, notRevoked).authorized).toBe(false);
    });
  });

  it('the vault refuses a capability whose consent was replaced after storage by a forgery', () => {
    const { vault, pack_hash } = ownerVault();
    const genuine = signConsentObject(unsignedFor(OWNER), ownerSigner);
    const hash = vault.storeConsent(genuine);
    const token = vault.mintCapability(hash, SCOPE, ['read'], '2025-06-15T10:05:00Z', { now: NOW });
    // Mutating the caller's object after storage does not reach the stored copy.
    (genuine as { scope: unknown }).scope = [{ type: 'content', ref: 'c'.repeat(64) }];
    const result = vault.requestAccess({ capability_token: token, sdl_paths: ['person.name.legal.full'], pack_ref: pack_hash }, { now: SOON });
    expect(result.policy.decision).toBe('ALLOW');
  });

  it('a consent signed by its own subject for someone else\'s pack still grants nothing there', () => {
    const { vault, pack_hash } = ownerVault();
    const hash = vault.storeConsent(signConsentObject(unsignedFor(ATTACKER.did), ATTACKER));
    const token = vault.mintCapability(hash, SCOPE, ['read'], '2025-06-15T10:05:00Z', { now: NOW });
    const result = vault.requestAccess({ capability_token: token, sdl_paths: ['person.name.legal.full'], pack_ref: pack_hash }, { now: SOON });
    expect(result.policy).toEqual({ decision: 'DENY', reason_codes: ['CONSENT_MISMATCH'] });
  });

  it('only the subject can sign a consent, and a legacy consent remains readable but inert', () => {
    const legacy = unsignedFor(OWNER);
    expect(() => signConsentObject(legacy, ATTACKER)).toThrow(SubjectConsentProofError);
    expect(() => validateConsentObject(legacy)).not.toThrow();
    expect(verifyConsentObjectProof(legacy)).toMatchObject({ valid: false, code: 'CONSENT_UNSIGNED' });
  });

  it('rejects a signed consent relabelled with another consent\'s hash', () => {
    const signed = signConsentObject(unsignedFor(OWNER), ownerSigner);
    const other = signConsentObject(unsignedFor(OWNER, [{ type: 'content', ref: CONTENT_A }]), ownerSigner);
    expect(verifyConsentObjectProof({ ...signed, consent_hash: other.consent_hash })).toMatchObject({ valid: false, code: 'CONSENT_PROOF_MISMATCH' });
  });

  it('protocol consent state and scope checks treat an unsigned consent as never active', () => {
    const legacy = unsignedFor(OWNER);
    expect(evaluateConsentState(legacy, { now: SOON, checkRevocation: notRevoked }).state).toBe('invalid');
    expect(doesConsentAllowScope(legacy, { scope: [{ type: 'content', ref: CONTENT_A }], permissions: ['read'], now: SOON, checkRevocation: notRevoked })).toBe(false);
    const signed = signConsentObject(legacy, ownerSigner);
    expect(evaluateConsentState(signed, { now: SOON, checkRevocation: notRevoked }).state).toBe('active');
    expect(doesConsentAllowScope(signed, { scope: [{ type: 'content', ref: CONTENT_A }], permissions: ['read'], now: SOON, checkRevocation: notRevoked })).toBe(true);
  });

  it('rejects a did:key whose 32-byte key is not tagged Ed25519 (e.g. X25519)', () => {
    const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const base58 = (bytes: number[]) => {
      let value = bytes.reduce((acc, byte) => acc * 256n + BigInt(byte), 0n);
      let text = '';
      while (value > 0n) { text = alphabet[Number(value % 58n)] + text; value /= 58n; }
      return text;
    };
    const ownerKey = [...Buffer.from(String(resolveDidKeyEd25519(OWNER)!.export({ format: 'jwk' }).x), 'base64url')];
    expect(resolveDidKeyEd25519(`did:key:z${base58([0xed, 0x01, ...ownerKey])}`)).not.toBeNull();
    expect(resolveDidKeyEd25519(`did:key:z${base58([0xec, 0x01, ...ownerKey])}`)).toBeNull();
  });

  it('the consent binding check refuses an unsigned consent when called directly', () => {
    const legacy = unsignedFor(OWNER);
    const token = mintCapabilityToken(signConsentObject(legacy, ownerSigner), SCOPE, ['read'], '2025-06-15T10:05:00Z', { now: NOW });
    expect(() => verifyCapabilityConsentBinding(token, legacy)).toThrow(SubjectConsentProofError);
    expect(() => verifyCapabilityConsentBinding(token, signConsentObject(legacy, ownerSigner))).not.toThrow();
  });

  it('capability token verification refuses an unsigned parent consent', () => {
    const legacy = unsignedFor(OWNER);
    const token = mintCapabilityToken(signConsentObject(legacy, ownerSigner), SCOPE, ['read'], '2025-06-15T10:05:00Z', { now: NOW });
    expect(() => verifyCapabilityToken(token, legacy, { now: SOON })).toThrow(SubjectConsentProofError);
    expect(() => verifyCapabilityToken(token, signConsentObject(legacy, ownerSigner), { now: SOON })).not.toThrow();
  });

  it('getStore() is a snapshot: replacing a stored consent through it changes nothing', () => {
    const { vault, pack_hash } = ownerVault();
    const hash = vault.storeConsent(signConsentObject(unsignedFor(OWNER), ownerSigner));
    const token = vault.mintCapability(hash, SCOPE, ['read'], '2025-06-15T10:05:00Z', { now: NOW });
    (vault.getStore().consents as Map<string, ConsentObjectV1>).set(hash, unsignedFor(OWNER));
    expect(vault.getStore().consents.get(hash)?.subject_proof).toBeDefined();
    const result = vault.requestAccess({ capability_token: token, sdl_paths: ['person.name.legal.full'], pack_ref: pack_hash }, { now: SOON });
    expect(result.policy.decision).toBe('ALLOW');
  });

  it('rejects non-canonical and non-Ed25519 did:key identifiers', () => {
    expect(resolveDidKeyEd25519(OWNER)).not.toBeNull();
    expect(resolveDidKeyEd25519(`${OWNER}1`)).toBeNull();
    expect(resolveDidKeyEd25519('did:key:z1' + OWNER.slice('did:key:z'.length))).toBeNull();
    expect(resolveDidKeyEd25519('did:key:zQ3shokFTS3brHcDQrn82RUDfCZESWL1ZdCEJwekUDPQiYBme')).toBeNull();
    expect(resolveDidKeyEd25519('did:web:example.com')).toBeNull();
  });

  describe('revocation needs the original subject\'s signature and names the revoked consent', () => {
    function minted() {
      const { vault, pack_hash } = ownerVault();
      const consent_hash = vault.storeConsent(signConsentObject(unsignedFor(OWNER), ownerSigner));
      const token = vault.mintCapability(consent_hash, SCOPE, ['read'], '2025-06-15T10:05:00Z', { now: NOW });
      return { vault, pack_hash, consent_hash, token };
    }
    const revoke = (subject: string, capability_hash: string, prior_consent: string | null) =>
      buildUnsignedConsentObject(subject, READER, 'revoke', [], [], { now: NOW, prior_consent, revoke_target: { capability_hash } });
    const stillAllowed = (vault: ReturnType<typeof minted>['vault'], pack_hash: string, token: ReturnType<typeof minted>['token']) =>
      vault.requestAccess({ capability_token: token, sdl_paths: ['person.name.legal.full'], pack_ref: pack_hash }, { now: SOON }).policy.decision;

    it('refuses an unsigned revocation in the subject\'s name', () => {
      const { vault, pack_hash, consent_hash, token } = minted();
      expect(() => vault.applyConsent(revoke(OWNER, token.capability_hash, consent_hash))).toThrow(SubjectConsentProofError);
      expect(stillAllowed(vault, pack_hash, token)).toBe('ALLOW');
    });

    it('refuses a revocation in the subject\'s name signed with another key', () => {
      const { vault, pack_hash, consent_hash, token } = minted();
      const unsigned = revoke(OWNER, token.capability_hash, consent_hash);
      const content = new TextDecoder().decode(canonicalizeConsentPayload(unsigned));
      const forged = { ...unsigned, subject_proof: createSubjectConsentProof('consent-object/v1', OWNER, content, { did: OWNER, sign: ATTACKER.sign }) };
      expect(() => vault.applyConsent(forged)).toThrow(SubjectConsentProofError);
      expect(stillAllowed(vault, pack_hash, token)).toBe('ALLOW');
    });

    it('refuses a revocation signed by the grantee or anyone other than the subject', () => {
      const { vault, pack_hash, consent_hash, token } = minted();
      const byGrantee = signConsentObject(revoke(READER, token.capability_hash, consent_hash), testSubjectSigner('grantee'));
      const byAttacker = signConsentObject(revoke(ATTACKER.did, token.capability_hash, consent_hash), ATTACKER);
      expect(() => vault.applyConsent(byGrantee)).toThrow('Consent subject must match revoked capability subject.');
      expect(() => vault.applyConsent(byAttacker)).toThrow('Consent subject must match revoked capability subject.');
      expect(stillAllowed(vault, pack_hash, token)).toBe('ALLOW');
    });

    it('refuses a subject-signed revocation that does not name the capability\'s consent', () => {
      const { vault, pack_hash, token } = minted();
      expect(() => vault.applyConsent(signConsentObject(revoke(OWNER, token.capability_hash, null), ownerSigner))).toThrow(/prior_consent/);
      expect(() => vault.applyConsent(signConsentObject(revoke(OWNER, token.capability_hash, 'd'.repeat(64)), ownerSigner))).toThrow(/prior_consent/);
      expect(stillAllowed(vault, pack_hash, token)).toBe('ALLOW');
    });

    it('a signed revocation cannot be re-pointed at another capability', () => {
      const { vault, pack_hash, consent_hash, token } = minted();
      const other = vault.mintCapability(consent_hash, [{ type: 'content', ref: CONTENT_A }], ['read'], '2025-06-15T10:04:00Z', { now: NOW });
      const signed = signConsentObject(revoke(OWNER, token.capability_hash, consent_hash), ownerSigner);
      const repointed = { ...signed, revoke_target: { capability_hash: other.capability_hash } };
      expect(() => vault.applyConsent({ ...repointed, consent_hash: computeConsentHash(canonicalizeConsentPayload(repointed)) })).toThrow(SubjectConsentProofError);
      expect(stillAllowed(vault, pack_hash, other)).toBe('ALLOW');
    });

    it('honours the subject\'s signed revocation', () => {
      const { vault, pack_hash, consent_hash, token } = minted();
      vault.applyConsent(signConsentObject(revoke(OWNER, token.capability_hash, consent_hash), ownerSigner));
      const result = vault.requestAccess({ capability_token: token, sdl_paths: ['person.name.legal.full'], pack_ref: pack_hash }, { now: SOON });
      expect(result.policy.reason_codes).toContain('CONSENT_REVOKED');
    });
  });

  describe('HMAC capability issuance and consent-record decisions', () => {
    const recordSubject = testSubjectSigner('record-subject');
    const record = (subject_id = recordSubject.did): ConsentRecord => ({
      consent_id: 'consent-1',
      subject_id,
      requester_id: 'requester-1',
      resource: 'resource:profile',
      actions: ['read'],
      granted: true,
      created_at: '2026-01-01T00:00:00.000Z',
      expires_at: '2026-12-31T00:00:00.000Z',
      revoked_at: null,
      consent_hash: null,
    });
    const requestFor = (subject_id = recordSubject.did) => ({ subject_id, requester_id: 'requester-1', resource: 'resource:profile', action: 'read', requested_at: '2026-06-01T00:00:00.000Z' });
    const allowed = { allowed: true, reason_code: 'ALLOW' as const, evaluated_at: '2026-06-01T00:00:00.000Z', consent_id: 'consent-1' };

    it('issues from a record signed by its subject', () => {
      const signed = signConsentRecord(record(), recordSubject);
      expect(evaluateConsent(requestFor(), signed).allowed).toBe(true);
      expect(issueCapabilityToken({ consent: signed, request: requestFor(), decision: allowed }, 'secret').consent_id).toBe('consent-1');
    });

    it('refuses unsigned, wrongly signed, altered and substituted records', () => {
      const unsigned = record();
      const wrongKey = { ...unsigned, subject_proof: signConsentRecord(record(ATTACKER.did), ATTACKER).subject_proof };
      const altered = { ...signConsentRecord(record(), recordSubject), resource: 'resource:billing' };
      const fromObject = { ...unsigned, subject_proof: signConsentObject(unsignedFor(OWNER), ownerSigner).subject_proof };
      for (const candidate of [unsigned, wrongKey, fromObject]) {
        expect(evaluateConsent(requestFor(), candidate).reason_code).toBe('DENY_UNAUTHENTICATED');
        expect(() => issueCapabilityToken({ consent: candidate, request: requestFor(), decision: allowed }, 'secret')).toThrow('CONSENT_UNAUTHENTICATED');
      }
      const alteredRequest = { ...requestFor(), resource: 'resource:billing' };
      expect(evaluateConsent(alteredRequest, altered).reason_code).toBe('DENY_UNAUTHENTICATED');
      expect(() => issueCapabilityToken({ consent: altered, request: alteredRequest, decision: allowed }, 'secret')).toThrow('CONSENT_UNAUTHENTICATED');
    });

    it('re-decides at issuance instead of trusting an allow decision for a revoked record', () => {
      const revoked = { ...signConsentRecord(record(), recordSubject), revoked_at: '2026-03-01T00:00:00.000Z' };
      expect(() => issueCapabilityToken({ consent: revoked, request: requestFor(), decision: allowed }, 'secret')).toThrow('DECISION_NOT_ALLOWED');
    });
  });
});
