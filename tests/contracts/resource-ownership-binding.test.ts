/**
 * Resource ownership and authorization binding.
 *
 * A valid signature or capability grants authority over a resource only when its subject is
 * independently established as that resource's owner (or the owner's countersigned delegate):
 * - a pack names its owner, and the owner's did:key proof makes that a claim the owner made;
 *   within a vault a content id belongs to the subject that first registered it, and
 *   `getStore()` hands out snapshots only;
 * - the protocol capability-machine helper is an explicitly non-authoritative projection;
 * - runtime consent grants count only when their subject is the resource owner recorded by
 *   the deployment, with subject, signer, owner and delegate kept distinct;
 * - namespace containment uses canonical paths only, so no traversal reaches a sibling or parent.
 */
import { buildConsentObject as buildUnsignedConsentObject, SubjectConsentProofError } from '../../consent';
import { InMemoryRevocationRegistry } from '../../capability';
import { buildPackManifest, signPackManifest, verifyPackManifestProof } from '../../pack';
import type { FieldReference, PackManifestV1 } from '../../pack/types';
import { buildStoragePointer } from '../../storage';
import { createInMemoryVault } from '../../vault';
import * as protocolCapability from '../../protocol/capability';
import { mintCapability, projectCapabilityScopeMatch } from '../../protocol/capability';
import { computeCapabilityDeterministicHash } from '../../protocol/capability/capability-object';
import { evaluateEnforcement } from '../../protocol/enforcement';
import { createStaticRevocationCheck, verifiedNotRevokedStatus } from '../../protocol/revocation';
import { createRuntimeAuthority, createTrustedKeySet, signPayload, stableHash } from '@aoc-runtime/crypto';
import type { CapabilityRef, ConsentGrant, SignedConsentGrant } from '@aoc-runtime/shared-types';
import { ConsentRuntime } from '@aoc-runtime/consent-runtime';
import { CapabilityRuntime, canonicalNamespacePath } from '@aoc-runtime/capability-runtime';
import { AuthorizationRuntime } from '@aoc-runtime/authorization-runtime';
import { signTestConsent, signTestPack, testSubjectSigner } from '../helpers/consentSigning';
import { testContentOwnership } from '../helpers/contentOwnership';

const buildConsentObject: typeof buildUnsignedConsentObject = (...args) =>
  signTestConsent(buildUnsignedConsentObject(...args));

const VICTIM = testSubjectSigner('subject');
const READER = testSubjectSigner('grantee');
const ATTACKER = testSubjectSigner('other');
const CONTENT_A = 'a'.repeat(64);
const CONTENT_B = 'b'.repeat(64);
const CONTENT_C = 'c'.repeat(64);
const SCOPE = [{ type: 'content' as const, ref: CONTENT_A }, { type: 'content' as const, ref: CONTENT_B }];
const NOW = new Date('2025-06-15T10:00:00Z');
const SOON = new Date('2025-06-15T10:01:00Z');
const notRevoked = createStaticRevocationCheck(verifiedNotRevokedStatus({ subjectId: 'fixture', subjectType: 'capability_grant' }));

const fieldsFor = (...contentIds: string[]): FieldReference[] =>
  contentIds.map((content_id, index) => ({ field_id: `field-${index}`, content_id, storage: buildStoragePointer('local', String(index + 1).repeat(64)), bytes: 10 }));
const packFor = (subject: string, ...contentIds: string[]): PackManifestV1 => signTestPack(buildPackManifest(subject, fieldsFor(...contentIds), { now: NOW }));

