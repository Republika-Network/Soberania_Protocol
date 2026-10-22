/**
 * Federated trust: who decides the time, how timestamps are read, which scopes
 * apply, and what policies may see.
 *
 * - The registry clock is the only verification time. A caller-supplied time
 *   is checked against it, never used in its place.
 * - Timestamps are RFC 3339 with an explicit zone, compared as numbers.
 *   Anything else is rejected, and malformed revocation or expiry data fails
 *   closed.
 * - The signer runtime's own scopes must allow the requested scope.
 * - Policies see only what verification authenticated.
 * - A resolver's answer is read once.
 */
import { createRuntimeAuthority, signPayload, verifyPayloadSignature } from '@aoc-runtime/crypto';
import type { GovernanceSignature, RuntimeFederation, RuntimeTrustEdge, TrustBoundaryScope } from '@aoc-runtime/shared-types';
import {
  FederatedAuthorityVerifier,
  InMemoryFederatedAuthorityReplayGuard,
  TrustRegistryRuntime,
  parseTrustTimestamp,
  signFederatedAuthority,
} from '@aoc/enterprise/assurance/trust';
import type { FederatedAuthorityClaims, FederatedAuthorityRequest, TrustedSignerRecord } from '@aoc/enterprise/assurance/trust';
import { AuthorizationRuntime } from '@aoc-runtime/authorization-runtime';
import type { AuthorizationInput, RuntimePolicy } from '@aoc-runtime/authorization-runtime';

const T0 = '2026-01-01T00:00:00.000Z';
const AT = '2026-06-01T12:00:00.000Z';
const AT_MS = Date.parse(AT);
const PROVENANCE = { runtimeSource: 'test-suite', timestamp: AT };
const ORG_SCOPE: TrustBoundaryScope = { type: 'organization', organizationId: 'org:a' };

const root = createRuntimeAuthority('runtime:root', 'issuer:root', 'authority:root');
const member = createRuntimeAuthority('runtime:member', 'issuer:member', 'authority:member');
const outsider = createRuntimeAuthority('runtime:outsider', 'issuer:outsider', 'authority:outsider');

/** A clock the test moves explicitly. */
const manualClock = (start = AT_MS) => {
  let current = start;
  const now = () => current;
  return { now, set: (ms: number) => { current = ms; } };
};

const recordFor = (authority: typeof root, overrides: Partial<TrustedSignerRecord> = {}): TrustedSignerRecord => ({
  signerKeyId: authority.identity.keyId,
  publicKey: authority.identity.publicKey,
  authorityId: authority.identity.authorityId,
  issuerId: authority.identity.issuerId,
  runtimeId: authority.identity.runtimeId,
  organizationId: 'org:a',
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
  federationId: 'fed:test', domain: 'test.invalid', nodes, edges,
});

const registry = (now: () => number = () => AT_MS, fed = federation(), records = [recordFor(root), recordFor(member)]) => {
  const r = new TrustRegistryRuntime(fed, { trustRoots: ['runtime:root'], now });
  for (const record of records) r.registerSigner(record);
  return r;
};

const payload = { statement: 'federated decision' };
const sign = (authority: typeof root, value: unknown = payload): GovernanceSignature =>
  signPayload(value, authority.privateKey, authority.identity, PROVENANCE);

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
const EXPIRES_MS = Date.parse('2026-06-01T12:03:00.000Z');
const SKEW_MS = 30_000;
const assertion = (authority: typeof root = member, req = request(), c = claims()) =>
  signFederatedAuthority(req, c, authority.privateKey, authority.identity, PROVENANCE);
const verifier = (r: TrustRegistryRuntime) => new FederatedAuthorityVerifier({ registry: r, audience: AUDIENCE, replayGuard: new InMemoryFederatedAuthorityReplayGuard() });

// Downstream stages allow, so these tests isolate the federated gate and the policy stage.
const allow = { evaluate: async () => ({ allowed: true, reasons: ['allowed'], matchedCapability: { capabilityId: 'cap:1' }, policySourceIds: [], inheritedScopeChain: [] }) };
const audit = { finalizeDecision: (decision: unknown) => decision };
const authorization = (v?: FederatedAuthorityVerifier) => new AuthorizationRuntime(allow as never, allow as never, allow as never, audit as never, v);
const authorizationInput = (federated?: AuthorizationInput['federatedAuthority'], overrides: Partial<AuthorizationInput> = {}): AuthorizationInput => ({
  actor: { actorId: 'actor:alice', actorType: 'human', organizationId: 'org:a' },
  namespace: { organizationId: 'org:a', workspaceId: 'ws:1', path: '/org/a/ws/1' },
  scope: { scopeId: 'scope:a', namespace: { organizationId: 'org:a', workspaceId: 'ws:1', path: '/org/a/ws/1' }, allowedActorTypes: ['human'] },
  action: 'records.write',
  resource: 'record:1',
  ...(federated === undefined ? {} : { federatedAuthority: federated }),
  ...overrides,
});
const federatedFor = (authority: typeof root = member, c = claims()) => {
  const a = assertion(authority, request(), c);
  return { claims: a.claims, signature: a.signature, scope: ORG_SCOPE };
};

