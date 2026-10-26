/**
 * Effective consent revocation.
 *
 * A capability token is a bearer object: anyone holding the subject-signed consent can
 * mint, re-id or hand-build an unlimited number of valid tokens, each with its own hash.
 * So a subject's signed revoke withdraws the consent itself (consent-object-spec §5), and
 * every path that honours a capability reads that consent's revocation from an injected
 * registry before anything else. Revoking one token hash stays a separate operator
 * containment action that never touches the consent.
 */
import crypto from 'node:crypto';
import {
  buildConsentObject as buildUnsignedConsentObject,
  signConsentObject,
  SubjectConsentProofError,
} from '../../consent';
import type { ConsentObjectV1 } from '../../consent';
import * as capabilityBarrel from '../../capability';
import {
  InMemoryRevocationRegistry,
  canonicalizeCapabilityPayload,
  computeCapabilityHash,
  isConsentHashRevoked,
  isRevoked,
  mintCapabilityToken,
  readRevocation,
  resetNonceRegistry,
  revokeCapabilityToken,
  verifyCapabilityToken,
  type CapabilityTokenV1,
  type RevocationRegistry,
} from '../../capability';
import { evaluateCapabilityAccess, capabilityAccessReasonCodes } from '../../enforcement';
import { consumeCapabilityAccess } from '../../protocol/capabilities';
import { enforceCapability } from '../../protocol/capabilities/capabilityEnforcer';
import { interpretWithCapability } from '../../interpreter';
import { executeCapabilityFlow } from '../../aoc/sdk';
import { createInMemoryVault } from '../../vault';
import type { Vault } from '../../vault';
import { buildPackManifest as buildUnsignedPackManifest } from '../../pack';
import type { FieldReference } from '../../pack/types';
import { buildStoragePointer } from '../../storage';
import { mintCapability } from '../../protocol/capability';
import { ENFORCEMENT_REASON_CODES, evaluateEnforcement } from '../../protocol/enforcement';
import { authorizeExecution } from '../../protocol/execution';
import { createCapabilityRevocationCheck } from '../../protocol/revocation';
import { DEFAULT_RUNTIME_CORE, executeRoute, type RuntimeCore } from '../../runtime/api/routes';
import type { RuntimeCaller } from '../../runtime/auth/apiKeys';
import { createHRKeyAdapter } from '../../integration/hrkey';
import { testSubjectSigner, signTestConsent, signTestPack } from '../helpers/consentSigning';
import { TEST_TRUST_DOMAIN, testContentOwnership } from '../helpers/contentOwnership';

// Packs stored in a vault are signed by their subject; an unsigned pack names an owner nobody vouched for.
const buildPackManifest: typeof buildUnsignedPackManifest = (...args) =>
  signTestPack(buildUnsignedPackManifest(...args));


const buildConsentObject: typeof buildUnsignedConsentObject = (...args) =>
  signTestConsent(buildUnsignedConsentObject(...args));

const OWNER = testSubjectSigner('subject');
const READER = testSubjectSigner('grantee');
const OTHER = testSubjectSigner('other');
const ADMIN: RuntimeCaller = { owner: 'operator-admin', principals: [], roles: ['admin'] };
const CONTENT_A = 'a'.repeat(64);
const CONTENT_B = 'b'.repeat(64);
const SCOPE = [{ type: 'content' as const, ref: CONTENT_A }, { type: 'content' as const, ref: CONTENT_B }];
const NOW = new Date('2025-06-15T10:00:00Z');
const REVOKE_AT = new Date('2025-06-15T10:00:30Z');
const SOON = new Date('2025-06-15T10:01:00Z');
const TOKEN_EXPIRES = '2025-06-15T10:05:00Z';

beforeEach(() => {
  resetNonceRegistry();
});

const grantFor = (subject = OWNER.did, grantee = READER.did, scope = SCOPE, now = NOW): ConsentObjectV1 =>
  buildConsentObject(subject, grantee, 'grant', scope, ['read'], { now, expires_at: '2026-01-15T14:30:00Z' });

