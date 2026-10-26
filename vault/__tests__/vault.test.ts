import { createInMemoryVault } from '../vault';
import { Vault } from '../types';
import { buildConsentObject as buildUnsignedConsentObject } from '../../consent';
import { ScopeEntry } from '../../consent/types';
import { buildPackManifest as buildUnsignedPackManifest } from '../../pack';
import { FieldReference } from '../../pack/types';
import { buildStoragePointer } from '../../storage';
import {
  InMemoryRevocationRegistry,
  resetNonceRegistry,
  revokeCapabilityToken
} from '../../capability';
import { testSubjectSigner, signTestConsent, signTestPack } from '../../tests/helpers/consentSigning';
import { TEST_TRUST_DOMAIN, testContentOwnership } from '../../tests/helpers/contentOwnership';

// Packs stored in a vault are signed by their subject; an unsigned pack names an owner nobody vouched for.
const buildPackManifest: typeof buildUnsignedPackManifest = (...args) =>
  signTestPack(buildUnsignedPackManifest(...args));


// Consents in these tests are signed by their subject; unsigned consents authorize nothing.
const buildConsentObject: typeof buildUnsignedConsentObject = (...args) =>
  signTestConsent(buildUnsignedConsentObject(...args));

// --- Test constants ---

const SUBJECT = testSubjectSigner('subject').did;
const GRANTEE = testSubjectSigner('grantee').did;

const CONTENT_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CONTENT_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const CONTENT_C = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';

// The trust domain's custodian attributes the subject's content to it before any pack is stored.
const vaultOptions = () => ({
  trustDomain: TEST_TRUST_DOMAIN,
  contentOwnership: testContentOwnership({ [CONTENT_A]: SUBJECT, [CONTENT_B]: SUBJECT, [CONTENT_C]: SUBJECT }).authority,
});

const STORAGE_HASH_A = '1111111111111111111111111111111111111111111111111111111111111111';
const STORAGE_HASH_B = '2222222222222222222222222222222222222222222222222222222222222222';
const STORAGE_HASH_C = '3333333333333333333333333333333333333333333333333333333333333333';

const consentNow = new Date('2025-06-15T10:00:00Z');
const tokenNow = new Date('2025-06-15T10:00:00Z');
const accessNow = new Date('2025-06-15T10:00:00Z');
const consentExpires = '2026-01-15T14:30:00Z';
const tokenExpires = '2025-06-15T10:05:00Z';

// --- Helpers ---

function makeStoragePointer(hash: string) {
  return buildStoragePointer('local', hash);
}

function makeFieldRefs(): FieldReference[] {
  return [
    {
      field_id: 'full-name',
      content_id: CONTENT_A,
      storage: makeStoragePointer(STORAGE_HASH_A),
      bytes: 100
    },
    {
      field_id: 'birth-date',
      content_id: CONTENT_B,
      storage: makeStoragePointer(STORAGE_HASH_B),
      bytes: 64
    },
    {
      field_id: 'country',
      content_id: CONTENT_C,
      storage: makeStoragePointer(STORAGE_HASH_C),
      bytes: 32
    }
  ];
}

function makePack() {
  return buildPackManifest(SUBJECT, makeFieldRefs(), { now: consentNow });
}

function makeConsentScope(): ScopeEntry[] {
  return [
    { type: 'content', ref: CONTENT_A },
    { type: 'content', ref: CONTENT_B },
    { type: 'content', ref: CONTENT_C }
  ];
}

function makeConsent(opts: { scope?: ScopeEntry[]; expires_at?: string | null } = {}) {
  return buildConsentObject(
    SUBJECT,
    GRANTEE,
    'grant',
    opts.scope ?? makeConsentScope(),
    ['read'],
    {
      now: consentNow,
      expires_at: 'expires_at' in opts ? opts.expires_at : consentExpires
    }
  );
}

function setupVault(): {
  vault: Vault;
  pack_hash: string;
  consent_hash: string;
  revocationRegistry: InMemoryRevocationRegistry;
} {
  const revocationRegistry = new InMemoryRevocationRegistry();
  const vault = createInMemoryVault({ ...vaultOptions(), revocationRegistry });

  // Store pack
  const pack = makePack();
  const pack_hash = vault.storePack(pack);

  // Store consent
  const consent = makeConsent();
  const consent_hash = vault.storeConsent(consent);

  // Register SDL path -> field_id mappings
  vault.registerSdlMapping('person.name.legal.full', 'full-name');
  vault.registerSdlMapping('person.birth.date', 'birth-date');
  vault.registerSdlMapping('person.location.country', 'country');

  return { vault, pack_hash, consent_hash, revocationRegistry };
}

