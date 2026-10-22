/**
 * Federated trust and authority: a signature is trusted only when it verifies
 * against a key the registry was configured with, its signer is reachable from
 * a configured trust root, and — for authorization — it is bound to the exact
 * request, audience, validity window and a single-use nonce. Missing trust
 * configuration denies.
 */
import { createRuntimeAuthority, createTrustedKeySet, signPayload, stableHash } from '@aoc-runtime/crypto';
import type { GovernanceSignature, RuntimeFederation, RuntimeTrustEdge, TrustBoundaryScope } from '@aoc-runtime/shared-types';
import {
  FederatedAuthorityVerifier,
  InMemoryFederatedAuthorityReplayGuard,
  TrustRegistryRuntime,
  buildFederatedAuthorityPayload,
  signFederatedAuthority,
} from '@aoc/enterprise/assurance/trust';
import type { FederatedAuthorityClaims, FederatedAuthorityRequest, TrustedSignerRecord } from '@aoc/enterprise/assurance/trust';
import { AuthorizationRuntime } from '@aoc-runtime/authorization-runtime';
import type { AuthorizationInput } from '@aoc-runtime/authorization-runtime';
import { ConsentRuntime } from '@aoc-runtime/consent-runtime';
import { IntegrityVerificationRuntime } from '@aoc-runtime/portable-cognition';

const T0 = '2026-01-01T00:00:00.000Z';
const AT = '2026-06-01T12:00:00.000Z';
const PROVENANCE = { runtimeSource: 'test-suite', timestamp: AT };
/** The registry clock: every trust decision in this suite is made at AT. */
const clock = () => Date.parse(AT);
const ORG_SCOPE: TrustBoundaryScope = { type: 'organization', organizationId: 'org:a' };

const root = createRuntimeAuthority('runtime:root', 'issuer:root', 'authority:root');
const member = createRuntimeAuthority('runtime:member', 'issuer:member', 'authority:member');
const outsider = createRuntimeAuthority('runtime:outsider', 'issuer:outsider', 'authority:outsider');

const recordFor = (authority: typeof root, organizationId = 'org:a', overrides: Partial<TrustedSignerRecord> = {}): TrustedSignerRecord => ({
  signerKeyId: authority.identity.keyId,
  publicKey: authority.identity.publicKey,
  authorityId: authority.identity.authorityId,
  issuerId: authority.identity.issuerId,
  runtimeId: authority.identity.runtimeId,
  organizationId,
  scopes: [ORG_SCOPE],
  registeredAt: T0,
  ...overrides,
});

const node = (authority: typeof root, overrides: Partial<RuntimeFederation['nodes'][number]> = {}) => ({
  runtimeId: authority.identity.runtimeId,
  organizationId: 'org:a',
  runtimeType: 'service' as const,
  authorityKeyIds: [authority.identity.keyId],
  scopes: [ORG_SCOPE],
  activeFrom: T0,
  ...overrides,
});

const edge = (overrides: Partial<RuntimeTrustEdge> = {}): RuntimeTrustEdge => ({
  edgeId: 'edge:root-member',
  fromRuntimeId: 'runtime:root',
  toRuntimeId: 'runtime:member',
  mode: 'direct-trust',
  scopes: [ORG_SCOPE],
  issuedAt: T0,
  ...overrides,
});

const federation = (edges: RuntimeTrustEdge[] = [edge()], nodes = [node(root), node(member)]): RuntimeFederation => ({
  federationId: 'fed:test',
  domain: 'test.invalid',
  nodes,
  edges,
});

const registry = (fed: RuntimeFederation = federation(), records: TrustedSignerRecord[] = [recordFor(root), recordFor(member)]) => {
  const r = new TrustRegistryRuntime(fed, { trustRoots: ['runtime:root'], now: clock });
  for (const record of records) r.registerSigner(record);
  return r;
};

