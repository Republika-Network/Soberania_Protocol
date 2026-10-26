/**
 * NEW-1 (SOBE-SEC-03 independent review) — timestamp type confusion in the pilot runtime packages.
 *
 * `ConsentRuntime` and `CapabilityRuntime` compared timestamps as strings behind a truthiness
 * guard, so a `Date` object or an epoch number (what database drivers return for timestamp
 * columns) read as "not set": an expired capability was matched as live and a `revokedAt`
 * marker that was a `Date` was ignored while the signed original or a sibling grant still
 * authorized. Every timestamp must now be an ISO-8601 date-time string, compared by instant:
 * - `revokedAt` present but unreadable → revoked; `expiresAt` → expired; `issuedAt` → unusable;
 * - the caller's `at` / `now`, if given, must be an ISO string or the evaluation is denied;
 * - ISO strings keep their meaning, including forms without milliseconds or with an offset.
 */
import { createRuntimeAuthority, createTrustedKeySet, signPayload, stableHash } from '@aoc-runtime/crypto';
import type { CapabilityRef, ConsentGrant, SignedConsentGrant } from '@aoc-runtime/shared-types';
import { ConsentRuntime, isGrantActive } from '@aoc-runtime/consent-runtime';
import { CapabilityRuntime } from '@aoc-runtime/capability-runtime';

const alice = createRuntimeAuthority('runtime:alice', 'actor:alice', 'authority:alice');
const trustedKeys = createTrustedKeySet([alice.identity]);
const provenance = { runtimeSource: 'runtime-timestamp-validation', timestamp: '2026-01-01T00:00:00.000Z' };
const capability: CapabilityRef = { capabilityId: 'cap:records', action: 'read', resource: 'records', scope: { organizationId: 'org:a', path: '/alice' } };
const actor = { actorId: 'actor:alice', actorType: 'human' as const, organizationId: 'org:a' };

const AT = '2026-02-01T00:00:00.000Z';
const PAST = '2026-01-20T00:00:00.000Z';
const FUTURE = '2027-01-01T00:00:00.000Z';

// Values a provider might return instead of an ISO-8601 string. Typed loosely on purpose: the
// runtime must cope with what JavaScript callers and DB drivers actually hand it.
const NON_ISO: Array<[string, unknown]> = [
  ['Date object (past)', new Date(PAST)],
  ['Date object (future)', new Date(FUTURE)],
  ['epoch number (past)', Date.parse(PAST)],
  ['epoch number (future)', Date.parse(FUTURE)],
  ['epoch as string', String(Date.parse(FUTURE))],
  ['RFC 2822 string', new Date(FUTURE).toUTCString()],
  ['date only', '2027-01-01'],
  ['malformed string', 'never'],
  ['impossible date', '2027-13-45T00:00:00.000Z'],
  ['empty string', ''],
  ['object', { iso: FUTURE }],
  ['boolean', true],
];

// Fixture fields are typed loosely on purpose: the runtime must cope with what JavaScript callers
// and DB drivers actually hand it, not only with what the TypeScript contract promises.
const grantOf = (over: Record<string, unknown> = {}): ConsentGrant =>
  ({ grantId: 'g:own', subjectActorId: 'actor:alice', capability, issuedAt: '2026-01-01T00:00:00.000Z', ...over }) as unknown as ConsentGrant;

const issue = (grant: ConsentGrant): SignedConsentGrant<ConsentGrant> => {
  const grantHash = stableHash(grant);
  return { grant, grantHash, issuerSignature: signPayload({ grantHash, grant }, alice.privateKey, alice.identity, provenance) };
};

const consent = (grants: Array<SignedConsentGrant<ConsentGrant>>) =>
  new ConsentRuntime({ getActiveGrants: async () => grants }, { trustedKeys, resourceOwnership: { ownerOf: async () => 'actor:alice' } });