// --- Reset registries between tests ---

beforeEach(() => {
  resetNonceRegistry();
});

// ============================================================
// 1. Happy path
// ============================================================

describe('vault happy path: store consent -> mint capability -> request access (ALLOW)', () => {
  it('grants access when capability is valid and scope is covered', () => {
    const { vault, pack_hash, consent_hash } = setupVault();

    // Mint capability
    const token = vault.mintCapability(
      consent_hash,
      makeConsentScope(),
      ['read'],
      tokenExpires,
      { now: tokenNow }
    );

    // Request access
    const result = vault.requestAccess(
      {
        capability_token: token,
        sdl_paths: ['person.name.legal.full', 'person.birth.date'],
        pack_ref: pack_hash
      },
      { now: accessNow }
    );

    expect(result.policy.decision).toBe('ALLOW');
    expect(result.policy.reason_codes).toEqual([]);
    expect(result.resolved_fields).toHaveLength(2);
    expect(result.unresolved_fields).toHaveLength(0);

    // Verify resolved fields are sorted by sdl_path
    expect(result.resolved_fields[0].sdl_path).toBe('person.birth.date');
    expect(result.resolved_fields[0].field_id).toBe('birth-date');
    expect(result.resolved_fields[0].content_id).toBe(CONTENT_B);

    expect(result.resolved_fields[1].sdl_path).toBe('person.name.legal.full');
    expect(result.resolved_fields[1].field_id).toBe('full-name');
    expect(result.resolved_fields[1].content_id).toBe(CONTENT_A);
  });

  it('allows access with unresolved fields (unresolved does not deny)', () => {
    const { vault, pack_hash, consent_hash } = setupVault();

    const token = vault.mintCapability(
      consent_hash,
      makeConsentScope(),
      ['read'],
      tokenExpires,
      { now: tokenNow }
    );

    // Request with a mix of resolvable and unresolvable paths
    const result = vault.requestAccess(
      {
        capability_token: token,
        sdl_paths: ['person.name.legal.full', 'person.email.primary'],
        pack_ref: pack_hash
      },
      { now: accessNow }
    );

    expect(result.policy.decision).toBe('ALLOW');
    expect(result.resolved_fields).toHaveLength(1);
    expect(result.resolved_fields[0].sdl_path).toBe('person.name.legal.full');
    expect(result.unresolved_fields).toHaveLength(1);
    expect(result.unresolved_fields[0].sdl_path).toBe('person.email.primary');
    expect(result.unresolved_fields[0].error.code).toBe('UNRESOLVED_FIELD');
  });

  it('allows access when scope covers pack by pack ref', () => {
    const vault = createInMemoryVault(vaultOptions());
    const pack = makePack();
    const pack_hash = vault.storePack(pack);

    // Consent scope covers the pack itself
    const consent = buildConsentObject(
      SUBJECT,
      GRANTEE,
      'grant',
      [{ type: 'pack', ref: pack_hash }],
      ['read'],
      { now: consentNow, expires_at: consentExpires }
    );
    const consent_hash = vault.storeConsent(consent);

    vault.registerSdlMapping('person.name.legal.full', 'full-name');

    const token = vault.mintCapability(
      consent_hash,
      [{ type: 'pack', ref: pack_hash }],
      ['read'],
      tokenExpires,
      { now: tokenNow }
    );

    const result = vault.requestAccess(
      {
        capability_token: token,
        sdl_paths: ['person.name.legal.full'],
        pack_ref: pack_hash
      },
      { now: accessNow }
    );

    expect(result.policy.decision).toBe('ALLOW');
    expect(result.resolved_fields).toHaveLength(1);
    expect(result.resolved_fields[0].field_id).toBe('full-name');
  });
});

// ============================================================
// 2. Expiry: capability expired -> DENY(EXPIRED)
// ============================================================