function victimVault(owners: Record<string, string> = { [CONTENT_A]: VICTIM.did, [CONTENT_B]: VICTIM.did }) {
  const ownership = testContentOwnership(owners);
  const vault = createInMemoryVault({ revocationRegistry: new InMemoryRevocationRegistry(), trustDomain: ownership.trustDomain, contentOwnership: ownership.authority });
  const pack_hash = vault.storePack(packFor(VICTIM.did, CONTENT_A, CONTENT_B));
  vault.registerSdlMapping('person.name.legal.full', 'field-0');
  vault.registerSdlMapping('person.birth.date', 'field-1');
  const selfConsentRead = (subject: ReturnType<typeof testSubjectSigner>, target: string) => {
    const consent = buildConsentObject(subject.did, subject.did, 'grant', SCOPE, ['read'], { now: NOW, expires_at: '2026-01-15T14:30:00Z' });
    const hash = vault.storeConsent(consent);
    const token = vault.mintCapability(hash, SCOPE, ['read'], '2025-06-15T10:05:00Z', { now: NOW });
    return vault.requestAccess({ capability_token: token, sdl_paths: ['person.name.legal.full'], pack_ref: target }, { now: SOON }).policy;
  };
  return { vault, pack_hash, selfConsentRead, ownership };
}

describe('V8: pack ownership is an authenticated claim decided by the trust domain\'s authority', () => {
  it('N16: another subject cannot register a pack listing the owner\'s content, whoever submits first', () => {
    const { vault } = victimVault();
    expect(() => vault.storePack(packFor(ATTACKER.did, CONTENT_A, CONTENT_B))).toThrow(/attributed to another subject/);
    expect(() => vault.storePack(packFor(ATTACKER.did, CONTENT_C, CONTENT_B))).toThrow(/not attributed to any subject|attributed to another subject/);
    expect(vault.getStore().packs.size).toBe(1);
    // Submitting first establishes nothing: an empty vault refuses the same pack.
    const empty = testContentOwnership({ [CONTENT_A]: VICTIM.did, [CONTENT_B]: VICTIM.did });
    const fresh = createInMemoryVault({ trustDomain: empty.trustDomain, contentOwnership: empty.authority });
    expect(() => fresh.storePack(packFor(ATTACKER.did, CONTENT_A, CONTENT_B))).toThrow(/attributed to another subject/);
  });

  it('an unsigned pack, or a pack signed by someone other than its named subject, is refused', () => {
    const { vault } = victimVault({ [CONTENT_A]: VICTIM.did, [CONTENT_B]: VICTIM.did, [CONTENT_C]: ATTACKER.did });
    const unsigned = buildPackManifest(ATTACKER.did, fieldsFor(CONTENT_C), { now: NOW });
    expect(() => vault.storePack(unsigned)).toThrow(SubjectConsentProofError);
    // Owner substitution: the attacker signs a manifest that names the victim as owner.
    const substituted = { ...buildPackManifest(VICTIM.did, fieldsFor(CONTENT_C), { now: NOW }), subject_proof: packFor(ATTACKER.did, CONTENT_C).subject_proof };
    expect(() => vault.storePack(substituted)).toThrow(SubjectConsentProofError);
    expect(() => signPackManifest(buildPackManifest(VICTIM.did, fieldsFor(CONTENT_C), { now: NOW }), ATTACKER)).toThrow(SubjectConsentProofError);
    expect(verifyPackManifestProof(substituted).valid).toBe(false);
    // A proof over different content does not travel to an altered manifest.
    const signed = packFor(ATTACKER.did, CONTENT_C);
    const altered = { ...signed, fields: fieldsFor(CONTENT_A) };
    expect(verifyPackManifestProof(altered).valid).toBe(false);
    expect(() => vault.storePack(altered)).toThrow();
  });

  it('the vault keeps its own copy of a registered pack, and a proof does not travel with a swapped pack_hash', () => {
    const { vault } = victimVault({ [CONTENT_A]: VICTIM.did, [CONTENT_B]: VICTIM.did, [CONTENT_C]: ATTACKER.did, ['d'.repeat(64)]: ATTACKER.did });
    const pack = packFor(ATTACKER.did, CONTENT_C);
    const hash = vault.storePack(pack);
    pack.subject = VICTIM.did;
    pack.fields = fieldsFor(CONTENT_A);
    expect(vault.getStore().packs.get(hash)?.subject).toBe(ATTACKER.did);
    expect(vault.getStore().packs.get(hash)?.fields[0].content_id).toBe(CONTENT_C);
    const swapped = { ...packFor(ATTACKER.did, 'd'.repeat(64)), pack_hash: 'f'.repeat(64) };
    expect(verifyPackManifestProof(swapped)).toMatchObject({ valid: false, code: 'CONSENT_PROOF_MISMATCH' });
  });

  it('positive controls: the owner\'s later versions, and another subject\'s own provisioned content', () => {
    const { vault } = victimVault({ [CONTENT_A]: VICTIM.did, [CONTENT_B]: VICTIM.did, [CONTENT_C]: VICTIM.did, ['d'.repeat(64)]: ATTACKER.did });
    const again = packFor(VICTIM.did, CONTENT_A, CONTENT_B, CONTENT_C);
    expect(vault.storePack(again)).toBe(again.pack_hash);
    const unrelated = packFor(ATTACKER.did, 'd'.repeat(64));
    expect(vault.storePack(unrelated)).toBe(unrelated.pack_hash);
  });

  it('a self-consent over the attacker\'s own pack of its own content works; over the victim\'s pack it is denied', () => {
    const { vault, pack_hash, selfConsentRead } = victimVault({ [CONTENT_A]: VICTIM.did, [CONTENT_B]: VICTIM.did, ['d'.repeat(64)]: ATTACKER.did, ['e'.repeat(64)]: ATTACKER.did });
    expect(selfConsentRead(ATTACKER, pack_hash).decision).toBe('DENY');
    const own = vault.storePack(packFor(ATTACKER.did, 'd'.repeat(64), 'e'.repeat(64)));
    expect(selfConsentRead(ATTACKER, own).decision).toBe('DENY'); // its consent scope names A/B, which it does not own
    expect(selfConsentRead(VICTIM, pack_hash).decision).toBe('ALLOW');
  });

  it('N17: getStore() is a snapshot; changing it does not change the vault', () => {
    const { vault, pack_hash, selfConsentRead } = victimVault();
    const exposed = vault.getStore();
    const pack = exposed.packs.get(pack_hash) as PackManifestV1;
    expect(() => { (pack as { subject: string }).subject = ATTACKER.did; }).toThrow();
    exposed.packs.delete(pack_hash);
    (exposed.consents as Map<string, unknown>).clear();
    expect(vault.getStore().packs.get(pack_hash)?.subject).toBe(VICTIM.did);
    expect(selfConsentRead(ATTACKER, pack_hash)).toEqual({ decision: 'DENY', reason_codes: ['CONSENT_MISMATCH'] });
    expect(selfConsentRead(VICTIM, pack_hash).decision).toBe('ALLOW');
  });
});

