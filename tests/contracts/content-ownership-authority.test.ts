/**
 * Trusted content ownership.
 *
 * A subject-signed pack proves who submitted a registration, never who owns the content it
 * lists. Ownership (content id → owner DID, within one trust domain) comes only from records a
 * custodial system provisioned with its signing key; the vault asks the domain's authority
 * before it stores a pack and again before it releases a field. Unknown, conflicting,
 * cross-domain or unavailable answers deny. Submitting first establishes nothing.
 */
import { buildConsentObject as buildUnsignedConsentObject } from '../../consent';
import { InMemoryRevocationRegistry } from '../../capability';
import { buildPackManifest } from '../../pack';
import type { FieldReference, PackManifestV1 } from '../../pack/types';
import { buildStoragePointer } from '../../storage';
import { createInMemoryVault } from '../../vault';
import {
  ContentOwnershipError,
  CustodialContentOwnershipAuthority,
  InMemoryContentOwnershipStore,
  signContentOwnershipAssertion,
  type ContentOwnerRecord,
  type ContentOwnershipAuthority,
  type ContentOwnershipStore,
} from '../../vault/contentOwnership';
import { createHRKeyAdapter } from '../../integration/hrkey';
import { createRuntimeAuthority, createTrustedKeySet } from '../../crypto';
import { signTestConsent, signTestPack, testSubjectSigner } from '../helpers/consentSigning';
import { TEST_TRUST_DOMAIN, testContentOwnership, testCustodian } from '../helpers/contentOwnership';

const buildConsentObject: typeof buildUnsignedConsentObject = (...args) =>
  signTestConsent(buildUnsignedConsentObject(...args));

const VICTIM = testSubjectSigner('subject');
const READER = testSubjectSigner('grantee');
const ATTACKER = testSubjectSigner('other');
const CONTENT_A = 'a'.repeat(64);
const CONTENT_B = 'b'.repeat(64);
const CONTENT_C = 'c'.repeat(64);
const NOW = new Date('2025-06-15T10:00:00Z');
const SOON = new Date('2025-06-15T10:01:00Z');

const fieldsFor = (...contentIds: string[]): FieldReference[] =>
  contentIds.map((content_id, index) => ({ field_id: `field-${index}`, content_id, storage: buildStoragePointer('local', String(index + 1).repeat(64)), bytes: 10 }));
const packFor = (subject: string, ...contentIds: string[]): PackManifestV1 => signTestPack(buildPackManifest(subject, fieldsFor(...contentIds), { now: NOW }));

function vaultWith(contentOwnership: ContentOwnershipAuthority, trustDomain = TEST_TRUST_DOMAIN) {
  const vault = createInMemoryVault({ revocationRegistry: new InMemoryRevocationRegistry(), trustDomain, contentOwnership });
  vault.registerSdlMapping('person.name.legal.full', 'field-0');
  vault.registerSdlMapping('person.birth.date', 'field-1');
  const readAs = (subject: ReturnType<typeof testSubjectSigner>, pack_ref: string, scope = [{ type: 'content' as const, ref: CONTENT_A }, { type: 'content' as const, ref: CONTENT_B }]) => {
    const consent = buildConsentObject(subject.did, READER.did, 'grant', scope, ['read'], { now: NOW, expires_at: '2026-01-15T14:30:00Z' });
    const hash = vault.storeConsent(consent);
    const token = vault.mintCapability(hash, scope, ['read'], '2025-06-15T10:05:00Z', { now: NOW });
    return vault.requestAccess({ capability_token: token, sdl_paths: ['person.name.legal.full', 'person.birth.date'], pack_ref }, { now: SOON }).policy;
  };
  return { vault, readAs };
}