const payload = { statement: 'federated decision' };
const sign = (authority: typeof root, value: unknown = payload): GovernanceSignature =>
  signPayload(value, authority.privateKey, authority.identity, PROVENANCE);

/** The outsider's own signature, labelled with a registered signer's public identifiers. */
const relabelled = (as: typeof root, value: unknown = payload): GovernanceSignature => ({
  ...sign(outsider, value),
  keyId: as.identity.keyId,
  signer: { ...as.identity, publicKey: outsider.identity.publicKey },
});

describe('TrustRegistryRuntime configuration', () => {
  it('requires at least one configured trust root', () => {
    expect(() => new TrustRegistryRuntime(federation(), { trustRoots: [] })).toThrow(/trust root/);
    expect(() => new TrustRegistryRuntime(federation(), undefined as never)).toThrow(/trust root/);
    expect(() => new TrustRegistryRuntime(federation(), { trustRoots: [' '] })).toThrow(/trust root/);
  });

  it('refuses signer records whose key material or key id is wrong', () => {
    const r = new TrustRegistryRuntime(federation(), { trustRoots: ['runtime:root'], now: clock });
    expect(() => r.registerSigner(recordFor(member, 'org:a', { publicKey: 'not-a-key' }))).toThrow();
    expect(() => r.registerSigner(recordFor(member, 'org:a', { publicKey: outsider.identity.publicKey }))).toThrow(/does not match/);
    expect(() => r.registerSigner(recordFor(member, 'org:a', { issuerId: 'issuer:other' }))).toThrow(/does not match/);
    expect(() => r.registerSigner({ ...recordFor(member), publicKey: undefined } as never)).toThrow();
  });
});