describe('V9: the capability-machine helper is a projection, not a decision', () => {
  const consent = buildConsentObject(VICTIM.did, READER.did, 'grant', [{ type: 'content', ref: CONTENT_A }], ['read'], { now: NOW, expires_at: '2026-01-15T14:30:00Z' });
  const real = mintCapability({
    consent, requested_scope: [{ type: 'content', ref: CONTENT_A }], requested_permissions: ['read'],
    issued_at: '2025-06-15T10:00:00Z', expires_at: '2025-12-01T00:00:00Z', checkConsentRevocation: notRevoked,
  });

  it('N15: no consent-free authorizer is exported from protocol/capability', () => {
    expect('evaluateCapabilityAccess' in protocolCapability).toBe(false);
    expect(typeof protocolCapability.projectCapabilityScopeMatch).toBe('function');
  });

  it('the projection reports scope arithmetic for a fabricated capability, and enforcement still denies it', () => {
    const { capability_hash: _hash, ...rest } = { ...real, subject: VICTIM.did, grantee: ATTACKER.did, scope: [{ type: 'content' as const, ref: CONTENT_B }], permissions: ['read', 'share'], parent_consent_hash: 'e'.repeat(64) };
    const fabricated = { ...rest, capability_hash: computeCapabilityDeterministicHash(rest as never) };
    const request = { requested_scope: [{ type: 'content' as const, ref: CONTENT_B }], requested_permissions: ['share'], subject: VICTIM.did, grantee: ATTACKER.did, now: new Date('2025-07-01T00:00:00Z'), checkRevocation: notRevoked };
    expect(projectCapabilityScopeMatch(fabricated, request)).toBe(true);
    const decision = evaluateEnforcement({ capability: fabricated, consent, requested_scope: request.requested_scope, requested_permissions: ['share'], now: request.now }, notRevoked);
    expect(decision.allowed).toBe(false);
  });
});