describe('vault expiry: capability expired -> DENY(EXPIRED)', () => {
  it('denies access when capability token has expired', () => {
    const { vault, pack_hash, consent_hash } = setupVault();

    const shortExpiry = '2025-06-15T10:00:01Z';
    const token = vault.mintCapability(
      consent_hash,
      makeConsentScope(),
      ['read'],
      shortExpiry,
      { now: tokenNow }
    );

    // Access after expiry
    const result = vault.requestAccess(
      {
        capability_token: token,
        sdl_paths: ['person.name.legal.full'],
        pack_ref: pack_hash
      },
      { now: new Date('2025-06-15T10:00:02Z') }
    );

    expect(result.policy.decision).toBe('DENY');
    expect(result.policy.reason_codes).toContain('EXPIRED');
    expect(result.resolved_fields).toHaveLength(0);
    expect(result.unresolved_fields).toHaveLength(0);
  });
});

// ============================================================
// 3. Replay: reuse token nonce/jti -> DENY(REPLAY)
// ============================================================

describe('vault replay: reuse token -> DENY(REPLAY)', () => {
  it('denies access on second presentation of the same token', () => {
    const { vault, pack_hash, consent_hash } = setupVault();

    const token = vault.mintCapability(
      consent_hash,
      makeConsentScope(),
      ['read'],
      tokenExpires,
      { now: tokenNow }
    );

    // First access succeeds
    const result1 = vault.requestAccess(
      {
        capability_token: token,
        sdl_paths: ['person.name.legal.full'],
        pack_ref: pack_hash
      },
      { now: accessNow }
    );
    expect(result1.policy.decision).toBe('ALLOW');

    // Second access with same token (replay)
    const result2 = vault.requestAccess(
      {
        capability_token: token,
        sdl_paths: ['person.name.legal.full'],
        pack_ref: pack_hash
      },
      { now: new Date('2025-06-15T10:00:01Z') }
    );
    expect(result2.policy.decision).toBe('DENY');
    expect(result2.policy.reason_codes).toContain('REPLAY');
  });
});

// ============================================================
// 4. Revocation: revoke token -> DENY(REVOKED)
// ============================================================

describe('vault revocation: operator revokes one token -> DENY(REVOKED)', () => {
  it('denies access when capability token has been revoked', () => {
    const { vault, pack_hash, consent_hash, revocationRegistry } = setupVault();

    const token = vault.mintCapability(
      consent_hash,
      makeConsentScope(),
      ['read'],
      tokenExpires,
      { now: tokenNow }
    );

    // Operator containment of this one token, through the vault's registry.
    revokeCapabilityToken(token.capability_hash, revocationRegistry);

    // Access after revocation
    const result = vault.requestAccess(
      {
        capability_token: token,
        sdl_paths: ['person.name.legal.full'],
        pack_ref: pack_hash
      },
      { now: accessNow }
    );

    expect(result.policy.decision).toBe('DENY');
    expect(result.policy.reason_codes).toContain('REVOKED');
  });
});

// ============================================================
// 5. Scope escalation: request SDL path not covered -> DENY(SCOPE_ESCALATION)
// ============================================================

describe('vault scope escalation: uncovered SDL path -> DENY(SCOPE_ESCALATION)', () => {
  it('denies access when resolved field content is not in capability scope', () => {
    const vault = createInMemoryVault(vaultOptions());

    const pack = makePack();
    const pack_hash = vault.storePack(pack);

    // Consent scope only covers CONTENT_A (not CONTENT_B or CONTENT_C)
    const limitedScope: ScopeEntry[] = [{ type: 'content', ref: CONTENT_A }];
    const consent = buildConsentObject(
      SUBJECT,
      GRANTEE,
      'grant',
      limitedScope,
      ['read'],
      { now: consentNow, expires_at: consentExpires }
    );
    const consent_hash = vault.storeConsent(consent);

    vault.registerSdlMapping('person.name.legal.full', 'full-name');
    vault.registerSdlMapping('person.birth.date', 'birth-date');

    const token = vault.mintCapability(
      consent_hash,
      limitedScope,
      ['read'],
      tokenExpires,
      { now: tokenNow }
    );

    // Request access to birth-date which resolves to CONTENT_B (not in scope)
    const result = vault.requestAccess(
      {
        capability_token: token,
        sdl_paths: ['person.birth.date'],
        pack_ref: pack_hash
      },
      { now: accessNow }
    );

    expect(result.policy.decision).toBe('DENY');
    expect(result.policy.reason_codes).toContain('SCOPE_ESCALATION');
  });
});