describe('pack registration is decided by the trust domain\'s ownership authority', () => {
  it('legitimate owner: provisioned content registers and is released to the owner\'s grantee', () => {
    const { authority } = testContentOwnership({ [CONTENT_A]: VICTIM.did, [CONTENT_B]: VICTIM.did });
    const { vault, readAs } = vaultWith(authority);
    const pack = packFor(VICTIM.did, CONTENT_A, CONTENT_B);
    expect(vault.storePack(pack)).toBe(pack.pack_hash);
    expect(readAs(VICTIM, pack.pack_hash)).toEqual({ decision: 'ALLOW', reason_codes: [] });
  });

  it('attacker registering the victim\'s content first establishes nothing', () => {
    const { authority } = testContentOwnership({ [CONTENT_A]: VICTIM.did, [CONTENT_B]: VICTIM.did });
    const { vault, readAs } = vaultWith(authority);
    // The attacker's signed pack arrives before the victim's.
    expect(() => vault.storePack(packFor(ATTACKER.did, CONTENT_A, CONTENT_B))).toThrow(/attributed to another subject/);
    const pack = packFor(VICTIM.did, CONTENT_A, CONTENT_B);
    expect(vault.storePack(pack)).toBe(pack.pack_hash);
    expect(readAs(ATTACKER, pack.pack_hash).decision).toBe('DENY');
    expect(readAs(VICTIM, pack.pack_hash).decision).toBe('ALLOW');
  });

  it('unknown ownership refuses registration, whoever submits', () => {
    const { authority } = testContentOwnership({ [CONTENT_A]: VICTIM.did });
    const { vault } = vaultWith(authority);
    expect(() => vault.storePack(packFor(VICTIM.did, CONTENT_A, CONTENT_C))).toThrow(/not attributed to any subject/);
    expect(() => vault.storePack(packFor(ATTACKER.did, CONTENT_C))).toThrow(/not attributed to any subject/);
    expect(vault.getStore().packs.size).toBe(0);
  });

  it('conflicting ownership: a subject owning some but not all listed content is refused', () => {
    const { authority } = testContentOwnership({ [CONTENT_A]: VICTIM.did, [CONTENT_B]: ATTACKER.did });
    const { vault } = vaultWith(authority);
    expect(() => vault.storePack(packFor(VICTIM.did, CONTENT_A, CONTENT_B))).toThrow(/attributed to another subject/);
    expect(() => vault.storePack(packFor(ATTACKER.did, CONTENT_A, CONTENT_B))).toThrow(/attributed to another subject/);
    expect(vault.storePack(packFor(VICTIM.did, CONTENT_A))).toBeDefined();
    expect(vault.storePack(packFor(ATTACKER.did, CONTENT_B))).toBeDefined();
  });

  it('an unavailable authority refuses registration and denies access, without consuming a token', () => {
    const { authority, store } = testContentOwnership({ [CONTENT_A]: VICTIM.did, [CONTENT_B]: VICTIM.did });
    const { vault, readAs } = vaultWith(authority);
    const pack = packFor(VICTIM.did, CONTENT_A, CONTENT_B);
    vault.storePack(pack);
    const live = store.get.bind(store);
    (store as { get: ContentOwnershipStore['get'] }).get = () => { throw new Error('store down'); };
    expect(() => vault.storePack(packFor(VICTIM.did, CONTENT_A))).toThrow(/could not be determined/);
    expect(readAs(VICTIM, pack.pack_hash)).toEqual({ decision: 'DENY', reason_codes: ['OWNERSHIP_UNAVAILABLE'] });
    (store as { get: ContentOwnershipStore['get'] }).get = live;
    expect(readAs(VICTIM, pack.pack_hash).decision).toBe('ALLOW');
  });

  it('a vault without an authority refuses every pack and denies every access', () => {
    const bare = createInMemoryVault({ revocationRegistry: new InMemoryRevocationRegistry() });
    expect(() => bare.storePack(packFor(VICTIM.did, CONTENT_A))).toThrow(/No content ownership authority/);
    expect(() => createInMemoryVault({ trustDomain: TEST_TRUST_DOMAIN })).toThrow(/configured together/);
    const { authority } = testContentOwnership({ [CONTENT_A]: VICTIM.did });
    expect(() => createInMemoryVault({ trustDomain: 'tenant:other', contentOwnership: authority })).toThrow(/answers for domain/);
    expect(() => createHRKeyAdapter().registerPack({ pack: packFor(VICTIM.did, CONTENT_A), sdl_mappings: [] })).toThrow(/No content ownership authority/);
  });

  it('cross-tenant substitution: a record from another trust domain does not count', () => {
    const otherTenant = testContentOwnership({ [CONTENT_A]: ATTACKER.did, [CONTENT_B]: ATTACKER.did }, { trustDomain: 'tenant:other' });
    const { vault } = vaultWith(otherTenant.authority, 'tenant:other');
    expect(() => vault.storePack(packFor(VICTIM.did, CONTENT_A, CONTENT_B))).toThrow(/attributed to another subject/);
    // A store that hands back a record for the wrong domain is treated as unavailable, not trusted.
    const foreign: ContentOwnershipStore = {
      get: () => ({ content_id: CONTENT_A, owner: VICTIM.did, trust_domain: 'tenant:other', provisioned_at: '2025-06-01T00:00:00Z', custodian_id: 'custodian:x', version: 1 }),
      compareAndSet: () => true,
    };
    const custodian = testCustodian();
    const mixed = new CustodialContentOwnershipAuthority({ trustDomain: TEST_TRUST_DOMAIN, custodianKeys: createTrustedKeySet([custodian.identity]), custodianIds: [custodian.identity.issuerId], store: foreign });
    expect(mixed.lookup(CONTENT_A).status).toBe('unavailable');
    expect(() => vaultWith(mixed).vault.storePack(packFor(VICTIM.did, CONTENT_A))).toThrow(/could not be determined/);
  });

  it('access to content the requesting subject does not own is denied even with a valid pack and consent', () => {
    const { authority, assert } = testContentOwnership({ [CONTENT_A]: VICTIM.did, [CONTENT_B]: VICTIM.did });
    const { vault, readAs } = vaultWith(authority);
    const pack = packFor(VICTIM.did, CONTENT_A, CONTENT_B);
    vault.storePack(pack);
    expect(readAs(VICTIM, pack.pack_hash).decision).toBe('ALLOW');
    // An authorized transfer of B to the attacker: the victim's existing pack no longer releases B.
    assert({ operation: 'transfer', content_id: CONTENT_B, owner: ATTACKER.did, previous_owner: VICTIM.did, issued_at: '2025-06-10T00:00:00Z' });
    expect(readAs(VICTIM, pack.pack_hash)).toEqual({ decision: 'DENY', reason_codes: ['CONTENT_NOT_OWNED'] });
    expect(readAs(VICTIM, pack.pack_hash, [{ type: 'content', ref: CONTENT_A }]).decision).toBe('DENY'); // the pack still lists B
    expect(() => vault.storePack(packFor(VICTIM.did, CONTENT_A, CONTENT_B))).toThrow(/attributed to another subject/);
    expect(vault.storePack(packFor(VICTIM.did, CONTENT_A))).toBeDefined();
  });
});