describe('TrustRegistryRuntime.verifySignatureTrust', () => {
  it('trusts a registered root signer and a member reachable from the root', () => {
    expect(registry().verifySignatureTrust(payload, sign(root), ORG_SCOPE)).toMatchObject({ trusted: true, trustedAuthorityPath: ['runtime:root'] });
    expect(registry().verifySignatureTrust(payload, sign(member), ORG_SCOPE)).toMatchObject({ trusted: true, trustedAuthorityPath: ['runtime:root', 'runtime:member'] });
  });

  it('rejects an unregistered signer', () => {
    expect(registry().verifySignatureTrust(payload, sign(outsider), ORG_SCOPE).trusted).toBe(false);
  });

  it('rejects a registered key id with an invalid signature and key', () => {
    const garbage: GovernanceSignature = { ...sign(member), signature: 'AAAA', signer: { ...member.identity, publicKey: 'not-a-key' } };
    expect(registry().verifySignatureTrust(payload, garbage, ORG_SCOPE).trusted).toBe(false);
  });

  it('rejects another key signing under a registered signer identity', () => {
    expect(registry().verifySignatureTrust(payload, relabelled(member), ORG_SCOPE).trusted).toBe(false);
    expect(registry().verifySignatureTrust(payload, relabelled(root), ORG_SCOPE).trusted).toBe(false);
  });

  it('rejects a genuine signature presented for a different payload', () => {
    expect(registry().verifySignatureTrust({ statement: 'other' }, sign(member), ORG_SCOPE).trusted).toBe(false);
  });

  it('rejects a genuine signature whose envelope claims another runtime', () => {
    const genuine = sign(member);
    const moved = { ...genuine, signer: { ...genuine.signer, runtimeId: 'runtime:root' } };
    expect(registry().verifySignatureTrust(payload, moved, ORG_SCOPE).trusted).toBe(false);
  });

  it('requires a scope, and one the signer is registered for', () => {
    expect(registry().verifySignatureTrust(payload, sign(member), undefined as never).trusted).toBe(false);
    expect(registry().verifySignatureTrust(payload, sign(member), { type: 'organization', organizationId: 'org:b' }).trusted).toBe(false);
  });

  it('rejects a signer whose runtime is not reachable from a configured trust root', () => {
    // member is an active federation node but no edge leads to it from the root.
    expect(registry(federation([])).verifySignatureTrust(payload, sign(member), ORG_SCOPE).trusted).toBe(false);
    // A root that is not a configured trust root does not count.
    const r = new TrustRegistryRuntime(federation([]), { trustRoots: ['runtime:root'], now: clock });
    r.registerSigner(recordFor(member));
    expect(r.verifySignatureTrust(payload, sign(member), ORG_SCOPE).trusted).toBe(false);
  });

  it('rejects a signer key its runtime does not list, and a runtime of another organization', () => {
    const unlisted = federation([edge()], [node(root), node(member, { authorityKeyIds: [] })]);
    expect(registry(unlisted).verifySignatureTrust(payload, sign(member), ORG_SCOPE).trusted).toBe(false);
    const otherOrg = federation([edge()], [node(root), node(member, { organizationId: 'org:b' })]);
    expect(registry(otherOrg).verifySignatureTrust(payload, sign(member), ORG_SCOPE).trusted).toBe(false);
  });

  it('rejects paths over revoked, expired, future or out-of-scope edges, and through inactive nodes', () => {
    const cases: RuntimeTrustEdge[] = [
      edge({ revokedAt: T0 }),
      edge({ expiresAt: T0 }),
      edge({ issuedAt: '2027-01-01T00:00:00.000Z' }),
      edge({ scopes: [{ type: 'organization', organizationId: 'org:b' }] }),
      edge({ scopes: [] }),
    ];
    for (const e of cases) expect(registry(federation([e])).verifySignatureTrust(payload, sign(member), ORG_SCOPE).trusted).toBe(false);
    const revokedRoot = federation([edge()], [node(root, { revokedAt: T0 }), node(member)]);
    expect(registry(revokedRoot).verifySignatureTrust(payload, sign(member), ORG_SCOPE).trusted).toBe(false);
    const futureMember = federation([edge()], [node(root), node(member, { activeFrom: '2027-01-01T00:00:00.000Z' })]);
    expect(registry(futureMember).verifySignatureTrust(payload, sign(member), ORG_SCOPE).trusted).toBe(false);
  });

  it('requires a delegated-authority edge into the signer runtime to name the signer key', () => {
    const without = federation([edge({ mode: 'delegated-authority', delegatedKeyIds: [] })]);
    expect(registry(without).verifySignatureTrust(payload, sign(member), ORG_SCOPE).trusted).toBe(false);
    const named = federation([edge({ mode: 'delegated-authority', delegatedKeyIds: [member.identity.keyId] })]);
    expect(registry(named).verifySignatureTrust(payload, sign(member), ORG_SCOPE).trusted).toBe(true);
  });

  it('rejects revoked, expired and not-yet-registered signers', () => {
    const r = registry();
    r.revokeSigner(member.identity.keyId, T0);
    expect(r.verifySignatureTrust(payload, sign(member), ORG_SCOPE)).toMatchObject({ trusted: false, revokedIntermediaries: [member.identity.keyId] });
    expect(registry(federation(), [recordFor(root), recordFor(member, 'org:a', { expiresAt: T0 })]).verifySignatureTrust(payload, sign(member), ORG_SCOPE).trusted).toBe(false);
    expect(registry(federation(), [recordFor(root), recordFor(member, 'org:a', { registeredAt: '2027-01-01T00:00:00.000Z' })]).verifySignatureTrust(payload, sign(member), ORG_SCOPE).trusted).toBe(false);
  });

  it('resolves trusted keys only for active signers', () => {
    const r = registry();
    expect(r.resolveTrustedKey(member.identity.keyId)?.publicKey).toBe(member.identity.publicKey);
    r.revokeSigner(member.identity.keyId, T0);
    expect(r.resolveTrustedKey(member.identity.keyId)).toBeUndefined();
    expect(r.resolveTrustedKey(outsider.identity.keyId)).toBeUndefined();
  });

  it('reads the signature envelope once, so one key id is checked for status, scope, chain and signature', () => {
    // A key id that names the root signer on its first read and the member afterwards.
    const genuine = sign(member);
    let reads = 0;
    const shifting = { ...genuine } as GovernanceSignature;
    Object.defineProperty(shifting, 'keyId', { get: () => (reads++ === 0 ? root.identity.keyId : member.identity.keyId) });
    expect(registry().verifySignatureTrust(payload, shifting, ORG_SCOPE).trusted).toBe(false);
    expect(reads).toBe(1);
  });

  it('rejects malformed envelopes', () => {
    const genuine = sign(member);
    const cases: unknown[] = [undefined, null, 'sig', { ...genuine, signer: undefined }, { ...genuine, algorithm: 'rsa' }, { ...genuine, signer: { ...genuine.signer, publicKey: 1 } }];
    for (const c of cases) expect(registry().verifySignatureTrust(payload, c as GovernanceSignature, ORG_SCOPE).trusted).toBe(false);
    const throwing = { ...genuine } as GovernanceSignature;
    Object.defineProperty(throwing, 'signer', { get: () => { throw new Error('trap'); } });
    expect(registry().verifySignatureTrust(payload, throwing, ORG_SCOPE).trusted).toBe(false);
  });

  it('no longer exposes the payload-less evaluation', () => {
    expect((registry() as unknown as Record<string, unknown>).evaluateSignatureTrust).toBeUndefined();
  });
});