const revokeFor = (consent_hash: string | null, capability_hash: string, opts: { subject?: string; grantee?: string; now?: Date } = {}) =>
  buildConsentObject(opts.subject ?? OWNER.did, opts.grantee ?? READER.did, 'revoke', [], [], {
    now: opts.now ?? REVOKE_AT,
    prior_consent: consent_hash,
    revoke_target: { capability_hash },
  });

const rehash = (token: Record<string, unknown>): CapabilityTokenV1 =>
  ({ ...token, capability_hash: computeCapabilityHash(canonicalizeCapabilityPayload(token as never)) }) as CapabilityTokenV1;

function ownerVault(revocationRegistry: RevocationRegistry = new InMemoryRevocationRegistry()) {
  const vault = createInMemoryVault({ revocationRegistry, trustDomain: TEST_TRUST_DOMAIN, contentOwnership: testContentOwnership({ [CONTENT_A]: OWNER.did, [CONTENT_B]: OWNER.did }).authority });
  const fields: FieldReference[] = [
    { field_id: 'full-name', content_id: CONTENT_A, storage: buildStoragePointer('local', '1'.repeat(64)), bytes: 100 },
    { field_id: 'birth-date', content_id: CONTENT_B, storage: buildStoragePointer('local', '2'.repeat(64)), bytes: 64 },
  ];
  const pack_hash = vault.storePack(buildPackManifest(OWNER.did, fields, { now: NOW }));
  vault.registerSdlMapping('person.name.legal.full', 'full-name');
  vault.registerSdlMapping('person.birth.date', 'birth-date');
  const access = (token: CapabilityTokenV1, now = SOON) =>
    vault.requestAccess({ capability_token: token, sdl_paths: ['person.name.legal.full'], pack_ref: pack_hash }, { now }).policy;
  return { vault, pack_hash, revocationRegistry, access };
}

/** A consent stored and minted, then revoked by its subject. */
function revokedSetup() {
  const setup = ownerVault();
  const consent = grantFor();
  const consent_hash = setup.vault.storeConsent(consent);
  const token = setup.vault.mintCapability(consent_hash, SCOPE, ['read'], TOKEN_EXPIRES, { now: NOW });
  const spare = setup.vault.mintCapability(consent_hash, SCOPE, ['read'], TOKEN_EXPIRES, { now: NOW });
  const offVault = mintCapabilityToken(consent, SCOPE, ['read'], TOKEN_EXPIRES, { now: NOW });
  expect(setup.access(token).decision).toBe('ALLOW');
  const revocation = revokeFor(consent_hash, token.capability_hash);
  setup.vault.applyConsent(revocation);
  return { ...setup, consent, consent_hash, token, spare, offVault, revocation };
}