describe('The registry clock is the only verification time', () => {
  it('does not accept a caller-supplied time in place of the clock', () => {
    // A trailing time argument, as the previous API took, has no effect: the signer revoked before the clock stays revoked.
    const r = registry();
    r.revokeSigner(member.identity.keyId, '2026-06-01T11:00:00.000Z');
    const legacyCall = r.verifySignatureTrust as unknown as (...args: unknown[]) => { trusted: boolean };
    expect(legacyCall.call(r, payload, sign(member), ORG_SCOPE, '2026-06-01T10:00:00.000Z').trusted).toBe(false);
    expect((r.resolveTrustedKey as unknown as (...args: unknown[]) => unknown).call(r, member.identity.keyId, '2026-06-01T10:00:00.000Z')).toBeUndefined();
  });

  it('reports the instant it decided at', () => {
    expect(registry().verifySignatureTrust(payload, sign(member), ORG_SCOPE)).toMatchObject({ trusted: true, evaluatedAt: AT_MS });
  });

  it('rejects an expired assertion even when the caller claims an earlier evaluation time', async () => {
    const clock = manualClock(EXPIRES_MS + SKEW_MS + 1);
    const result = await verifier(registry(clock.now)).verify(request(), assertion(), { requestedAt: AT });
    expect(result.trusted).toBe(false);
  });

  it('does not let a backdated evaluation time revive a consumed assertion after the guard has dropped it', async () => {
    const clock = manualClock();
    const v = verifier(registry(clock.now));
    const a = assertion();
    expect((await v.verify(request(), a)).trusted).toBe(true);
    clock.set(EXPIRES_MS + SKEW_MS + 60_000); // past retention: the guard may forget the nonce
    expect((await v.verify(request(), a, { requestedAt: AT })).trusted).toBe(false);
    expect((await v.verify(request(), a)).trusted).toBe(false);
  });

  it('accepts a caller time within the skew and rejects one outside it or malformed', async () => {
    const r = registry();
    expect((await verifier(r).verify(request(), assertion(), { requestedAt: '2026-06-01T12:00:20.000Z' })).trusted).toBe(true);
    for (const requestedAt of ['2026-06-01T11:59:00.000Z', '2026-06-01T12:01:00.000Z', 'garbage', 'Mon Jun 01 2026', '']) {
      expect((await verifier(r).verify(request(), assertion(member, request(), claims({ nonce: `nonce-${requestedAt}-0123456789` })), { requestedAt })).trusted).toBe(false);
    }
  });

  it('denies through AuthorizationRuntime when input.at is backdated, and allows the clock time', async () => {
    const clock = manualClock();
    const runtime = authorization(verifier(registry(clock.now)));
    expect((await runtime.evaluate(authorizationInput(federatedFor(), { at: '2026-06-01T11:00:00.000Z' }))).allowed).toBe(false);
    expect((await runtime.evaluate(authorizationInput(federatedFor(member, claims({ nonce: 'nonce-second-0123456789' })), { at: AT }))).allowed).toBe(true);
  });

  it('applies the validity window at the clock, to the millisecond, with the skew on both ends', async () => {
    const ISSUED_MS = Date.parse('2026-06-01T11:59:00.000Z');
    const cases: Array<[number, boolean]> = [
      [EXPIRES_MS + SKEW_MS, true],
      [EXPIRES_MS + SKEW_MS + 1, false],
      [ISSUED_MS - SKEW_MS, true],
      [ISSUED_MS - SKEW_MS - 1, false],
    ];
    for (const [at, accepted] of cases) {
      const clock = manualClock(at);
      expect((await verifier(registry(clock.now)).verify(request(), assertion())).trusted).toBe(accepted);
    }
  });

  it('fails closed when the clock throws or is not finite', async () => {
    for (const now of [() => { throw new Error('clock'); }, () => Number.NaN, () => 'soon' as unknown as number]) {
      const r = registry(now);
      expect(r.verifySignatureTrust(payload, sign(member), ORG_SCOPE).trusted).toBe(false);
      expect(r.resolveTrustedKey(member.identity.keyId)).toBeUndefined();
      expect((await verifier(r).verify(request(), assertion())).trusted).toBe(false);
    }
    expect(() => new TrustRegistryRuntime(federation(), { trustRoots: ['runtime:root'], now: 5 as never })).toThrow(/clock/);
  });

  it('uses the clock for a revocation without an explicit time', () => {
    const clock = manualClock(Date.parse('2026-03-01T00:00:00.000Z'));
    const r = registry(clock.now);
    r.revokeSigner(member.identity.keyId);
    clock.set(AT_MS);
    expect(r.verifySignatureTrust(payload, sign(member), ORG_SCOPE).trusted).toBe(false);
  });
});