// ============================================================
// 6. Deterministic ordering: same request → identical output
// ============================================================

describe('vault deterministic ordering', () => {
  it('produces identical output ordering for the same request', () => {
    // Run the same request twice (with fresh registries) and compare
    function runRequest() {
      resetNonceRegistry();

      const vault = createInMemoryVault({ ...vaultOptions(), revocationRegistry: new InMemoryRevocationRegistry() });
      const pack = makePack();
      const pack_hash = vault.storePack(pack);

      const consent = makeConsent();
      const consent_hash = vault.storeConsent(consent);

      vault.registerSdlMapping('person.name.legal.full', 'full-name');
      vault.registerSdlMapping('person.birth.date', 'birth-date');
      vault.registerSdlMapping('person.location.country', 'country');

      const token = vault.mintCapability(
        consent_hash,
        makeConsentScope(),
        ['read'],
        tokenExpires,
        { now: tokenNow }
      );

      return vault.requestAccess(
        {
          capability_token: token,
          // Deliberately provide paths in non-sorted order
          sdl_paths: [
            'person.location.country',
            'person.name.legal.full',
            'person.birth.date',
            'person.email.primary' // unresolved
          ],
          pack_ref: pack_hash
        },
        { now: accessNow }
      );
    }

    const result1 = runRequest();
    const result2 = runRequest();

    // Policy should be identical
    expect(result1.policy).toEqual(result2.policy);

    // Resolved fields should be in the same order
    expect(result1.resolved_fields.map(f => f.sdl_path)).toEqual(
      result2.resolved_fields.map(f => f.sdl_path)
    );
    expect(result1.resolved_fields).toEqual(result2.resolved_fields);

    // Unresolved fields should be in the same order
    expect(result1.unresolved_fields.map(f => f.sdl_path)).toEqual(
      result2.unresolved_fields.map(f => f.sdl_path)
    );

    // Verify sorting: resolved are sorted by sdl_path
    const resolvedPaths = result1.resolved_fields.map(f => f.sdl_path);
    expect(resolvedPaths).toEqual([...resolvedPaths].sort());

    // Verify unresolved come in sorted order too
    const unresolvedPaths = result1.unresolved_fields.map(f => f.sdl_path);
    expect(unresolvedPaths).toEqual([...unresolvedPaths].sort());
  });

  it('produces deterministic resolved_fields regardless of input order', () => {
    const { vault, pack_hash, consent_hash } = setupVault();

    const token1 = vault.mintCapability(
      consent_hash,
      makeConsentScope(),
      ['read'],
      tokenExpires,
      { now: tokenNow }
    );

    const result1 = vault.requestAccess(
      {
        capability_token: token1,
        sdl_paths: ['person.location.country', 'person.name.legal.full'],
        pack_ref: pack_hash
      },
      { now: accessNow }
    );

    // Mint a fresh token for the second request (replay protection)
    const token2 = vault.mintCapability(
      consent_hash,
      makeConsentScope(),
      ['read'],
      tokenExpires,
      { now: tokenNow }
    );

    const result2 = vault.requestAccess(
      {
        capability_token: token2,
        sdl_paths: ['person.name.legal.full', 'person.location.country'],
        pack_ref: pack_hash
      },
      { now: accessNow }
    );

    // Both should produce identical resolved_fields ordering
    expect(result1.resolved_fields).toEqual(result2.resolved_fields);
  });
});

// ============================================================
// Additional edge cases
// ============================================================