describe('a subject-signed revocation withdraws the consent on every path', () => {
  it('N1a: nothing more can be minted from the revoked consent', () => {
    const { vault, consent_hash } = revokedSetup();
    let error: unknown;
    try { vault.mintCapability(consent_hash, SCOPE, ['read'], TOKEN_EXPIRES, { now: SOON }); } catch (e) { error = e; }
    expect((error as Error).message).toMatch(/revoked by its subject/);
    expect((error as { code?: string }).code).toBe('CONSENT_REVOKED');
  });

  it('N1b: a clone of the revoked token with a fresh token_id and recomputed hash is denied', () => {
    const { token, access } = revokedSetup();
    const cloned = rehash({ ...token, token_id: crypto.randomBytes(32).toString('hex') });
    expect(access(cloned)).toEqual({ decision: 'DENY', reason_codes: ['CONSENT_REVOKED'] });
  });

  it('N2: a token minted off-vault before the revocation is denied, and the subject can revoke naming it', () => {
    const { vault, consent_hash, offVault, access } = revokedSetup();
    expect(access(offVault)).toEqual({ decision: 'DENY', reason_codes: ['CONSENT_REVOKED'] });
    // A revocation naming a token this vault never saw is still accepted (bound through prior_consent).
    const another = ownerVault();
    const hash = another.vault.storeConsent(grantFor());
    const foreign = mintCapabilityToken(grantFor(), SCOPE, ['read'], TOKEN_EXPIRES, { now: NOW });
    expect(another.access(foreign).decision).toBe('ALLOW');
    another.vault.applyConsent(revokeFor(hash, foreign.capability_hash));
    expect(another.access(foreign)).toEqual({ decision: 'DENY', reason_codes: ['CONSENT_REVOKED'] });
    expect(vault.getStore().consents.has(consent_hash)).toBe(true);
  });

  it('N18: a token built by hand from the consent fields is denied', () => {
    const { consent, access } = revokedSetup();
    const handBuilt = rehash({
      version: '1.0', subject: consent.subject, grantee: consent.grantee, consent_ref: consent.consent_hash,
      scope: SCOPE, permissions: ['read'], issued_at: '2025-06-15T10:00:00Z', not_before: null,
      expires_at: TOKEN_EXPIRES, token_id: crypto.randomBytes(32).toString('hex'),
    });
    expect(access(handBuilt)).toEqual({ decision: 'DENY', reason_codes: ['CONSENT_REVOKED'] });
  });

  it('every root authorization path denies a never-presented token of the revoked consent', () => {
    const { consent, spare, revocationRegistry } = revokedSetup();
    const registries = { revocationRegistry };
    expect(() => verifyCapabilityToken(spare, consent, { now: SOON }, registries)).toThrow(/revoked by its subject/);
    const request = { capability: spare, consent, action: 'read', resource: { type: 'content' as const, ref: CONTENT_A }, now: SOON.toISOString(), registries };
    expect(evaluateCapabilityAccess(request).reasonCode).toBe(capabilityAccessReasonCodes.CONSENT_REVOKED);
    const consumed = consumeCapabilityAccess(request);
    expect(consumed.allowed).toBe(false);
    expect(consumed.reasonCode).toBe(capabilityAccessReasonCodes.CONSENT_REVOKED);
    expect(consumed.consumed).toBe(false);
    expect(enforceCapability({
      required_scope: `content:${CONTENT_A}`, token: spare, consent,
      resource_context: { resource_type: 'content', content_ref: CONTENT_A },
      request_context: { subject: OWNER.did, grantee: READER.did, endpoint: 'test' },
      now: SOON, registries,
    }).allowed).toBe(false);
    const interpreted = interpretWithCapability(
      { capability: spare, consent, action: 'read', resource: `content:${CONTENT_A}`, input: { query: 'q' }, now: SOON.toISOString() },
      { registries }
    );
    expect(interpreted.allowed).toBe(false);
    expect(interpreted.error?.code).toBe(capabilityAccessReasonCodes.CONSENT_REVOKED);
    const flow = executeCapabilityFlow({ capability: spare, consent, action: 'read', resource: { type: 'content', ref: CONTENT_A }, now: SOON.toISOString(), registries });
    expect(flow.allowed).toBe(false);
    expect(flow.stage).toBe('evaluation');
  });

  it('a caller-supplied `now` earlier than the revocation does not restore access', () => {
    const { consent, spare, access, revocationRegistry } = revokedSetup();
    expect(access(spare, NOW)).toEqual({ decision: 'DENY', reason_codes: ['CONSENT_REVOKED'] });
    expect(evaluateCapabilityAccess({
      capability: spare, consent, action: 'read', resource: { type: 'content', ref: CONTENT_A },
      now: '2025-06-15T10:00:05Z', registries: { revocationRegistry },
    }).reasonCode).toBe(capabilityAccessReasonCodes.CONSENT_REVOKED);
  });

  it('the protocol paths deny through the same registry', () => {
    const { consent, revocationRegistry } = revokedSetup();
    const checkRevocation = createCapabilityRevocationCheck(revocationRegistry);
    const mintInput = {
      consent, requested_scope: [{ type: 'content' as const, ref: CONTENT_A }], requested_permissions: ['read'],
      issued_at: '2025-06-15T10:00:10Z', expires_at: TOKEN_EXPIRES,
    };
    expect(() => mintCapability({ ...mintInput, checkConsentRevocation: checkRevocation })).toThrow(/revoked/);
    // A protocol capability minted before the revocation (through an unrelated clear registry).
    const earlier = mintCapability({ ...mintInput, checkConsentRevocation: createCapabilityRevocationCheck(new InMemoryRevocationRegistry()) });
    const request = { consent, capability: earlier, requested_scope: [{ type: 'content' as const, ref: CONTENT_A }], requested_permissions: ['read'], now: SOON };
    const decision = evaluateEnforcement(request, checkRevocation);
    expect(decision.allowed).toBe(false);
    expect(decision.reason_code).toBe(ENFORCEMENT_REASON_CODES.CONSENT_INACTIVE);
    expect(authorizeExecution({ ...request, execution_target: { adapter: 'fixture', operation: 'read' } }, checkRevocation).authorized).toBe(false);
  });

  it('the hosted runtime shares the registry: a vault-recorded revocation reaches the routes', () => {
    const { consent, revocationRegistry } = revokedSetup();
    const core: RuntimeCore = { ...DEFAULT_RUNTIME_CORE, revocationRegistry };
    const payload = {
      consent, requested_scope: [{ type: 'content', ref: CONTENT_A }], requested_permissions: ['read'],
      issued_at: '2025-06-15T10:00:10Z', expires_at: TOKEN_EXPIRES,
    };
    const minted = executeRoute('/capability/mint', payload, core, ADMIN);
    expect(minted.success).toBe(false);
    expect(minted.error?.message).toMatch(/revoked/);
    const live = executeRoute('/capability/mint', { ...payload, consent: grantFor(OWNER.did, READER.did, SCOPE, new Date('2025-06-15T10:00:05Z')) }, core, ADMIN);
    expect(live.success).toBe(true);
  });

  it('HRKey: the candidate\'s revokeConsent withdraws access and minting', () => {
    const adapter = createHRKeyAdapter({ trustDomain: TEST_TRUST_DOMAIN, contentOwnership: testContentOwnership({ [CONTENT_A]: OWNER.did }).authority });
    const fields: FieldReference[] = [
      { field_id: 'reference-score', content_id: CONTENT_A, storage: buildStoragePointer('local', '1'.repeat(64)), bytes: 64 },
    ];
    const pack = buildPackManifest(OWNER.did, fields, { now: NOW });
    adapter.registerPack({ pack, sdl_mappings: [{ sdl_path: 'work.reference.score', field_id: 'reference-score' }] });
    const input = { candidate: OWNER.did, employer: READER.did, scope: [{ type: 'content' as const, ref: CONTENT_A }], permissions: ['read'], expires_at: '2026-01-15T14:30:00Z' };
    const granted = adapter.grantConsent({ consent: signTestConsent(adapter.prepareConsent(input, { now: NOW })) });
    const first = adapter.mintCapability({ consent_hash: granted.consent_hash, scope: input.scope, permissions: ['read'], expires_at: TOKEN_EXPIRES }, { now: NOW });
    const second = adapter.mintCapability({ consent_hash: granted.consent_hash, scope: input.scope, permissions: ['read'], expires_at: TOKEN_EXPIRES }, { now: NOW });
    adapter.revokeConsent({ consent: revokeFor(granted.consent_hash, first.capability_hash) });
    const result = adapter.requestAccess({ capability: second.capability, sdl_paths: ['work.reference.score'], pack_hash: pack.pack_hash }, { now: SOON });
    expect(result.policy).toEqual({ decision: 'DENY', reason_codes: ['CONSENT_REVOKED'] });
    expect(() => adapter.mintCapability({ consent_hash: granted.consent_hash, scope: input.scope, permissions: ['read'], expires_at: TOKEN_EXPIRES }, { now: SOON })).toThrow(/revoked/);
  });
});