const decide = (grants: Array<SignedConsentGrant<ConsentGrant>>, at: unknown = AT) =>
  consent(grants).evaluate({ actorId: 'actor:alice', capability, at: at as string });

// A provider that keeps the signed blob intact and sets a marker field separately: the exact
// shape the acceptance report's V13 describes, and the one that failed open.
const withMarker = (signed: SignedConsentGrant<ConsentGrant>, fields: Record<string, unknown>) =>
  ({ ...signed, grant: { ...signed.grant, ...fields } }) as SignedConsentGrant<ConsentGrant>;

const signed = issue(grantOf());
const sibling = issue(grantOf({ grantId: 'g:second', issuedAt: '2026-01-02T00:00:00.000Z' }));

describe('ConsentRuntime: revocation and expiry markers', () => {
  it('controls: a signed grant allows; ISO string markers deny as before and are sticky across siblings', async () => {
    expect((await decide([signed])).reason).toBe('allowed');
    expect((await decide([withMarker(signed, { revokedAt: PAST }), signed])).reason).toBe('revoked');
    expect((await decide([withMarker(signed, { revokedAt: PAST }), sibling])).reason).toBe('revoked');
    expect((await decide([withMarker(signed, { expiresAt: PAST }), signed])).reason).toBe('expired');
    // A future ISO revocation is not yet effective; the marker copy itself is unusable (hash mismatch) but the original allows.
    expect((await decide([withMarker(signed, { revokedAt: FUTURE }), signed])).reason).toBe('allowed');
  });

  it.each(NON_ISO)('a revokedAt marker that is %s denies as revoked, beside the signed original and beside a sibling', async (_label, value) => {
    expect((await decide([withMarker(signed, { revokedAt: value }), signed])).reason).toBe('revoked');
    expect((await decide([withMarker(signed, { revokedAt: value }), sibling])).reason).toBe('revoked');
    expect((await decide([signed, withMarker(signed, { revokedAt: value })])).reason).toBe('revoked');
  });

  it.each(NON_ISO)('an expiresAt that is %s denies as expired', async (_label, value) => {
    expect((await decide([withMarker(signed, { expiresAt: value }), signed])).reason).toBe('expired');
  });

  it('a grant whose own signed expiresAt is a future ISO string still allows (positive control)', async () => {
    expect((await decide([issue(grantOf({ expiresAt: FUTURE }))])).reason).toBe('allowed');
  });

  it('a grant whose issuedAt is not an ISO string is unusable', async () => {
    const dated = issue(grantOf({ issuedAt: new Date('2026-01-01T00:00:00.000Z') }));
    const decision = await decide([dated]);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('denied');
  });

  it('null markers are absent, not revocations (a nullable DB column with no value)', async () => {
    expect((await decide([withMarker(signed, { revokedAt: null, expiresAt: null })])).reason).toBe('denied');
    expect((await decide([withMarker(signed, { revokedAt: null, expiresAt: null }), signed])).reason).toBe('allowed');
  });
});

describe('ConsentRuntime: the evaluation time', () => {
  it('defaults to the server clock when absent', async () => {
    expect((await consent([signed]).evaluate({ actorId: 'actor:alice', capability })).reason).toBe('allowed');
  });

  it.each(NON_ISO)('an at that is %s denies the evaluation', async (_label, value) => {
    const decision = await decide([signed], value);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('denied');
    expect(decision.reasons[0]).toMatch(/ISO-8601/);
  });

  it('accepts ISO-8601 forms without milliseconds or with an offset and compares by instant', async () => {
    expect((await decide([signed], '2026-02-01T00:00:00Z')).reason).toBe('allowed');
    expect((await decide([signed], '2026-02-01T02:00:00+02:00')).reason).toBe('allowed');
    // Issued at 2026-01-01T00:00:00.000Z: one second earlier, in any spelling, is before issuance.
    expect((await decide([signed], '2025-12-31T23:59:59Z')).reason).toBe('denied');
    expect((await decide([signed], '2026-01-01T01:59:59+02:00')).reason).toBe('denied');
  });
});