describe('Timestamps are strict RFC 3339 with an explicit zone, compared numerically', () => {
  it('parses zoned timestamps to epoch milliseconds', () => {
    expect(parseTrustTimestamp('2026-06-01T12:00:00Z')).toBe(AT_MS);
    expect(parseTrustTimestamp('2026-06-01T12:00:00.000Z')).toBe(AT_MS);
    expect(parseTrustTimestamp('2026-06-01T17:00:00+05:00')).toBe(AT_MS);
    expect(parseTrustTimestamp('2026-06-01T07:00:00-05:00')).toBe(AT_MS);
    expect(parseTrustTimestamp('2026-06-01T12:00:00.123456789Z')).toBe(AT_MS + 123);
    expect(parseTrustTimestamp('2024-02-29T00:00:00Z')).toBe(Date.UTC(2024, 1, 29));
  });

  it.each([
    'garbage', 'Mon Jan 01 2024', '2026-06-01', '2026-06-01T12:00:00', '2026-06-01 12:00:00Z', '2026-06-01T12:00Z',
    '2026-02-30T00:00:00Z', '2025-02-29T00:00:00Z', '2026-13-01T00:00:00Z', '2026-06-01T24:00:00Z', '2026-06-01T12:60:00Z',
    '2026-06-01T12:00:60Z', '2026-06-01T12:00:00+24:00', '2026-06-01T12:00:00+05', '2026-06-01t12:00:00z', '',
  ])('rejects %p', (value) => {
    expect(parseTrustTimestamp(value)).toBeUndefined();
  });

  it.each([0, 1748779200000, null, undefined, {}, new Date(AT_MS)])('rejects the non-string %p', (value) => {
    expect(parseTrustTimestamp(value)).toBeUndefined();
  });

  it('honours a revocation written with a zone offset', () => {
    // 13:00+05:00 is 08:00Z, before the 12:00Z clock.
    const r = registry(() => AT_MS, federation([edge({ revokedAt: '2026-06-01T13:00:00+05:00' })]));
    expect(r.verifySignatureTrust(payload, sign(member), ORG_SCOPE).trusted).toBe(false);
    const signerRevoked = registry(() => AT_MS, federation(), [recordFor(root), recordFor(member, { revokedAt: '2026-06-01T07:00:00-04:00' })]);
    expect(signerRevoked.verifySignatureTrust(payload, sign(member), ORG_SCOPE).trusted).toBe(false);
  });

  it('refuses malformed signer and federation timestamps when configured', () => {
    const r = new TrustRegistryRuntime(federation(), { trustRoots: ['runtime:root'], now: () => AT_MS });
    for (const overrides of [{ revokedAt: 1748779200000 }, { revokedAt: 'Mon Jan 01 2024' }, { expiresAt: 'garbage' }, { registeredAt: '2026-01-01' }, { revokedAt: null }]) {
      expect(() => r.registerSigner(recordFor(member, overrides as never))).toThrow(/RFC 3339/);
    }
    expect(() => r.revokeSigner(member.identity.keyId, '2026-06-01')).toThrow(/RFC 3339/);
    expect(() => registry(() => AT_MS, federation([edge({ revokedAt: 1748779200000 as never })]))).toThrow(/RFC 3339/);
    expect(() => registry(() => AT_MS, federation([edge({ issuedAt: 'yesterday' })]))).toThrow(/RFC 3339/);
    expect(() => registry(() => AT_MS, federation([edge()], [node(root), node(member, { activeUntil: '2027-01-01' })]))).toThrow(/RFC 3339/);
  });

  it('fails closed on malformed revocation, expiry or start data that appears after configuration', () => {
    const cases: Array<(fed: RuntimeFederation) => void> = [
      (fed) => { fed.edges[0].revokedAt = 'not-a-time'; },
      (fed) => { fed.edges[0].expiresAt = 1748779200000 as never; },
      (fed) => { fed.edges[0].issuedAt = 'Mon Jan 01 2024'; },
      (fed) => { fed.nodes[1].revokedAt = 'not-a-time'; },
      (fed) => { fed.nodes[1].activeFrom = '2026-01-01'; },
    ];
    for (const mutate of cases) {
      const fed = federation();
      const r = registry(() => AT_MS, fed);
      expect(r.verifySignatureTrust(payload, sign(member), ORG_SCOPE).trusted).toBe(true);
      mutate(fed);
      expect(r.verifySignatureTrust(payload, sign(member), ORG_SCOPE).trusted).toBe(false);
    }
  });

  it('rejects assertion claims whose timestamps are not strict RFC 3339', async () => {
    for (const c of [{ issuedAt: 'Mon Jun 01 2026 11:59:00 GMT' }, { expiresAt: '2026-06-01T12:03:00' }, { issuedAt: '1748779140000' }]) {
      expect((await verifier(registry()).verify(request(), assertion(member, request(), claims(c)))).trusted).toBe(false);
    }
  });
});