describe('revocation stays within its declared scope', () => {
  it('operator revocation of one token does not revoke the consent', () => {
    const { vault, access, revocationRegistry } = ownerVault();
    const consent_hash = vault.storeConsent(grantFor());
    const token = vault.mintCapability(consent_hash, SCOPE, ['read'], TOKEN_EXPIRES, { now: NOW });
    revokeCapabilityToken(token.capability_hash, revocationRegistry);
    expect(access(token)).toEqual({ decision: 'DENY', reason_codes: ['REVOKED'] });
    expect(isConsentHashRevoked(consent_hash, revocationRegistry)).toBe(false);
    const again = vault.mintCapability(consent_hash, SCOPE, ['read'], TOKEN_EXPIRES, { now: SOON });
    expect(access(again)).toEqual({ decision: 'ALLOW', reason_codes: [] });
  });

  it('revoking one consent leaves another consent of the same subject usable', () => {
    const { vault, access } = ownerVault();
    const first = vault.storeConsent(grantFor());
    const second = vault.storeConsent(grantFor(OWNER.did, READER.did, [{ type: 'content', ref: CONTENT_A }]));
    const tokenFirst = vault.mintCapability(first, SCOPE, ['read'], TOKEN_EXPIRES, { now: NOW });
    const tokenSecond = vault.mintCapability(second, [{ type: 'content', ref: CONTENT_A }], ['read'], TOKEN_EXPIRES, { now: NOW });
    vault.applyConsent(revokeFor(first, tokenFirst.capability_hash));
    expect(access(tokenFirst).decision).toBe('DENY');
    expect(access(tokenSecond)).toEqual({ decision: 'ALLOW', reason_codes: [] });
  });

  it('a fresh grant after a revocation works', () => {
    const { vault, access, consent_hash } = revokedSetup();
    const renewed = vault.storeConsent(grantFor(OWNER.did, READER.did, SCOPE, new Date('2025-06-15T10:00:40Z')));
    expect(renewed).not.toBe(consent_hash);
    const token = vault.mintCapability(renewed, SCOPE, ['read'], TOKEN_EXPIRES, { now: SOON });
    expect(access(token)).toEqual({ decision: 'ALLOW', reason_codes: [] });
  });
});