describe('isGrantActive', () => {
  it('controls: ISO strings behave as before', () => {
    expect(isGrantActive(grantOf(), AT)).toBe(true);
    expect(isGrantActive(grantOf({ expiresAt: PAST }), AT)).toBe(false);
    expect(isGrantActive(grantOf({ revokedAt: PAST }), AT)).toBe(false);
    expect(isGrantActive(grantOf({ expiresAt: FUTURE }), AT)).toBe(true);
    expect(isGrantActive(grantOf({ revokedAt: FUTURE }), AT)).toBe(true);
    expect(isGrantActive(grantOf({ issuedAt: FUTURE }), AT)).toBe(false);
  });

  it('compares by instant, so an expiry equal to the evaluation instant without milliseconds is expired', () => {
    // Lexicographically '2026-02-01T00:00:00Z' > '2026-02-01T00:00:00.000Z', which the old code read as live.
    expect(isGrantActive(grantOf({ expiresAt: '2026-02-01T00:00:00Z' }), AT)).toBe(false);
    expect(isGrantActive(grantOf({ expiresAt: '2026-02-01T00:00:00.001Z' }), AT)).toBe(true);
  });

  it.each(NON_ISO)('a revokedAt, expiresAt or issuedAt that is %s makes the grant inactive', (_label, value) => {
    expect(isGrantActive(grantOf({ revokedAt: value }), AT)).toBe(false);
    expect(isGrantActive(grantOf({ expiresAt: value }), AT)).toBe(false);
    expect(isGrantActive(grantOf({ issuedAt: value }), AT)).toBe(false);
  });

  it.each(NON_ISO)('an evaluation time that is %s makes every grant inactive', (_label, value) => {
    expect(isGrantActive(grantOf(), value as string)).toBe(false);
  });
});

describe('CapabilityRuntime: expiry', () => {
  const evaluate = (expiresAt: unknown, now: unknown = AT) =>
    new CapabilityRuntime({ resolve: async () => [{ ...capability, ...(expiresAt === undefined ? {} : { expiresAt }) } as CapabilityRef] })
      .evaluate({ actor, namespace: capability.scope, action: 'read', resource: 'records', now: now as string });

  it('controls: no expiry or a future ISO expiry allows; a past ISO expiry is expired_capability', async () => {
    expect((await evaluate(undefined)).reason).toBe('allowed');
    expect((await evaluate(FUTURE)).reason).toBe('allowed');
    expect((await evaluate(PAST)).reason).toBe('expired_capability');
    expect((await evaluate(null)).reason).toBe('allowed');
  });

  it.each(NON_ISO)('an expiresAt that is %s is expired_capability, never live', async (_label, value) => {
    const decision = await evaluate(value);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('expired_capability');
  });

  it('compares by instant: an expiry equal to now without milliseconds is expired, one millisecond later is live', async () => {
    expect((await evaluate('2026-02-01T00:00:00Z')).reason).toBe('expired_capability');
    expect((await evaluate('2026-02-01T00:00:00.001Z')).reason).toBe('allowed');
    expect((await evaluate('2026-02-01T02:00:00.001+02:00')).reason).toBe('allowed');
  });

  it('defaults now to the server clock when absent', async () => {
    const decision = await new CapabilityRuntime({ resolve: async () => [{ ...capability, expiresAt: '2000-01-01T00:00:00.000Z' } as CapabilityRef] })
      .evaluate({ actor, namespace: capability.scope, action: 'read', resource: 'records' });
    expect(decision.reason).toBe('expired_capability');
  });

  it.each(NON_ISO)('a now that is %s denies the evaluation', async (_label, value) => {
    const decision = await evaluate(FUTURE, value);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('denied');
    expect(decision.reasons[0]).toMatch(/ISO-8601/);
  });
});