describe('The replay guard compares retention numerically', () => {
  it('retains a key through its retention instant and forgets it only afterwards', () => {
    const guard = new InMemoryFederatedAuthorityReplayGuard();
    expect(guard.consume('k', 1000, 0)).toBe(true);
    expect(guard.consume('k', 1000, 1000)).toBe(false);
    expect(guard.consume('k', 2000, 1001)).toBe(true);
  });

  it('refuses non-finite times', () => {
    const guard = new InMemoryFederatedAuthorityReplayGuard();
    expect(guard.consume('k', Number.NaN, 0)).toBe(false);
    expect(guard.consume('k', 1000, Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('still rejects the replay at exactly expiry plus skew', async () => {
    const clock = manualClock();
    const v = verifier(registry(clock.now));
    const a = assertion();
    expect((await v.verify(request(), a)).trusted).toBe(true);
    clock.set(EXPIRES_MS + SKEW_MS);
    const replay = await v.verify(request(), a);
    expect(replay.trusted).toBe(false);
    expect(replay.trustScopeReasoning).toEqual(['Federated authority has already been used.']);
  });

  it('accepts concurrent presentations of one assertion exactly once', async () => {
    const v = verifier(registry());
    const a = assertion();
    const results = await Promise.all(Array.from({ length: 20 }, () => v.verify(request(), a)));
    expect(results.filter((result) => result.trusted)).toHaveLength(1);
  });
});

describe('The signer runtime\'s own scopes apply', () => {
  const wildcard: TrustBoundaryScope = { type: 'organization' };
  const wide = (nodeScopes: TrustBoundaryScope[]) => registry(
    () => AT_MS,
    federation([edge({ scopes: [wildcard] })], [node(root, { scopes: [wildcard] }), node(member, { scopes: nodeScopes })]),
    [recordFor(root, { scopes: [wildcard] }), recordFor(member, { scopes: [wildcard] })],
  );

  it('rejects a scope the signer runtime is not scoped to, even when signer and edges allow it', () => {
    expect(wide([ORG_SCOPE]).verifySignatureTrust(payload, sign(member), { type: 'organization', organizationId: 'org:z' }).trusted).toBe(false);
    expect(wide([]).verifySignatureTrust(payload, sign(member), ORG_SCOPE).trusted).toBe(false);
  });

  it('accepts a scope the signer runtime allows', () => {
    expect(wide([ORG_SCOPE]).verifySignatureTrust(payload, sign(member), ORG_SCOPE).trusted).toBe(true);
  });
});

describe('Policies see only the authenticated view of a federated authority', () => {
  const clearancePolicy: RuntimePolicy = {
    id: 'policy:clearance', effect: 'allow',
    condition: { op: 'equals', left: { path: 'federatedAuthority.provenance.clearance' }, right: 'top-secret' },
  } as RuntimePolicy;

  it('does not let a policy read unsigned provenance attached to a genuine assertion', async () => {
    const runtime = authorization(verifier(registry()));
    const federated = { ...federatedFor(), provenance: { clearance: 'top-secret' } };
    const decision = await runtime.evaluate(authorizationInput(federated, { policies: [clearancePolicy] }));
    expect(decision).toMatchObject({ allowed: false, failedStage: 'policy' });
  });

  it.each([
    ['signature.signedAt', '2099-01-01T00:00:00.000Z'],
    ['signature.provenance.runtimeSource', 'test-suite'],
    ['signature.signature', 'x'],
  ])('does not expose the unsigned envelope field %s', async (path) => {
    const runtime = authorization(verifier(registry()));
    const exists = { id: 'policy:exists', effect: 'allow', condition: { op: 'exists', field: { path: `federatedAuthority.${path}` } } } as RuntimePolicy;
    expect((await runtime.evaluate(authorizationInput(federatedFor(), { policies: [exists] }))).allowed).toBe(false);
  });

  it('lets a policy read the verified signer, claims and trust path', async () => {
    const runtime = authorization(verifier(registry()));
    const policies = [
      { id: 'policy:issuer', effect: 'allow', condition: { op: 'and', conditions: [
        { op: 'equals', left: { path: 'federatedAuthority.verified' }, right: true },
        { op: 'equals', left: { path: 'federatedAuthority.signer.issuerId' }, right: member.identity.issuerId },
        { op: 'equals', left: { path: 'federatedAuthority.claims.audience' }, right: AUDIENCE },
        { op: 'contains', left: { path: 'federatedAuthority.trustedAuthorityPath' }, right: 'runtime:root' },
      ] } },
    ] as RuntimePolicy[];
    expect((await runtime.evaluate(authorizationInput(federatedFor(), { policies }))).allowed).toBe(true);
  });

  it('verifies before policy evaluation: an invalid authority is denied at the federated gate even when policy would deny', async () => {
    const runtime = authorization(verifier(registry()));
    const denyAll = { id: 'policy:deny', effect: 'deny', condition: { op: 'exists', field: { path: 'action' } } } as RuntimePolicy;
    const decision = await runtime.evaluate(authorizationInput(federatedFor(outsider), { policies: [denyAll] }));
    expect(decision).toMatchObject({ allowed: false, failedStage: 'governance' });
  });

  it('leaves policy evaluation of requests without a federated authority unchanged', async () => {
    const runtime = authorization();
    const actorPolicy = { id: 'policy:actor', effect: 'allow', condition: { op: 'equals', left: { path: 'actor.actorId' }, right: 'actor:alice' } } as RuntimePolicy;
    expect((await runtime.evaluate(authorizationInput(undefined, { policies: [actorPolicy] }))).allowed).toBe(true);
    expect((await runtime.evaluate(authorizationInput(undefined, { policies: [actorPolicy], actor: { actorId: 'actor:bob', actorType: 'human', organizationId: 'org:a' } }))).allowed).toBe(false);
  });
});

describe('A resolver\'s answer is read once', () => {
  it('verifies with the same key it compared, even when the resolver result changes between reads', () => {
    // The envelope claims the member's real key but is signed by the outsider.
    const forged: GovernanceSignature = { ...signPayload(payload, outsider.privateKey, outsider.identity, PROVENANCE), keyId: member.identity.keyId, signer: { ...member.identity } };
    let reads = 0;
    const shifting = { ...member.identity } as Record<string, unknown>;
    Object.defineProperty(shifting, 'publicKey', { get: () => (reads++ === 0 ? member.identity.publicKey : outsider.identity.publicKey) });
    expect(verifyPayloadSignature(payload, forged, { resolveTrustedKey: () => shifting as never })).toBe(false);
    expect(reads).toBe(1);
  });

  it('rejects a resolver result whose fields are not strings', () => {
    const genuine = sign(member);
    expect(verifyPayloadSignature(payload, genuine, { resolveTrustedKey: () => ({ ...member.identity, publicKey: 1 }) as never })).toBe(false);
    expect(verifyPayloadSignature(payload, genuine, { resolveTrustedKey: () => 'key' as never })).toBe(false);
  });
});

describe('A verified assertion stays spent after a later denial', () => {
  it('does not restore the nonce when policy denies, so a retry needs a new assertion', async () => {
    const runtime = authorization(verifier(registry()));
    const federated = federatedFor();
    const denyAll = { id: 'policy:deny', effect: 'deny', condition: { op: 'exists', field: { path: 'action' } } } as RuntimePolicy;
    expect(await runtime.evaluate(authorizationInput(federated, { policies: [denyAll] }))).toMatchObject({ allowed: false, failedStage: 'policy' });
    const retry = await runtime.evaluate(authorizationInput(federated));
    expect(retry).toMatchObject({ allowed: false, failedStage: 'governance' });
    expect(retry.explainability).toMatchObject({ trust: { trustScopeReasoning: ['Federated authority has already been used.'] } });
    expect((await runtime.evaluate(authorizationInput(federatedFor(member, claims({ nonce: 'nonce-reissued-0123456789' })))))).toMatchObject({ allowed: true });
  });
});