describe('revocation authority and bindings', () => {
  function minted() {
    const setup = ownerVault();
    const consent_hash = setup.vault.storeConsent(grantFor());
    const token = setup.vault.mintCapability(consent_hash, SCOPE, ['read'], TOKEN_EXPIRES, { now: NOW });
    return { ...setup, consent_hash, token };
  }

  it('an unsigned revocation is refused and changes nothing', () => {
    const { vault, consent_hash, token, access, revocationRegistry } = minted();
    const unsigned = buildUnsignedConsentObject(OWNER.did, READER.did, 'revoke', [], [], { now: REVOKE_AT, prior_consent: consent_hash, revoke_target: { capability_hash: token.capability_hash } });
    expect(() => vault.applyConsent(unsigned)).toThrow(SubjectConsentProofError);
    expect(isConsentHashRevoked(consent_hash, revocationRegistry)).toBe(false);
    expect(access(token).decision).toBe('ALLOW');
  });

  it('a revocation signed by the grantee or by another subject is refused', () => {
    const { vault, consent_hash, token, access } = minted();
    const byGrantee = signConsentObject(buildUnsignedConsentObject(READER.did, READER.did, 'revoke', [], [], { now: REVOKE_AT, prior_consent: consent_hash, revoke_target: { capability_hash: token.capability_hash } }), READER);
    const byOther = signConsentObject(buildUnsignedConsentObject(OTHER.did, READER.did, 'revoke', [], [], { now: REVOKE_AT, prior_consent: consent_hash, revoke_target: { capability_hash: token.capability_hash } }), OTHER);
    expect(() => vault.applyConsent(byGrantee)).toThrow('Consent subject must match revoked capability subject.');
    expect(() => vault.applyConsent(byOther)).toThrow('Consent subject must match revoked capability subject.');
    expect(access(token).decision).toBe('ALLOW');
  });

  it('the revocation must name the consent, its grantee, and not predate it', () => {
    const { vault, consent_hash, token, access } = minted();
    expect(() => vault.applyConsent(revokeFor(null, token.capability_hash))).toThrow(/prior_consent/);
    expect(() => vault.applyConsent(revokeFor('d'.repeat(64), token.capability_hash))).toThrow(/prior_consent/);
    expect(() => vault.applyConsent(revokeFor(consent_hash, token.capability_hash, { grantee: OTHER.did }))).toThrow(/grantee must match/);
    expect(() => vault.applyConsent(revokeFor(consent_hash, token.capability_hash, { now: new Date('2025-06-15T09:59:00Z') }))).toThrow(/issued_at must not precede/);
    expect(access(token).decision).toBe('ALLOW');
  });

  it('a revocation cannot name a token that belongs to a different consent', () => {
    const { vault, consent_hash, access } = minted();
    const other = vault.storeConsent(grantFor(OWNER.did, READER.did, [{ type: 'content', ref: CONTENT_A }]));
    const otherToken = vault.mintCapability(other, [{ type: 'content', ref: CONTENT_A }], ['read'], TOKEN_EXPIRES, { now: NOW });
    expect(() => vault.applyConsent(revokeFor(consent_hash, otherToken.capability_hash))).toThrow(/consent of the revoked capability/);
    expect(access(otherToken).decision).toBe('ALLOW');
  });

  it('applying the same signed revocation twice is idempotent and keeps the first record', () => {
    const { vault, consent_hash, token, revocationRegistry } = minted();
    const revocation = revokeFor(consent_hash, token.capability_hash);
    vault.applyConsent(revocation);
    expect(() => vault.applyConsent(revocation)).not.toThrow();
    const record = (revocationRegistry as InMemoryRevocationRegistry).consentRevocation(consent_hash);
    expect(record).toEqual({ consent_hash, revocation_consent_hash: revocation.consent_hash, subject: OWNER.did, revoked_at: revocation.issued_at });
  });
});