describe('provisioning is administrative, custodian-signed and never implicit', () => {
  const custodian = testCustodian('ingest');
  const impostor = createRuntimeAuthority('runtime:impostor', 'custodian:impostor', 'authority:impostor');
  const makeAuthority = (store: ContentOwnershipStore = new InMemoryContentOwnershipStore()) =>
    new CustodialContentOwnershipAuthority({
      trustDomain: TEST_TRUST_DOMAIN,
      custodianKeys: createTrustedKeySet([custodian.identity, impostor.identity]),
      custodianIds: [custodian.identity.issuerId],
      store,
    });
  const provision = (content_id: string, owner: string, trust_domain = TEST_TRUST_DOMAIN) =>
    ({ kind: 'aoc.content.ownership/v1' as const, operation: 'provision' as const, trust_domain, content_id, owner, previous_owner: null, issued_at: '2025-06-01T00:00:00Z' });

  it('applies custodian-signed provisioning and transfers; refuses replays and reassignments', () => {
    const authority = makeAuthority();
    const first = authority.apply(signContentOwnershipAssertion(provision(CONTENT_A, VICTIM.did), custodian));
    expect(first).toMatchObject({ content_id: CONTENT_A, owner: VICTIM.did, trust_domain: TEST_TRUST_DOMAIN, custodian_id: custodian.identity.issuerId, version: 1 });
    // Unauthorized record replacement: provisioning again, even by the custodian, is refused.
    expect(() => authority.apply(signContentOwnershipAssertion(provision(CONTENT_A, ATTACKER.did), custodian))).toThrow(ContentOwnershipError);
    expect(() => authority.apply(signContentOwnershipAssertion(provision(CONTENT_A, ATTACKER.did), custodian))).toThrow(/already owned/);
    // A transfer must name the current owner.
    const wrongPrevious = { ...provision(CONTENT_A, ATTACKER.did), operation: 'transfer' as const, previous_owner: READER.did };
    expect(() => authority.apply(signContentOwnershipAssertion(wrongPrevious, custodian))).toThrow(/not currently owned by/);
    const transfer = { ...provision(CONTENT_A, ATTACKER.did), operation: 'transfer' as const, previous_owner: VICTIM.did, issued_at: '2025-06-02T00:00:00Z' };
    const moved = authority.apply(signContentOwnershipAssertion(transfer, custodian));
    expect(moved).toMatchObject({ owner: ATTACKER.did, version: 2 });
    expect(authority.lookup(CONTENT_A)).toMatchObject({ status: 'owned', record: { owner: ATTACKER.did, version: 2 } });
    // Replaying the same transfer no longer matches the current owner.
    expect(() => authority.apply(signContentOwnershipAssertion(transfer, custodian))).toThrow(/not currently owned by/);
  });

  it('refuses untrusted, unsigned, tampered and cross-domain assertions', () => {
    const authority = makeAuthority();
    const signedByImpostor = signContentOwnershipAssertion(provision(CONTENT_A, ATTACKER.did), impostor);
    expect(() => authority.apply(signedByImpostor)).toThrow(/not a custodian/);
    const unsigned = { assertion: provision(CONTENT_A, ATTACKER.did), custodian_signature: undefined as never };
    expect(() => authority.apply(unsigned)).toThrow(/no custodian signature/);
    const tampered = signContentOwnershipAssertion(provision(CONTENT_A, VICTIM.did), custodian);
    tampered.assertion = { ...tampered.assertion, owner: ATTACKER.did };
    expect(() => authority.apply(tampered)).toThrow(/does not verify/);
    const otherDomain = signContentOwnershipAssertion(provision(CONTENT_A, ATTACKER.did, 'tenant:other'), custodian);
    expect(() => authority.apply(otherDomain)).toThrow(/domain/);
    const malformed = signContentOwnershipAssertion({ ...provision('not-a-hash', ATTACKER.did) }, custodian);
    expect(() => authority.apply(malformed)).toThrow(/malformed/);
    expect(authority.lookup(CONTENT_A).status).toBe('unknown');
  });

  it('a concurrent write is detected by the store\'s compare-and-set', () => {
    const inner = new InMemoryContentOwnershipStore();
    const racing: ContentOwnershipStore = {
      get: (domain, id) => inner.get(domain, id),
      compareAndSet: (record, expected) => {
        // Another writer lands between the read and the write.
        inner.compareAndSet({ ...record, owner: READER.did }, expected);
        return inner.compareAndSet(record, expected);
      },
    };
    const authority = makeAuthority(racing);
    expect(() => authority.apply(signContentOwnershipAssertion(provision(CONTENT_A, VICTIM.did), custodian))).toThrow(/changed concurrently/);
    expect(authority.lookup(CONTENT_A)).toMatchObject({ status: 'owned', record: { owner: READER.did } });
  });

  it('authoritative records are not reachable through the vault store', () => {
    const { authority } = testContentOwnership({ [CONTENT_A]: VICTIM.did });
    const { vault } = vaultWith(authority);
    vault.storePack(packFor(VICTIM.did, CONTENT_A));
    const exposed = vault.getStore() as unknown as Record<string, unknown>;
    expect(Object.keys(exposed).sort()).toEqual(['capabilities', 'consents', 'packs', 'sdl_mappings']);
    const record = authority.lookup(CONTENT_A) as { status: 'owned'; record: ContentOwnerRecord };
    (record.record as { owner: string }).owner = ATTACKER.did;
    expect((authority.lookup(CONTENT_A) as { record: ContentOwnerRecord }).record.owner).toBe(VICTIM.did);
  });
});