describe('vault store operations', () => {
  it('stores and retrieves packs by hash', () => {
    const vault = createInMemoryVault(vaultOptions());
    const pack = makePack();
    const hash = vault.storePack(pack);
    expect(hash).toBe(pack.pack_hash);
    expect(vault.getStore().packs.get(hash)).toEqual(pack);
  });

  it('stores and retrieves consents by hash', () => {
    const vault = createInMemoryVault(vaultOptions());
    const consent = makeConsent();
    const hash = vault.storeConsent(consent);
    expect(hash).toBe(consent.consent_hash);
    expect(vault.getStore().consents.get(hash)).toEqual(consent);
  });

  it('stores capabilities after minting', () => {
    const vault = createInMemoryVault(vaultOptions());
    const consent = makeConsent();
    vault.storeConsent(consent);

    const token = vault.mintCapability(
      consent.consent_hash,
      makeConsentScope(),
      ['read'],
      tokenExpires,
      { now: tokenNow }
    );

    expect(vault.getStore().capabilities.get(token.capability_hash)).toEqual(token);
  });

  it('throws when minting capability for non-existent consent', () => {
    const vault = createInMemoryVault(vaultOptions());
    const fakeHash = 'f'.repeat(64);

    expect(() =>
      vault.mintCapability(fakeHash, makeConsentScope(), ['read'], tokenExpires, { now: tokenNow })
    ).toThrow('Consent not found');
  });
});

describe('vault SDL path validation', () => {
  it('rejects invalid SDL paths in access requests', () => {
    const { vault, pack_hash, consent_hash } = setupVault();

    const token = vault.mintCapability(
      consent_hash,
      makeConsentScope(),
      ['read'],
      tokenExpires,
      { now: tokenNow }
    );

    const result = vault.requestAccess(
      {
        capability_token: token,
        sdl_paths: ['INVALID_PATH'],
        pack_ref: pack_hash
      },
      { now: accessNow }
    );

    // Invalid paths are unresolved, but do not deny
    expect(result.policy.decision).toBe('ALLOW');
    expect(result.resolved_fields).toHaveLength(0);
    expect(result.unresolved_fields).toHaveLength(1);
    expect(result.unresolved_fields[0].error.code).toBe('INVALID_SDL_PATH');
  });

  it('rejects single-segment SDL paths', () => {
    const { vault, pack_hash, consent_hash } = setupVault();

    const token = vault.mintCapability(
      consent_hash,
      makeConsentScope(),
      ['read'],
      tokenExpires,
      { now: tokenNow }
    );

    const result = vault.requestAccess(
      {
        capability_token: token,
        sdl_paths: ['person'],
        pack_ref: pack_hash
      },
      { now: accessNow }
    );

    expect(result.policy.decision).toBe('ALLOW');
    expect(result.unresolved_fields).toHaveLength(1);
    expect(result.unresolved_fields[0].error.code).toBe('INVALID_SDL_PATH');
  });

  it('rejects SDL mapping registration with invalid paths', () => {
    const vault = createInMemoryVault(vaultOptions());
    expect(() => vault.registerSdlMapping('BAD', 'field-id')).toThrow('Invalid SDL path');
  });
});

describe('vault consent not found for token', () => {
  it('denies access when consent for capability is not in store', () => {
    const vault = createInMemoryVault(vaultOptions());
    const pack = makePack();
    const pack_hash = vault.storePack(pack);

    // Mint outside vault to get a token whose consent is not stored
    const consent = makeConsent();
    const { mintCapabilityToken } = require('../../capability');
    const token = mintCapabilityToken(
      consent,
      makeConsentScope(),
      ['read'],
      tokenExpires,
      { now: tokenNow }
    );

    const result = vault.requestAccess(
      {
        capability_token: token,
        sdl_paths: ['person.name.legal.full'],
        pack_ref: pack_hash
      },
      { now: accessNow }
    );

    expect(result.policy.decision).toBe('DENY');
    expect(result.policy.reason_codes).toContain('INVALID_CAPABILITY');
  });
});

describe('vault pack not found', () => {
  it('denies access when pack_ref is not in store', () => {
    const { vault, consent_hash } = setupVault();

    const token = vault.mintCapability(
      consent_hash,
      makeConsentScope(),
      ['read'],
      tokenExpires,
      { now: tokenNow }
    );

    const result = vault.requestAccess(
      {
        capability_token: token,
        sdl_paths: ['person.name.legal.full'],
        pack_ref: 'f'.repeat(64) // non-existent pack
      },
      { now: accessNow }
    );

    expect(result.policy.decision).toBe('DENY');
    expect(result.policy.reason_codes).toContain('PACK_NOT_FOUND');
  });
});