describe('the registry is required and fails closed', () => {
  const consent = grantFor();
  const token = () => mintCapabilityToken(consent, SCOPE, ['read'], TOKEN_EXPIRES, { now: NOW });
  const request = (registries?: { revocationRegistry?: RevocationRegistry }) => ({
    capability: token(), consent, action: 'read', resource: { type: 'content' as const, ref: CONTENT_A }, now: SOON.toISOString(), registries,
  });
  const throwing: RevocationRegistry = {
    isRevoked: () => { throw new Error('store down'); },
    revoke: () => undefined,
    isConsentRevoked: () => { throw new Error('store down'); },
    revokeConsent: () => undefined,
  };

  it('evaluation, consumption and verification deny without a registry', () => {
    expect(evaluateCapabilityAccess(request()).reasonCode).toBe(capabilityAccessReasonCodes.REVOCATION_UNAVAILABLE);
    const consumed = consumeCapabilityAccess(request());
    expect(consumed.reasonCode).toBe(capabilityAccessReasonCodes.REVOCATION_UNAVAILABLE);
    expect(consumed.consumed).toBe(false);
    expect(() => verifyCapabilityToken(token(), consent, { now: SOON })).toThrow(/could not be determined/);
    expect(readRevocation(undefined, { capability_hash: 'a'.repeat(64), consent_hash: consent.consent_hash })).toMatchObject({ state: 'unavailable' });
  });

  it('a registry that throws or answers badly denies everywhere', () => {
    expect(evaluateCapabilityAccess(request({ revocationRegistry: throwing })).reasonCode).toBe(capabilityAccessReasonCodes.REVOCATION_UNAVAILABLE);
    const malformed = { ...throwing, isRevoked: () => 'no' as never, isConsentRevoked: () => 'no' as never };
    expect(evaluateCapabilityAccess(request({ revocationRegistry: malformed })).reasonCode).toBe(capabilityAccessReasonCodes.REVOCATION_UNAVAILABLE);
    const { vault, access } = ownerVault(throwing);
    const hash = vault.storeConsent(grantFor());
    expect(() => vault.mintCapability(hash, SCOPE, ['read'], TOKEN_EXPIRES, { now: NOW })).toThrow(/could not be determined/);
    expect(access(token())).toEqual({ decision: 'DENY', reason_codes: ['REVOCATION_UNAVAILABLE'] });
  });

  it('there is no process-global registry and no reset helper', () => {
    expect('resetRevocationRegistry' in capabilityBarrel).toBe(false);
    expect((InMemoryRevocationRegistry.prototype as unknown as Record<string, unknown>).reset).toBeUndefined();
    expect(() => isRevoked('a'.repeat(64), undefined as never)).toThrow(/registry is required/);
    const one = new InMemoryRevocationRegistry();
    const two = new InMemoryRevocationRegistry();
    revokeCapabilityToken('c'.repeat(64), one);
    expect(isRevoked('c'.repeat(64), one)).toBe(true);
    expect(isRevoked('c'.repeat(64), two)).toBe(false);
  });
});