describe('V12: runtime grants bind to the resource owner recorded by the deployment', () => {
  const alice = createRuntimeAuthority('runtime:alice', 'actor:alice', 'authority:alice');
  const bob = createRuntimeAuthority('runtime:bob', 'actor:bob', 'authority:bob');
  const mallory = createRuntimeAuthority('runtime:mallory', 'actor:mallory', 'authority:mallory');
  const trustedKeys = createTrustedKeySet([alice.identity, bob.identity, mallory.identity]);
  const provenance = { runtimeSource: 'test', timestamp: '2026-01-01T00:00:00.000Z' };
  const capability: CapabilityRef = { capabilityId: 'cap:records', action: 'read', resource: 'records', scope: { organizationId: 'org:a', path: '/alice' } };
  const AT = '2026-02-01T00:00:00.000Z';
  const owners = new Map<string, string>([['cap:records', 'actor:alice']]);
  const ownership = { ownerOf: async (ref: CapabilityRef) => owners.get(ref.capabilityId) };
  const issue = (grant: ConsentGrant, signer = alice): SignedConsentGrant<ConsentGrant> => {
    const grantHash = stableHash(grant);
    return { grant, grantHash, issuerSignature: signPayload({ grantHash, grant }, signer.privateKey, signer.identity, provenance) };
  };
  const runtime = (grants: SignedConsentGrant<ConsentGrant>[], resourceOwnership = ownership) =>
    new ConsentRuntime({ getActiveGrants: async () => grants }, { trustedKeys, resourceOwnership });
  const authorize = (grants: SignedConsentGrant<ConsentGrant>[], actorId: string) =>
    new AuthorizationRuntime(
      { evaluate: async () => ({ allowed: true, reasons: [], policySourceIds: [], inheritedScopeChain: [] }) } as never,
      new CapabilityRuntime({ resolve: async () => [capability] }),
      runtime(grants),
      { finalizeDecision: (decision: unknown) => decision } as never
    ).evaluate({
      actor: { actorId, actorType: 'human', organizationId: 'org:a' },
      namespace: { organizationId: 'org:a', path: '/alice/records' },
      scope: { scopeId: 'scope:a', namespace: { organizationId: 'org:a', path: '/alice' }, allowedActorTypes: ['human'] },
      action: 'read', resource: 'records', at: AT,
    } as never);

  it('N19: a non-owner\'s correctly self-signed grant does not authorize the owner\'s resource', async () => {
    const malloryGrant: ConsentGrant = { grantId: 'g:m', subjectActorId: 'actor:mallory', capability, issuedAt: '2026-01-01T00:00:00.000Z' };
    const decision = await runtime([issue(malloryGrant, mallory)]).evaluate({ actorId: 'actor:mallory', capability, at: AT });
    expect(decision.allowed).toBe(false);
    const endToEnd = await authorize([issue(malloryGrant, mallory)], 'actor:mallory');
    expect(endToEnd.allowed).toBe(false);
    expect(endToEnd.failedStage).toBe('consent');
  });

  it('subject, signer, owner and delegate are distinct bindings', async () => {
    const own: ConsentGrant = { grantId: 'g:own', subjectActorId: 'actor:alice', capability, issuedAt: '2026-01-01T00:00:00.000Z' };
    // owner-subject, wrong signer
    expect((await runtime([issue(own, mallory)]).evaluate({ actorId: 'actor:alice', capability, at: AT })).allowed).toBe(false);
    // owner-subject, right signer, wrong actor
    expect((await runtime([issue(own)]).evaluate({ actorId: 'actor:mallory', capability, at: AT })).allowed).toBe(false);
    // delegation: owner's grant to bob, countersigned by bob, used by bob
    const delegated: ConsentGrant = { ...own, grantId: 'g:delegated', delegateActorId: 'actor:bob' };
    const countersigned = runtime([]).signDelegation(issue(delegated), bob.privateKey, bob.identity, 'test');
    expect((await runtime([countersigned]).evaluate({ actorId: 'actor:bob', capability, at: AT })).allowed).toBe(true);
    // a delegation issued by a non-owner, even countersigned, grants nothing
    const malloryDelegation: ConsentGrant = { ...delegated, subjectActorId: 'actor:mallory' };
    const malloryCountersigned = runtime([]).signDelegation(issue(malloryDelegation, mallory), bob.privateKey, bob.identity, 'test');
    expect((await runtime([malloryCountersigned]).evaluate({ actorId: 'actor:bob', capability, at: AT })).allowed).toBe(false);
  });

  it('positive control: the owner\'s own signed grant authorizes end to end', async () => {
    const own: ConsentGrant = { grantId: 'g:own', subjectActorId: 'actor:alice', capability, issuedAt: '2026-01-01T00:00:00.000Z' };
    expect((await authorize([issue(own)], 'actor:alice')).allowed).toBe(true);
  });

  it('fails closed when ownership is not established, the provider throws, or no provider is configured', async () => {
    const own: ConsentGrant = { grantId: 'g:own', subjectActorId: 'actor:alice', capability, issuedAt: '2026-01-01T00:00:00.000Z' };
    const unknown = await runtime([issue(own)], { ownerOf: async () => undefined }).evaluate({ actorId: 'actor:alice', capability, at: AT });
    expect(unknown.allowed).toBe(false);
    expect(unknown.reasons[0]).toMatch(/not established/);
    expect((await runtime([issue(own)], { ownerOf: async () => { throw new Error('records down'); } }).evaluate({ actorId: 'actor:alice', capability, at: AT })).allowed).toBe(false);
    expect(() => new ConsentRuntime({ getActiveGrants: async () => [] }, { trustedKeys } as never)).toThrow(/resource ownership/);
  });
});