describe('the vault does not trust a misbehaving authority or store', () => {
  const ownedRecord = (trust_domain: string): ContentOwnerRecord =>
    ({ content_id: CONTENT_A, owner: VICTIM.did, trust_domain, provisioned_at: '2025-06-01T00:00:00Z', custodian_id: 'custodian:x', version: 1 });

  it('an authority answering "owned" for another trust domain is unavailable to the vault', () => {
    const crossDomain: ContentOwnershipAuthority = { trustDomain: TEST_TRUST_DOMAIN, lookup: () => ({ status: 'owned', record: ownedRecord('tenant:other') }) };
    const { vault } = vaultWith(crossDomain);
    expect(() => vault.storePack(packFor(VICTIM.did, CONTENT_A))).toThrow(/could not be determined/);
  });

  it('an authority that throws is unavailable to the vault: no registration, no release', () => {
    let fail = false;
    const flaky: ContentOwnershipAuthority = {
      trustDomain: TEST_TRUST_DOMAIN,
      lookup: () => { if (fail) throw new Error('authority crashed'); return { status: 'owned', record: ownedRecord(TEST_TRUST_DOMAIN) }; },
    };
    const { vault, readAs } = vaultWith(flaky);
    const pack = packFor(VICTIM.did, CONTENT_A);
    vault.storePack(pack);
    fail = true;
    expect(() => vault.storePack(packFor(VICTIM.did, CONTENT_A))).toThrow(/could not be determined/);
    expect(readAs(VICTIM, pack.pack_hash, [{ type: 'content', ref: CONTENT_A }])).toEqual({ decision: 'DENY', reason_codes: ['OWNERSHIP_UNAVAILABLE'] });
  });

  it('a store that hands out its live records cannot be mutated through a lookup', () => {
    const live = new Map<string, ContentOwnerRecord>();
    const leaky: ContentOwnershipStore = {
      get: (domain, id) => live.get(`${domain}:${id}`),
      compareAndSet: (record, expected) => {
        const key = `${record.trust_domain}:${record.content_id}`;
        if ((live.get(key)?.version ?? 0) !== expected) return false;
        live.set(key, record);
        return true;
      },
    };
    const { authority } = testContentOwnership({ [CONTENT_A]: VICTIM.did }, { store: leaky });
    const first = authority.lookup(CONTENT_A) as { status: 'owned'; record: ContentOwnerRecord };
    (first.record as { owner: string }).owner = ATTACKER.did;
    expect((authority.lookup(CONTENT_A) as { record: ContentOwnerRecord }).record.owner).toBe(VICTIM.did);
  });
});