const AUDIENCE = 'runtime:verifier';
const request = (overrides: Partial<FederatedAuthorityRequest> = {}): FederatedAuthorityRequest => ({
  actor: { actorId: 'actor:alice', actorType: 'human', organizationId: 'org:a' },
  action: 'records.write',
  resource: 'record:1',
  scopeId: 'scope:a',
  namespace: { organizationId: 'org:a', workspaceId: 'ws:1', path: '/org/a/ws/1' },
  trustScope: ORG_SCOPE,
  ...overrides,
});
const claims = (overrides: Partial<FederatedAuthorityClaims> = {}): FederatedAuthorityClaims => ({
  audience: AUDIENCE,
  issuedAt: '2026-06-01T11:59:00.000Z',
  expiresAt: '2026-06-01T12:03:00.000Z',
  nonce: 'nonce-0123456789abcdef',
  ...overrides,
});
const verifier = (r = registry()) => new FederatedAuthorityVerifier({ registry: r, audience: AUDIENCE, replayGuard: new InMemoryFederatedAuthorityReplayGuard() });
const assert = (authority: typeof root = member, req = request(), c = claims()) =>
  signFederatedAuthority(req, c, authority.privateKey, authority.identity, PROVENANCE);

describe('FederatedAuthorityVerifier', () => {
  it('requires a registry, an audience and a replay guard', () => {
    const replayGuard = new InMemoryFederatedAuthorityReplayGuard();
    expect(() => new FederatedAuthorityVerifier({ registry: undefined as never, audience: AUDIENCE, replayGuard })).toThrow(/registry/);
    expect(() => new FederatedAuthorityVerifier({ registry: registry(), audience: ' ', replayGuard })).toThrow(/audience/);
    expect(() => new FederatedAuthorityVerifier({ registry: registry(), audience: AUDIENCE, replayGuard: undefined as never })).toThrow(/replay guard/);
    expect(() => new FederatedAuthorityVerifier({ registry: registry(), audience: AUDIENCE, replayGuard, maxLifetimeSeconds: 0 })).toThrow();
  });

  it('accepts an assertion from a trusted signer for this exact request', async () => {
    expect(await verifier().verify(request(), assert())).toMatchObject({ trusted: true, trustedAuthorityPath: ['runtime:root', 'runtime:member'] });
  });

  it('accepts an assertion only once', async () => {
    const v = verifier();
    const a = assert();
    expect((await v.verify(request(), a)).trusted).toBe(true);
    expect((await v.verify(request(), a)).trusted).toBe(false);
  });

  it('does not let an unverified assertion use up a nonce', async () => {
    const v = verifier();
    expect((await v.verify(request(), { ...assert(), signature: relabelled(member, buildFederatedAuthorityPayload(request(), claims())) })).trusted).toBe(false);
    expect((await v.verify(request(), assert())).trusted).toBe(true);
  });

  it.each<[string, Partial<FederatedAuthorityRequest>]>([
    ['actor', { actor: { actorId: 'actor:mallory', actorType: 'human', organizationId: 'org:a' } }],
    ['actor type', { actor: { actorId: 'actor:alice', actorType: 'machine', organizationId: 'org:a' } }],
    ['machine actor', { machineActorId: 'machine:1' }],
    ['action', { action: 'records.delete' }],
    ['resource', { resource: 'record:2' }],
    ['scope id', { scopeId: 'scope:b' }],
    ['namespace path', { namespace: { organizationId: 'org:a', workspaceId: 'ws:1', path: '/org/a/ws/2' } }],
    ['workspace', { namespace: { organizationId: 'org:a', workspaceId: 'ws:2', path: '/org/a/ws/1' } }],
  ])('rejects an assertion signed for one request and presented for another %s', async (_label, change) => {
    expect((await verifier().verify(request(change), assert())).trusted).toBe(false);
  });

  it.each<[string, Partial<FederatedAuthorityClaims>]>([
    ['audience', { audience: 'runtime:elsewhere' }],
    ['nonce', { nonce: 'nonce-fedcba9876543210' }],
    ['issuedAt', { issuedAt: '2026-06-01T11:58:00.000Z' }],
    ['expiresAt', { expiresAt: '2026-06-01T12:04:00.000Z' }],
  ])('rejects claims whose %s differs from what was signed', async (_label, change) => {
    const signedClaims = assert();
    expect((await verifier().verify(request(), { ...signedClaims, claims: { ...signedClaims.claims, ...change } })).trusted).toBe(false);
  });

  it('rejects assertions addressed to another audience, even when signed for it', async () => {
    expect((await verifier().verify(request(), assert(member, request(), claims({ audience: 'runtime:elsewhere' })))).trusted).toBe(false);
  });

  it('enforces the validity window, the maximum lifetime and the nonce length', async () => {
    const cases: Partial<FederatedAuthorityClaims>[] = [
      { issuedAt: '2026-06-01T11:50:00.000Z', expiresAt: '2026-06-01T11:54:00.000Z' }, // expired
      { issuedAt: '2026-06-01T12:10:00.000Z', expiresAt: '2026-06-01T12:12:00.000Z' }, // not yet valid
      { issuedAt: '2026-06-01T11:00:00.000Z', expiresAt: '2026-06-01T13:00:00.000Z' }, // lifetime too long
      { issuedAt: '2026-06-01T12:01:00.000Z', expiresAt: '2026-06-01T12:00:30.000Z' }, // expires before issued
      { issuedAt: 'not-a-time' },
      { nonce: 'short' },
      { nonce: '' },
    ];
    for (const c of cases) expect((await verifier().verify(request(), assert(member, request(), claims(c)))).trusted).toBe(false);
  });

  it('requires the trust scope to name the request organization and agree with its narrower fields', async () => {
    const cases: TrustBoundaryScope[] = [
      { type: 'organization' },
      { type: 'organization', organizationId: 'org:b' },
      { type: 'organization', organizationId: 'org:a', workspaceId: 'ws:2' },
      { type: 'organization', organizationId: 'org:a', namespacePath: '/elsewhere' },
      { type: 'organization', organizationId: 'org:a', machineId: 'machine:9' },
    ];
    for (const trustScope of cases) {
      const req = request({ trustScope });
      expect((await verifier().verify(req, assert(member, req))).trusted).toBe(false);
    }
  });

  it('rejects assertions from untrusted or relabelled signers', async () => {
    expect((await verifier().verify(request(), assert(outsider))).trusted).toBe(false);
    const forged = { claims: claims(), signature: relabelled(member, buildFederatedAuthorityPayload(request(), claims())) };
    expect((await verifier().verify(request(), forged)).trusted).toBe(false);
  });

  it('records the nonce under the key id that was verified', async () => {
    const seen: string[] = [];
    const v = new FederatedAuthorityVerifier({ registry: registry(), audience: AUDIENCE, replayGuard: { consume: (key) => { seen.push(key); return true; } } });
    const a = assert();
    let reads = 0;
    const shifting = { ...a.signature } as GovernanceSignature;
    Object.defineProperty(shifting, 'keyId', { get: () => (reads++ === 0 ? member.identity.keyId : 'other-key') });
    expect((await v.verify(request(), { claims: a.claims, signature: shifting })).trusted).toBe(true);
    expect(seen).toEqual([`${member.identity.keyId}:${a.claims.nonce}`]);
  });

  it('fails closed when the replay guard fails or the assertion is malformed', async () => {
    const failing = new FederatedAuthorityVerifier({ registry: registry(), audience: AUDIENCE, replayGuard: { consume: async () => { throw new Error('store down'); } } });
    expect((await failing.verify(request(), assert())).trusted).toBe(false);
    const undecided = new FederatedAuthorityVerifier({ registry: registry(), audience: AUDIENCE, replayGuard: { consume: () => 'yes' as never } });
    expect((await undecided.verify(request(), assert())).trusted).toBe(false);
    expect((await verifier().verify(request(), undefined as never)).trusted).toBe(false);
    expect((await verifier().verify(request(), { claims: undefined, signature: sign(member) } as never)).trusted).toBe(false);
  });
});