describe('V14: namespace containment uses canonical paths only', () => {
  const runtimeFor = (scopePath: string) =>
    new CapabilityRuntime({ resolve: async () => [{ capabilityId: 'c', action: 'read', resource: 'records', scope: { organizationId: 'org', path: scopePath } }] });
  const allowed = async (scopePath: string, path: string) =>
    (await runtimeFor(scopePath).evaluate({ actor: { actorId: 'a', actorType: 'human', organizationId: 'org' }, namespace: { organizationId: 'org', path }, action: 'read', resource: 'records' })).allowed;

  it('N20: traversal, dot, empty and relative segments never read as inside a scope', async () => {
    for (const escape of ['/alice/../bob', '/alice/..', '/alice/./records', '/alice//records', 'alice/records', '/alice/records/', '/alice/\\\\records', '/alice/re\u0000cords']) {
      expect(await allowed('/alice', escape)).toBe(false);
    }
    expect(await allowed('/alice/../bob', '/bob')).toBe(false);
    expect(await allowed('/', 'alice/records')).toBe(false);
    expect(canonicalNamespacePath('alice/records')).toBeUndefined();
    expect(await allowed('/alice', '/alice-other')).toBe(false);
    expect(await allowed('/alice', '/')).toBe(false);
  });

  it('positive controls: the scope, its descendants, and a root scope', async () => {
    expect(await allowed('/alice', '/alice')).toBe(true);
    expect(await allowed('/alice', '/alice/records')).toBe(true);
    expect(await allowed('/alice/', '/alice/records/2026')).toBe(true);
    expect(await allowed('/', '/anything/at/all')).toBe(true);
    expect(canonicalNamespacePath('/alice/records')).toBe('/alice/records');
    expect(canonicalNamespacePath('/alice/../bob')).toBeUndefined();
    expect(canonicalNamespacePath('')).toBeUndefined();
  });
});