describe('vault hardening: negative paths and invariant shapes', () => {
  it('denies malformed capability token object with INVALID_CAPABILITY', () => {
    const { vault, pack_hash, consent_hash } = setupVault();

    const token = vault.mintCapability(
      consent_hash,
      makeConsentScope(),
      ['read'],
      tokenExpires,
      { now: tokenNow }
    );

    const malformedToken = {
      ...token,
      version: 1 as any
    } as any;

    const result = vault.requestAccess(
      {
        capability_token: malformedToken,
        sdl_paths: ['person.name.legal.full'],
        pack_ref: pack_hash
      },
      { now: accessNow }
    );

    expect(result.policy).toEqual({ decision: 'DENY', reason_codes: ['INVALID_CAPABILITY'] });
    expect(result.resolved_fields).toEqual([]);
    expect(result.unresolved_fields).toEqual([]);
  });

  it('returns ALLOW with INVALID_SDL_PATH unresolved entries for invalid SDL strings', () => {
    const { vault, pack_hash, consent_hash } = setupVault();
    const token = vault.mintCapability(
      consent_hash,
      makeConsentScope(),
      ['read'],
      tokenExpires,
      { now: tokenNow }
    );

    const result = vault.requestAccess(
      {
        capability_token: token,
        sdl_paths: ['Person.name', 'person..name', 'person.name.'],
        pack_ref: pack_hash
      },
      { now: accessNow }
    );

    expect(result.policy).toEqual({ decision: 'ALLOW', reason_codes: [] });
    expect(result.resolved_fields).toEqual([]);
    expect(result.unresolved_fields).toHaveLength(3);
    for (const entry of result.unresolved_fields) {
      expect(entry.error.code).toBe('INVALID_SDL_PATH');
      expect(entry.error.message).toContain('Invalid SDL path:');
      expect(entry.error.path).toBe(entry.sdl_path);
      expect(entry.error).toEqual(
        expect.objectContaining({
          code: 'INVALID_SDL_PATH',
          message: expect.any(String)
        })
      );
      expect((entry.error as any).details).toBeUndefined();
    }
  });

  it('returns deterministic ALLOW with empty resolved/unresolved for empty sdl_paths', () => {
    const { vault, pack_hash, consent_hash } = setupVault();
    const token = vault.mintCapability(
      consent_hash,
      makeConsentScope(),
      ['read'],
      tokenExpires,
      { now: tokenNow }
    );

    const result = vault.requestAccess(
      {
        capability_token: token,
        sdl_paths: [],
        pack_ref: pack_hash
      },
      { now: accessNow }
    );

    expect(result.policy).toEqual({ decision: 'ALLOW', reason_codes: [] });
    expect(result.resolved_fields).toEqual([]);
    expect(result.unresolved_fields).toEqual([]);
  });

  it('preserves duplicated SDL paths deterministically', () => {
    const { vault, pack_hash, consent_hash } = setupVault();
    const token = vault.mintCapability(
      consent_hash,
      makeConsentScope(),
      ['read'],
      tokenExpires,
      { now: tokenNow }
    );

    const result = vault.requestAccess(
      {
        capability_token: token,
        sdl_paths: ['person.name.legal.full', 'person.name.legal.full', 'person.missing.path'],
        pack_ref: pack_hash
      },
      { now: accessNow }
    );

    expect(result.policy).toEqual({ decision: 'ALLOW', reason_codes: [] });
    expect(result.resolved_fields.map(f => f.sdl_path)).toEqual([
      'person.name.legal.full',
      'person.name.legal.full'
    ]);
    expect(result.unresolved_fields.map(f => f.sdl_path)).toEqual(['person.missing.path']);
  });

  it('returns deterministic PACK_NOT_FOUND structure for unknown pack_ref', () => {
    const { vault, consent_hash } = setupVault();
    const token = vault.mintCapability(
      consent_hash,
      makeConsentScope(),
      ['read'],
      tokenExpires,
      { now: tokenNow }
    );

    const result = vault.requestAccess(
      {
        capability_token: token,
        sdl_paths: ['person.name.legal.full'],
        pack_ref: '0'.repeat(64)
      },
      { now: accessNow }
    );

    expect(result).toEqual({
      policy: { decision: 'DENY', reason_codes: ['PACK_NOT_FOUND'] },
      resolved_fields: [],
      unresolved_fields: []
    });
  });

  it('throws deterministic CONSENT_NOT_FOUND when minting with unknown consent_ref', () => {
    const vault = createInMemoryVault(vaultOptions());

    try {
      vault.mintCapability('f'.repeat(64), makeConsentScope(), ['read'], tokenExpires, {
        now: tokenNow
      });
      throw new Error('Expected mintCapability to throw for unknown consent_ref');
    } catch (error) {
      const err = error as Error & { code?: string };
      expect(err.code).toBe('CONSENT_NOT_FOUND');
      expect(err.message).toContain('Consent not found:');
    }
  });

  it('keeps deterministic resolved/unresolved ordering for mixed valid+invalid paths', () => {
    const { vault, pack_hash, consent_hash } = setupVault();
    const token = vault.mintCapability(
      consent_hash,
      makeConsentScope(),
      ['read'],
      tokenExpires,
      { now: tokenNow }
    );

    const result = vault.requestAccess(
      {
        capability_token: token,
        sdl_paths: [
          'person.location.country',
          'person.email.primary',
          'person.birth.date',
          'BAD_PATH'
        ],
        pack_ref: pack_hash
      },
      { now: accessNow }
    );

    expect(result.policy).toEqual({ decision: 'ALLOW', reason_codes: [] });
    expect(result.resolved_fields.map(f => f.sdl_path)).toEqual([
      'person.birth.date',
      'person.location.country'
    ]);
    expect(result.unresolved_fields.map(f => f.sdl_path)).toEqual(['BAD_PATH', 'person.email.primary']);
    expect(result.unresolved_fields[0].error).toEqual(
      expect.objectContaining({
        code: 'INVALID_SDL_PATH',
        message: expect.any(String),
        path: 'BAD_PATH'
      })
    );
    expect((result.unresolved_fields[0].error as any).details).toBeUndefined();
    expect(result.unresolved_fields[1].error).toEqual(
      expect.objectContaining({
        code: 'UNRESOLVED_FIELD',
        message: expect.any(String),
        path: 'person.email.primary'
      })
    );
    expect((result.unresolved_fields[1].error as any).details).toBeUndefined();
  });
});