describe('AuthorizationRuntime federated authority gate', () => {
  // Downstream stages allow, so these tests isolate the federated-authority gate.
  const allow = { evaluate: async () => ({ allowed: true, reasons: ['allowed'], matchedCapability: { capabilityId: 'cap:1' }, policySourceIds: [], inheritedScopeChain: [] }) };
  const audit = { finalizeDecision: (decision: unknown) => decision };
  const runtime = (v?: FederatedAuthorityVerifier) => new AuthorizationRuntime(allow as never, allow as never, allow as never, audit as never, v);

  const input = (federated?: AuthorizationInput['federatedAuthority'], overrides: Partial<AuthorizationInput> = {}): AuthorizationInput => ({
    actor: { actorId: 'actor:alice', actorType: 'human', organizationId: 'org:a' },
    namespace: { organizationId: 'org:a', workspaceId: 'ws:1', path: '/org/a/ws/1' },
    scope: { scopeId: 'scope:a', namespace: { organizationId: 'org:a', workspaceId: 'ws:1', path: '/org/a/ws/1' }, allowedActorTypes: ['human'] },
    action: 'records.write',
    resource: 'record:1',
    at: AT,
    ...(federated === undefined ? {} : { federatedAuthority: federated }),
    ...overrides,
  });
  const federatedFor = (authority: typeof root = member, c = claims()) => {
    const a = assert(authority, request(), c);
    return { claims: a.claims, signature: a.signature, scope: ORG_SCOPE };
  };

  it('denies a supplied federated authority when no verifier is configured', async () => {
    const decision = await runtime().evaluate(input(federatedFor()));
    expect(decision).toMatchObject({ allowed: false, failedStage: 'governance' });
  });

  it('allows a valid federated authority bound to this request, once', async () => {
    const r = runtime(verifier());
    const federated = federatedFor();
    expect((await r.evaluate(input(federated))).allowed).toBe(true);
    expect(await r.evaluate(input(federated))).toMatchObject({ allowed: false, failedStage: 'governance' });
  });

  it('denies an untrusted, relabelled or garbage federated authority', async () => {
    expect((await runtime(verifier()).evaluate(input(federatedFor(outsider)))).allowed).toBe(false);
    const forged = { claims: claims(), signature: relabelled(member, buildFederatedAuthorityPayload(request(), claims())), scope: ORG_SCOPE };
    expect((await runtime(verifier()).evaluate(input(forged))).allowed).toBe(false);
    const garbage = { claims: claims(), signature: { ...sign(member), signature: 'AAAA', payloadHash: 'x' }, scope: ORG_SCOPE };
    expect((await runtime(verifier()).evaluate(input(garbage))).allowed).toBe(false);
  });

  it('denies a federated authority signed for another action, resource or actor', async () => {
    const federated = federatedFor();
    expect((await runtime(verifier()).evaluate(input(federated, { action: 'records.delete' }))).allowed).toBe(false);
    expect((await runtime(verifier()).evaluate(input(federated, { resource: 'record:2' }))).allowed).toBe(false);
    expect((await runtime(verifier()).evaluate(input(federated, { actor: { actorId: 'actor:mallory', actorType: 'human', organizationId: 'org:a' } }))).allowed).toBe(false);
  });

  it('leaves requests without a federated authority to the other stages', async () => {
    expect((await runtime().evaluate(input())).allowed).toBe(true);
    expect((await runtime(verifier()).evaluate(input())).allowed).toBe(true);
  });
});

describe('Consent grant and portable integrity verification', () => {
  const grant = { grantId: 'grant:1', subjectActorId: 'actor:alice', delegateActorId: 'actor:bob', capability: { capabilityId: 'cap:1' } as never, issuedAt: T0 };
  const grantHash = stableHash(grant);
  const trustedKeys = createTrustedKeySet([member.identity]);
  const genuine = { grant, grantHash, issuerSignature: sign(member, { grantHash, grant }) };
  const forged = { grant, grantHash, issuerSignature: relabelled(member, { grantHash, grant }) };
  const consent = new ConsentRuntime({} as never);

  it('accepts a grant signed by a trusted key', () => {
    expect(consent.verifySignedGrant(genuine, trustedKeys)).toBe(true);
    expect(new IntegrityVerificationRuntime(trustedKeys).verifyConsentGrant(genuine)).toBe(true);
  });

  it('rejects a grant signed by another key under a trusted identity, or by an unconfigured key', () => {
    expect(consent.verifySignedGrant(forged, trustedKeys)).toBe(false);
    expect(new IntegrityVerificationRuntime(trustedKeys).verifyConsentGrant(forged)).toBe(false);
    const own = { grant, grantHash, issuerSignature: sign(outsider, { grantHash, grant }) };
    expect(consent.verifySignedGrant(own, trustedKeys)).toBe(false);
  });

  it('rejects a grant whose delegated or revocation signature is not from a trusted key', () => {
    expect(consent.verifySignedGrant({ ...genuine, delegatedSignature: relabelled(member, { grantHash, grant, delegated: true }) }, trustedKeys)).toBe(false);
    expect(consent.verifySignedGrant({ ...genuine, delegatedSignature: sign(member, { grantHash, grant, delegated: true }) }, trustedKeys)).toBe(true);
  });

  it('fails closed without trusted keys', () => {
    expect(consent.verifySignedGrant(genuine, undefined as never)).toBe(false);
    expect(new IntegrityVerificationRuntime(undefined as never).verifyConsentGrant(genuine)).toBe(false);
  });

  it('rejects a signed authorization decision from an untrusted key', () => {
    const decision = { outcome: 'allow' };
    const decisionHash = stableHash(decision);
    const evaluationHash = stableHash({ evaluation: 1 });
    const value = { decisionHash, evaluationHash, decision };
    const runtimeCheck = new IntegrityVerificationRuntime(trustedKeys);
    expect(runtimeCheck.verifyAuthorizationDecision({ decision, decisionHash, evaluationHash, signature: sign(member, value) })).toBe(true);
    expect(runtimeCheck.verifyAuthorizationDecision({ decision, decisionHash, evaluationHash, signature: relabelled(member, value) })).toBe(false);
  });
});