describe('vault consent-based revocation', () => {
  it('revokes the consent via applyConsent and denies access with CONSENT_REVOKED', () => {
    const { vault, pack_hash, consent_hash } = setupVault();

    const token = vault.mintCapability(
      consent_hash,
      makeConsentScope(),
      ['read'],
      tokenExpires,
      { now: tokenNow }
    );

    const beforeRevoke = vault.requestAccess(
      {
        capability_token: token,
        sdl_paths: ['person.name.legal.full'],
        pack_ref: pack_hash
      },
      { now: accessNow }
    );
    expect(beforeRevoke.policy.decision).toBe('ALLOW');

    const revokeConsent = buildConsentObject(
      SUBJECT,
      GRANTEE,
      'revoke',
      [],
      [],
      {
        now: new Date('2025-06-15T10:00:30Z'),
        prior_consent: consent_hash,
        revoke_target: { capability_hash: token.capability_hash }
      }
    );

    vault.applyConsent(revokeConsent);

    const afterRevoke = vault.requestAccess(
      {
        capability_token: token,
        sdl_paths: ['person.name.legal.full'],
        pack_ref: pack_hash
      },
      { now: accessNow }
    );

    expect(afterRevoke.policy.decision).toBe('DENY');
    expect(afterRevoke.policy.reason_codes).toContain('CONSENT_REVOKED');
  });

  it('rejects revoke consent when subject differs from original consent subject', () => {
    const { vault, consent_hash } = setupVault();

    const token = vault.mintCapability(
      consent_hash,
      makeConsentScope(),
      ['read'],
      tokenExpires,
      { now: tokenNow }
    );

    const unauthorizedRevoke = buildConsentObject(
      testSubjectSigner('unauthorized-revoker').did,
      GRANTEE,
      'revoke',
      [],
      [],
      {
        now: new Date('2025-06-15T10:00:30Z'),
        prior_consent: consent_hash,
        revoke_target: { capability_hash: token.capability_hash }
      }
    );

    expect(() => vault.applyConsent(unauthorizedRevoke)).toThrow(
      'Consent subject must match revoked capability subject.'
    );
  });
});
