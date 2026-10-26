import { canonicalCapabilityActions } from '../../shared/capabilityActions';
import { MarketMakerRegistry } from '../../shared/marketMakerRegistry';
import { buildConsentObject as buildUnsignedConsentObject } from '../../consent/consentObject';
import { ScopeEntry } from '../../consent/types';
import {
  mintCapabilityToken,
  validateCapabilityToken,
  verifyCapabilityToken as verifyCapabilityTokenRaw,
  resetNonceRegistry
} from '../capabilityToken';
import { buildCapabilityId } from '../capabilityId';
import { canonicalizeCapabilityPayload } from '../canonical';
import { computeCapabilityHash } from '../hash';
import { revokeCapabilityToken, isRevoked } from '../revocation';
import { testSubjectSigner, signTestConsent } from '../../tests/helpers/consentSigning';
import { SubjectConsentProofError } from '../../consent';
import { InMemoryRevocationRegistry } from '../registries/InMemoryRevocationRegistry';

// Every authorization path reads revocation from an injected registry; these
// tests share one and pass it unless a test supplies its own.
const revocationRegistry = new InMemoryRevocationRegistry();
const verifyCapabilityToken: typeof verifyCapabilityTokenRaw = (token, consent, opts, registries) =>
  verifyCapabilityTokenRaw(token, consent, opts, { revocationRegistry, ...registries });


// Consents in these tests are signed by their subject; unsigned consents authorize nothing.
const buildConsentObject: typeof buildUnsignedConsentObject = (...args) =>
  signTestConsent(buildUnsignedConsentObject(...args));

const SUBJECT = testSubjectSigner('subject').did;
const GRANTEE = testSubjectSigner('grantee').did;
const REF_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const REF_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const REF_C = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';

const baseScope: ScopeEntry[] = [{ type: 'content', ref: REF_A }];
const multiScope: ScopeEntry[] = [
  { type: 'content', ref: REF_A },
  { type: 'content', ref: REF_B },
  { type: 'pack', ref: REF_C }
];
const basePermissions = ['read'];
const multiPermissions = ['read', 'store'];

const consentNow = new Date('2025-01-15T14:30:00Z');
const tokenNow = new Date('2025-06-15T10:00:00Z');
const tokenExpires = '2025-12-31T23:59:59Z';
const consentExpires = '2026-01-15T14:30:00Z';

function buildBaseConsent(opts: {
  scope?: ScopeEntry[];
  permissions?: string[];
  expires_at?: string | null;
} = {}) {
  return buildConsentObject(
    SUBJECT,
    GRANTEE,
    'grant',
    opts.scope ?? multiScope,
    opts.permissions ?? multiPermissions,
    {
      now: consentNow,
      expires_at: 'expires_at' in opts ? opts.expires_at : consentExpires
    }
  );
}

// Reset in-memory registries between tests
beforeEach(() => {
  resetNonceRegistry();
});

describe('capability token minting', () => {
  it('allows unbound parent consent to mint an unbound capability', () => {
    const consent = buildBaseConsent({ expires_at: consentExpires });
    const token = mintCapabilityToken(
      consent,
      baseScope,
      basePermissions,
      tokenExpires,
      { now: tokenNow }
    );

    expect(token.marketMakerId).toBeUndefined();
  });

  it('mints a valid capability token from a grant consent', () => {
    const consent = buildBaseConsent();
    const token = mintCapabilityToken(
      consent,
      baseScope,
      basePermissions,
      tokenExpires,
      { now: tokenNow }
    );

    expect(token.version).toBe('1.0');
    expect(token.subject).toBe(SUBJECT);
    expect(token.grantee).toBe(GRANTEE);
    expect(token.consent_ref).toBe(consent.consent_hash);
    expect(token.scope).toEqual(baseScope);
    expect(token.permissions).toEqual(basePermissions);
    expect(token.issued_at).toBe('2025-06-15T10:00:00Z');
    expect(token.not_before).toBeNull();
    expect(token.expires_at).toBe(tokenExpires);
    expect(token.marketMakerId).toBeUndefined();
    expect(token.token_id).toMatch(/^[a-f0-9]{64}$/);
    expect(token.capability_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces deterministic hashes for identical payloads (same token_id)', () => {
    const consent = buildBaseConsent();
    const token = mintCapabilityToken(
      consent,
      baseScope,
      basePermissions,
      tokenExpires,
      { now: tokenNow }
    );

    // Recompute hash from the token's payload
    const payloadBytes = canonicalizeCapabilityPayload({
      version: token.version,
      subject: token.subject,
      grantee: token.grantee,
      consent_ref: token.consent_ref,
      scope: token.scope,
      permissions: token.permissions,
      issued_at: token.issued_at,
      not_before: token.not_before,
      expires_at: token.expires_at,
      token_id: token.token_id
    });
    const expectedHash = computeCapabilityHash(payloadBytes);

    expect(token.capability_hash).toBe(expectedHash);
  });

  it('changes the capability hash when marketMakerId is added to the same payload', () => {
    const commonPayload = {
      version: '1.0',
      subject: SUBJECT,
      grantee: GRANTEE,
      consent_ref: 'd'.repeat(64),
      scope: baseScope,
      permissions: basePermissions,
      issued_at: '2025-06-15T10:00:00Z',
      not_before: null,
      expires_at: tokenExpires,
      token_id: 'e'.repeat(64)
    } as const;

    const unboundHash = computeCapabilityHash(
      canonicalizeCapabilityPayload(commonPayload)
    );
    const boundHash = computeCapabilityHash(
      canonicalizeCapabilityPayload({
        ...commonPayload,
        marketMakerId: 'hrkey-v1'
      })
    );

    expect(boundHash).not.toBe(unboundHash);
  });

  it('produces the same capability hash for identical payloads with the same marketMakerId', () => {
    const boundPayload = {
      version: '1.0',
      subject: SUBJECT,
      grantee: GRANTEE,
      consent_ref: 'd'.repeat(64),
      scope: baseScope,
      permissions: basePermissions,
      marketMakerId: 'hrkey-v1',
      issued_at: '2025-06-15T10:00:00Z',
      not_before: null,
      expires_at: tokenExpires,
      token_id: 'e'.repeat(64)
    } as const;

    const hashA = computeCapabilityHash(
      canonicalizeCapabilityPayload(boundPayload)
    );
    const hashB = computeCapabilityHash(
      canonicalizeCapabilityPayload(boundPayload)
    );

    expect(hashA).toBe(hashB);
  });

  it('produces unique token_ids across mints', () => {
    const consent = buildBaseConsent();
    const token1 = mintCapabilityToken(
      consent, baseScope, basePermissions, tokenExpires, { now: tokenNow }
    );
    const token2 = mintCapabilityToken(
      consent, baseScope, basePermissions, tokenExpires, { now: tokenNow }
    );

    expect(token1.token_id).not.toBe(token2.token_id);
    expect(token1.capability_hash).not.toBe(token2.capability_hash);
  });

  it('allows the canonical capability action vocabulary', () => {
    const consent = buildBaseConsent({ permissions: [...canonicalCapabilityActions] });
    const token = mintCapabilityToken(
      consent,
      baseScope,
      ['aggregate', 'derive', 'read', 'share', 'store'],
      tokenExpires,
      { now: tokenNow }
    );

    expect(token.permissions).toEqual(['aggregate', 'derive', 'read', 'share', 'store']);
  });

  it('rejects unknown capability permissions during minting', () => {
    const consent = buildBaseConsent({ permissions: ['read', 'store'] });

    expect(() =>
      mintCapabilityToken(consent, baseScope, ['read', 'write'], tokenExpires, { now: tokenNow })
    ).toThrow('Capability permission 1 must be one of: read, store, share, derive, aggregate.');
  });

  it('rejects malformed capability permission strings during minting', () => {
    const consent = buildBaseConsent({ permissions: ['read', 'store'] });

    expect(() =>
      mintCapabilityToken(consent, baseScope, ['read', 'Read'], tokenExpires, { now: tokenNow })
    ).toThrow('Capability permission 1: must be lowercase alphanumeric with hyphens.');
  });

  it('mints with not_before set', () => {
    const consent = buildBaseConsent();
    const token = mintCapabilityToken(
      consent,
      baseScope,
      basePermissions,
      tokenExpires,
      { now: tokenNow, not_before: '2025-07-01T00:00:00Z' }
    );

    expect(token.not_before).toBe('2025-07-01T00:00:00Z');
  });

  it('mints with full consent scope and permissions (no attenuation)', () => {
    const consent = buildBaseConsent();
    const token = mintCapabilityToken(
      consent,
      multiScope,
      multiPermissions,
      tokenExpires,
      { now: tokenNow }
    );

    expect(token.scope).toEqual(multiScope);
    expect(token.permissions).toEqual(multiPermissions);
  });

  it('mints with attenuated scope', () => {
    const consent = buildBaseConsent();
    const token = mintCapabilityToken(
      consent,
      [{ type: 'content', ref: REF_A }],
      multiPermissions,
      tokenExpires,
      { now: tokenNow }
    );

    expect(token.scope).toHaveLength(1);
  });

  it('mints with attenuated permissions', () => {
    const consent = buildBaseConsent();
    const token = mintCapabilityToken(
      consent,
      multiScope,
      ['read'],
      tokenExpires,
      { now: tokenNow }
    );

    expect(token.permissions).toEqual(['read']);
  });

  it('mints with temporal attenuation (earlier expires_at)', () => {
    const consent = buildBaseConsent();
    const token = mintCapabilityToken(
      consent,
      baseScope,
      basePermissions,
      '2025-09-01T00:00:00Z',
      { now: tokenNow }
    );

    expect(token.expires_at).toBe('2025-09-01T00:00:00Z');
  });

  it('mints when parent consent has null expires_at', () => {
    const consent = buildBaseConsent({ expires_at: null });
    const token = mintCapabilityToken(
      consent,
      baseScope,
      basePermissions,
      '2099-12-31T23:59:59Z',
      { now: tokenNow }
    );

    expect(token.expires_at).toBe('2099-12-31T23:59:59Z');
  });

  it('preserves parent consent marketMakerId when minting a capability', () => {
    const consent = buildConsentObject(
      SUBJECT,
      GRANTEE,
      'grant',
      multiScope,
      multiPermissions,
      {
        now: consentNow,
        expires_at: consentExpires,
        marketMakerId: 'hrkey-v1'
      }
    );

    const token = mintCapabilityToken(
      consent,
      baseScope,
      basePermissions,
      tokenExpires,
      { now: tokenNow, marketMakerId: 'hrkey-v1' }
    );

    expect(token.marketMakerId).toBe('hrkey-v1');
  });

  it('accepts did:aoc:public as grantee', () => {
    const consent = buildConsentObject(
      SUBJECT,
      'did:aoc:public',
      'grant',
      multiScope,
      multiPermissions,
      { now: consentNow, expires_at: consentExpires }
    );
    const token = mintCapabilityToken(
      consent, baseScope, basePermissions, tokenExpires, { now: tokenNow }
    );

    expect(token.grantee).toBe('did:aoc:public');
  });
});

describe('capability token minting — rejection paths', () => {
  it('rejects minting from a revoke consent', () => {
    const grant = buildBaseConsent();
    const revoke = buildConsentObject(
      SUBJECT, GRANTEE, 'revoke', [], [],
      { now: tokenNow, prior_consent: grant.consent_hash, revoke_target: { capability_hash: REF_A } }
    );

    expect(() =>
      mintCapabilityToken(revoke, baseScope, basePermissions, tokenExpires, { now: tokenNow })
    ).toThrow('Capability token can only be derived from a consent with action "grant".');
  });

  it('rejects scope escalation (scope entry not in consent)', () => {
    const consent = buildBaseConsent({ scope: baseScope });
    const extraScope: ScopeEntry[] = [
      { type: 'content', ref: REF_A },
      { type: 'pack', ref: REF_C }
    ];

    expect(() =>
      mintCapabilityToken(consent, extraScope, basePermissions, tokenExpires, { now: tokenNow })
    ).toThrow('Scope escalation');
  });

  it('rejects permission escalation (permission not in consent)', () => {
    const consent = buildBaseConsent({ permissions: ['read'] });

    expect(() =>
      mintCapabilityToken(consent, baseScope, ['read', 'store'], tokenExpires, { now: tokenNow })
    ).toThrow('Permission escalation');
  });

  it('rejects expires_at before issued_at', () => {
    const consent = buildBaseConsent();

    expect(() =>
      mintCapabilityToken(
        consent, baseScope, basePermissions,
        '2025-01-01T00:00:00Z',
        { now: tokenNow }
      )
    ).toThrow('Capability expires_at must be after issued_at.');
  });

  it('rejects expires_at equal to issued_at', () => {
    const consent = buildBaseConsent();

    expect(() =>
      mintCapabilityToken(
        consent, baseScope, basePermissions,
        '2025-06-15T10:00:00Z',
        { now: tokenNow }
      )
    ).toThrow('Capability expires_at must be after issued_at.');
  });

  it('rejects expires_at beyond consent expires_at', () => {
    const consent = buildBaseConsent({ expires_at: '2025-12-01T00:00:00Z' });

    expect(() =>
      mintCapabilityToken(
        consent, baseScope, basePermissions,
        '2026-01-01T00:00:00Z',
        { now: tokenNow }
      )
    ).toThrow('Capability expires_at must not exceed parent consent expires_at.');
  });

  it('rejects issued_at before consent issued_at', () => {
    const consent = buildBaseConsent();

    expect(() =>
      mintCapabilityToken(
        consent, baseScope, basePermissions, tokenExpires,
        { now: new Date('2025-01-01T00:00:00Z') }
      )
    ).toThrow('Capability issued_at must be at or after parent consent issued_at.');
  });

  it('rejects not_before before issued_at', () => {
    const consent = buildBaseConsent();

    expect(() =>
      mintCapabilityToken(
        consent, baseScope, basePermissions, tokenExpires,
        { now: tokenNow, not_before: '2025-01-01T00:00:00Z' }
      )
    ).toThrow('Capability not_before must be at or after issued_at.');
  });

  it('rejects not_before at or after expires_at', () => {
    const consent = buildBaseConsent();

    expect(() =>
      mintCapabilityToken(
        consent, baseScope, basePermissions, tokenExpires,
        { now: tokenNow, not_before: tokenExpires }
      )
    ).toThrow('Capability not_before must be before expires_at.');
  });

  it('rejects overriding a parent consent marketMakerId', () => {
    const consent = buildConsentObject(
      SUBJECT,
      GRANTEE,
      'grant',
      multiScope,
      multiPermissions,
      {
        now: consentNow,
        expires_at: consentExpires,
        marketMakerId: 'hrkey-v1'
      }
    );

    expect(() =>
      mintCapabilityToken(
        consent,
        baseScope,
        basePermissions,
        tokenExpires,
        { now: tokenNow, marketMakerId: 'other-maker' }
      )
    ).toThrow('Capability marketMakerId must match parent consent marketMakerId.');
  });

  it('rejects introducing a marketMakerId when parent consent is unbound', () => {
    const consent = buildBaseConsent();

    expect(() =>
      mintCapabilityToken(
        consent,
        baseScope,
        basePermissions,
        tokenExpires,
        { now: tokenNow, marketMakerId: 'hrkey-v1' }
      )
    ).toThrow('Capability marketMakerId cannot be introduced when parent consent is unbound.');
  });

  it('rejects malformed marketMakerId values during minting', () => {
    const consent = buildConsentObject(
      SUBJECT,
      GRANTEE,
      'grant',
      multiScope,
      multiPermissions,
      {
        now: consentNow,
        expires_at: consentExpires,
        marketMakerId: 'hrkey-v1'
      }
    );

    expect(() =>
      mintCapabilityToken(
        consent,
        baseScope,
        basePermissions,
        tokenExpires,
        { now: tokenNow, marketMakerId: 'Bad Value' as any }
      )
    ).toThrow('Capability marketMakerId must contain only lowercase letters, numbers, dots, underscores, or hyphens and be at most 128 characters.');
  });

  it('rejects not_before before consent issued_at', () => {
    const consent = buildBaseConsent();

    expect(() =>
      mintCapabilityToken(
        consent, baseScope, basePermissions, tokenExpires,
        { now: tokenNow, not_before: '2025-01-01T00:00:00Z' }
      )
    ).toThrow('Capability not_before must be at or after issued_at.');
  });

  it('rejects empty scope', () => {
    const consent = buildBaseConsent();

    expect(() =>
      mintCapabilityToken(consent, [], basePermissions, tokenExpires, { now: tokenNow })
    ).toThrow('Capability scope must be a non-empty array.');
  });

  it('rejects empty permissions', () => {
    const consent = buildBaseConsent();

    expect(() =>
      mintCapabilityToken(consent, baseScope, [], tokenExpires, { now: tokenNow })
    ).toThrow('Capability permissions must be a non-empty array.');
  });

  it('rejects duplicate scope entries', () => {
    const consent = buildBaseConsent();

    expect(() =>
      mintCapabilityToken(
        consent,
        [{ type: 'content', ref: REF_A }, { type: 'content', ref: REF_A }],
        basePermissions,
        tokenExpires,
        { now: tokenNow }
      )
    ).toThrow('Capability scope contains duplicate entry');
  });

  it('rejects duplicate permissions', () => {
    const consent = buildBaseConsent();

    expect(() =>
      mintCapabilityToken(
        consent,
        baseScope,
        ['read', 'read'],
        tokenExpires,
        { now: tokenNow }
      )
    ).toThrow('Capability permissions contain duplicate');
  });

  it('rejects invalid scope type', () => {
    const consent = buildBaseConsent();

    expect(() =>
      mintCapabilityToken(
        consent,
        [{ type: 'invalid' as any, ref: REF_A }],
        basePermissions,
        tokenExpires,
        { now: tokenNow }
      )
    ).toThrow('Scope entry 0: type must be "field", "content", or "pack".');
  });

  it('rejects invalid scope ref', () => {
    const consent = buildBaseConsent();

    expect(() =>
      mintCapabilityToken(
        consent,
        [{ type: 'content', ref: 'INVALID' }],
        basePermissions,
        tokenExpires,
        { now: tokenNow }
      )
    ).toThrow('Scope entry 0: ref must be 64 lowercase hex characters.');
  });

  it('rejects invalid permission format', () => {
    const consent = buildBaseConsent();

    expect(() =>
      mintCapabilityToken(
        consent, baseScope, ['Read'], tokenExpires, { now: tokenNow }
      )
    ).toThrow('Capability permission 0: must be lowercase alphanumeric with hyphens.');
  });

  it('rejects invalid expires_at format', () => {
    const consent = buildBaseConsent();

    expect(() =>
      mintCapabilityToken(
        consent, baseScope, basePermissions, '2025-12-31', { now: tokenNow }
      )
    ).toThrow('Capability expires_at must be ISO 8601 UTC format');
  });

  it('rejects invalid not_before format', () => {
    const consent = buildBaseConsent();

    expect(() =>
      mintCapabilityToken(
        consent, baseScope, basePermissions, tokenExpires,
        { now: tokenNow, not_before: 'bad-date' }
      )
    ).toThrow('Capability not_before must be ISO 8601 UTC format');
  });
});

describe('capability token validation (structural)', () => {
  it('accepts a structurally valid capability with marketMakerId', () => {
    const consent = buildConsentObject(
      SUBJECT,
      GRANTEE,
      'grant',
      multiScope,
      multiPermissions,
      {
        now: consentNow,
        expires_at: consentExpires,
        marketMakerId: 'hrkey-v1'
      }
    );

    const token = mintCapabilityToken(
      consent,
      baseScope,
      basePermissions,
      tokenExpires,
      { now: tokenNow }
    );

    expect(() => validateCapabilityToken(token)).not.toThrow();
  });

  it('rejects malformed capability marketMakerId values', () => {
    const consent = buildConsentObject(
      SUBJECT,
      GRANTEE,
      'grant',
      multiScope,
      multiPermissions,
      {
        now: consentNow,
        expires_at: consentExpires,
        marketMakerId: 'hrkey-v1'
      }
    );

    const token = {
      ...mintCapabilityToken(consent, baseScope, basePermissions, tokenExpires, {
        now: tokenNow
      }),
      marketMakerId: 'Bad Value'
    };

    expect(() => validateCapabilityToken(token as any)).toThrow(
      'Capability marketMakerId must contain only lowercase letters, numbers, dots, underscores, or hyphens and be at most 128 characters.'
    );
  });


  it('rejects unknown marketMakerId values when a registry is enforced', () => {
    const consent = buildConsentObject(
      SUBJECT,
      GRANTEE,
      'grant',
      multiScope,
      multiPermissions,
      {
        now: consentNow,
        expires_at: consentExpires,
        marketMakerId: 'hrkey-v1'
      }
    );

    const token = mintCapabilityToken(
      consent,
      baseScope,
      basePermissions,
      tokenExpires,
      { now: tokenNow }
    );

    expect(() => validateCapabilityToken(token, new MarketMakerRegistry())).toThrow(
      'Capability marketMakerId hrkey-v1 is not registered.'
    );
  });

  it('validates a correctly minted token', () => {
    const consent = buildBaseConsent();
    const token = mintCapabilityToken(
      consent, baseScope, basePermissions, tokenExpires, { now: tokenNow }
    );

    expect(() => validateCapabilityToken(token)).not.toThrow();
  });

  it('rejects a token with tampered capability_hash', () => {
    const consent = buildBaseConsent();
    const token = mintCapabilityToken(
      consent, baseScope, basePermissions, tokenExpires, { now: tokenNow }
    );
    token.capability_hash = 'a'.repeat(64);

    expect(() => validateCapabilityToken(token)).toThrow(
      'Capability capability_hash does not match canonical payload hash.'
    );
  });

  it('rejects a token with tampered subject', () => {
    const consent = buildBaseConsent();
    const token = mintCapabilityToken(
      consent, baseScope, basePermissions, tokenExpires, { now: tokenNow }
    );
    token.subject = 'did:key:z6MkTamperedSubject123456789abcdef';

    expect(() => validateCapabilityToken(token)).toThrow(
      'Capability capability_hash does not match canonical payload hash.'
    );
  });

  it('rejects a token with tampered consent_ref', () => {
    const consent = buildBaseConsent();
    const token = mintCapabilityToken(
      consent, baseScope, basePermissions, tokenExpires, { now: tokenNow }
    );
    token.consent_ref = 'b'.repeat(64);

    expect(() => validateCapabilityToken(token)).toThrow(
      'Capability capability_hash does not match canonical payload hash.'
    );
  });

  it('rejects a token with invalid capability_hash format', () => {
    const consent = buildBaseConsent();
    const token = mintCapabilityToken(
      consent, baseScope, basePermissions, tokenExpires, { now: tokenNow }
    );
    token.capability_hash = 'INVALID';

    expect(() => validateCapabilityToken(token)).toThrow(
      'Capability capability_hash must be 64 lowercase hex characters.'
    );
  });
});

describe('capability token verification', () => {
  it('rejects parent/child marketMakerId mismatches', () => {
    const consent = buildConsentObject(
      SUBJECT,
      GRANTEE,
      'grant',
      multiScope,
      multiPermissions,
      {
        now: consentNow,
        expires_at: consentExpires,
        marketMakerId: 'hrkey-v1'
      }
    );

    const mintedToken = mintCapabilityToken(consent, baseScope, basePermissions, tokenExpires, {
      now: tokenNow
    });
    const token = {
      ...mintedToken,
      marketMakerId: 'other-maker'
    };
    token.capability_hash = computeCapabilityHash(
      canonicalizeCapabilityPayload({
        version: token.version,
        subject: token.subject,
        grantee: token.grantee,
        consent_ref: token.consent_ref,
        scope: token.scope,
        permissions: token.permissions,
        marketMakerId: token.marketMakerId,
        issued_at: token.issued_at,
        not_before: token.not_before,
        expires_at: token.expires_at,
        token_id: token.token_id
      })
    );

    expect(() => verifyCapabilityToken(token as any, consent, { now: tokenNow })).toThrow(
      'Capability marketMakerId does not match parent consent marketMakerId.'
    );
  });

  it('verifies a valid token against its parent consent', () => {
    const consent = buildBaseConsent();
    const token = mintCapabilityToken(
      consent, baseScope, basePermissions, tokenExpires, { now: tokenNow }
    );

    expect(() =>
      verifyCapabilityToken(token, consent, { now: new Date('2025-08-01T00:00:00Z') })
    ).not.toThrow();
  });

  it('rejects verification when consent_ref does not match', () => {
    const consent = buildBaseConsent();
    const differentConsent = buildConsentObject(
      SUBJECT, GRANTEE, 'grant', multiScope, multiPermissions,
      { now: new Date('2025-02-01T00:00:00Z'), expires_at: consentExpires }
    );
    const token = mintCapabilityToken(
      consent, baseScope, basePermissions, tokenExpires, { now: tokenNow }
    );

    expect(() =>
      verifyCapabilityToken(token, differentConsent, { now: new Date('2025-08-01T00:00:00Z') })
    ).toThrow('Capability consent_ref does not match parent consent consent_hash.');
  });

  it('rejects verification when parent consent is a revoke', () => {
    const grant = buildBaseConsent();
    const token = mintCapabilityToken(
      grant, baseScope, basePermissions, tokenExpires, { now: tokenNow }
    );

    // Construct a revoke consent that happens to have the same hash
    // (in practice we just pass the wrong consent)
    const revoke = buildConsentObject(
      SUBJECT, GRANTEE, 'revoke', [], [],
      { now: tokenNow, prior_consent: grant.consent_hash, revoke_target: { capability_hash: REF_A } }
    );

    // The consent_ref won't match, but the action check comes after
    // We need to manually test the action rejection path:
    // Force the consent_hash to match the token's consent_ref
    const fakeConsent = { ...revoke, consent_hash: token.consent_ref };

    expect(() =>
      verifyCapabilityToken(token, fakeConsent as any, { now: new Date('2025-08-01T00:00:00Z') })
    ).toThrow(SubjectConsentProofError);
    // Re-pointing a signed revoke at the token breaks its subject proof, so the
    // action check is a second line of defence behind it.
    expect(() =>
      verifyCapabilityToken(token, revoke, { now: new Date('2025-08-01T00:00:00Z') })
    ).toThrow('Capability consent_ref does not match parent consent consent_hash.');
  });

  it('rejects verification when the consent subject is altered after signing', () => {
    const consent = buildBaseConsent();
    const token = mintCapabilityToken(
      consent, baseScope, basePermissions, tokenExpires, { now: tokenNow }
    );

    const mismatchConsent = { ...consent, subject: 'did:key:z6MkDifferentSubject1234567890abc' };

    expect(() =>
      verifyCapabilityToken(token, mismatchConsent as any, { now: new Date('2025-08-01T00:00:00Z') })
    ).toThrow(SubjectConsentProofError);
  });

  it('rejects verification when the consent grantee is altered after signing', () => {
    const consent = buildBaseConsent();
    const token = mintCapabilityToken(
      consent, baseScope, basePermissions, tokenExpires, { now: tokenNow }
    );

    const mismatchConsent = { ...consent, grantee: 'did:key:z6MkDifferentGrantee1234567890abc' };

    expect(() =>
      verifyCapabilityToken(token, mismatchConsent as any, { now: new Date('2025-08-01T00:00:00Z') })
    ).toThrow(SubjectConsentProofError);
  });
});

describe('capability token — expired token rejection', () => {
  it('rejects an expired token', () => {
    const consent = buildBaseConsent();
    const token = mintCapabilityToken(
      consent, baseScope, basePermissions, '2025-07-01T00:00:00Z',
      { now: tokenNow }
    );

    expect(() =>
      verifyCapabilityToken(token, consent, { now: new Date('2025-08-01T00:00:00Z') })
    ).toThrow('Capability token has expired.');
  });

  it('accepts a token at exactly its expires_at', () => {
    const consent = buildBaseConsent();
    const token = mintCapabilityToken(
      consent, baseScope, basePermissions, '2025-07-01T00:00:00Z',
      { now: tokenNow }
    );

    // At exactly expires_at, now === expires_at, so now > expires_at is false
    expect(() =>
      verifyCapabilityToken(token, consent, { now: new Date('2025-07-01T00:00:00Z') })
    ).not.toThrow();
  });

  it('rejects a token before its not_before', () => {
    const consent = buildBaseConsent();
    const token = mintCapabilityToken(
      consent, baseScope, basePermissions, tokenExpires,
      { now: tokenNow, not_before: '2025-09-01T00:00:00Z' }
    );

    expect(() =>
      verifyCapabilityToken(token, consent, { now: new Date('2025-08-01T00:00:00Z') })
    ).toThrow('Capability token is not yet valid (before not_before).');
  });

  it('accepts a token at exactly its not_before', () => {
    const consent = buildBaseConsent();
    const token = mintCapabilityToken(
      consent, baseScope, basePermissions, tokenExpires,
      { now: tokenNow, not_before: '2025-09-01T00:00:00Z' }
    );

    expect(() =>
      verifyCapabilityToken(token, consent, { now: new Date('2025-09-01T00:00:00Z') })
    ).not.toThrow();
  });
});

describe('capability token — scope escalation rejection', () => {
  it('rejects verification when token has scope entries outside consent scope', () => {
    const consent = buildBaseConsent({ scope: baseScope });
    // Manually create a token with extra scope (bypassing mint validation)
    const validToken = mintCapabilityToken(
      consent, baseScope, basePermissions, tokenExpires, { now: tokenNow }
    );
    // Tamper with scope to add an escalated entry
    const tampered = {
      ...validToken,
      scope: [
        ...baseScope,
        { type: 'pack' as const, ref: REF_C }
      ]
    };
    // Recompute hash for the tampered payload (so structural validation passes)
    const payloadBytes = canonicalizeCapabilityPayload({
      version: tampered.version,
      subject: tampered.subject,
      grantee: tampered.grantee,
      consent_ref: tampered.consent_ref,
      scope: tampered.scope,
      permissions: tampered.permissions,
      issued_at: tampered.issued_at,
      not_before: tampered.not_before,
      expires_at: tampered.expires_at,
      token_id: tampered.token_id
    });
    tampered.capability_hash = computeCapabilityHash(payloadBytes);

    expect(() =>
      verifyCapabilityToken(tampered as any, consent, { now: new Date('2025-08-01T00:00:00Z') })
    ).toThrow('Scope escalation');
  });

  it('verifies tokens whose actions are an attenuated subset of parent consent permissions', () => {
    const consent = buildBaseConsent({ permissions: ['read', 'store', 'share'] });
    const token = mintCapabilityToken(
      consent,
      baseScope,
      ['read', 'share'],
      tokenExpires,
      { now: tokenNow }
    );

    expect(() => verifyCapabilityToken(token, consent, { now: new Date('2025-08-01T00:00:00Z') })).not.toThrow();
  });

  it('rejects verification when token has permissions outside consent permissions', () => {
    const consent = buildBaseConsent({ permissions: ['read'] });
    const validToken = mintCapabilityToken(
      consent, baseScope, ['read'], tokenExpires, { now: tokenNow }
    );
    // Tamper with permissions
    const tampered = {
      ...validToken,
      permissions: ['read', 'store']
    };
    const payloadBytes = canonicalizeCapabilityPayload({
      version: tampered.version,
      subject: tampered.subject,
      grantee: tampered.grantee,
      consent_ref: tampered.consent_ref,
      scope: tampered.scope,
      permissions: tampered.permissions,
      issued_at: tampered.issued_at,
      not_before: tampered.not_before,
      expires_at: tampered.expires_at,
      token_id: tampered.token_id
    });
    tampered.capability_hash = computeCapabilityHash(payloadBytes);

    expect(() =>
      verifyCapabilityToken(tampered as any, consent, { now: new Date('2025-08-01T00:00:00Z') })
    ).toThrow('Permission escalation');
  });
});

describe('capability token — replay rejection via nonce reuse', () => {
  it('rejects a token presented a second time (same token_id)', () => {
    const consent = buildBaseConsent();
    const token = mintCapabilityToken(
      consent, baseScope, basePermissions, tokenExpires, { now: tokenNow }
    );

    // First presentation succeeds
    expect(() =>
      verifyCapabilityToken(token, consent, { now: new Date('2025-08-01T00:00:00Z') })
    ).not.toThrow();

    // Second presentation fails (replay)
    expect(() =>
      verifyCapabilityToken(token, consent, { now: new Date('2025-08-01T00:00:01Z') })
    ).toThrow('Capability token_id has already been presented (replay detected).');
  });

  it('allows different tokens to be verified independently', () => {
    const consent = buildBaseConsent();
    const token1 = mintCapabilityToken(
      consent, baseScope, basePermissions, tokenExpires, { now: tokenNow }
    );
    const token2 = mintCapabilityToken(
      consent, baseScope, basePermissions, tokenExpires, { now: tokenNow }
    );

    expect(() =>
      verifyCapabilityToken(token1, consent, { now: new Date('2025-08-01T00:00:00Z') })
    ).not.toThrow();

    expect(() =>
      verifyCapabilityToken(token2, consent, { now: new Date('2025-08-01T00:00:00Z') })
    ).not.toThrow();
  });
});

describe('capability token — revoked token rejection', () => {
  it('rejects a revoked token', () => {
    const consent = buildBaseConsent();
    const token = mintCapabilityToken(
      consent, baseScope, basePermissions, tokenExpires, { now: tokenNow }
    );

    revokeCapabilityToken(token.capability_hash, revocationRegistry);
    expect(isRevoked(token.capability_hash, revocationRegistry)).toBe(true);

    expect(() =>
      verifyCapabilityToken(token, consent, { now: new Date('2025-08-01T00:00:00Z') })
    ).toThrow('Capability token has been revoked.');
  });

  it('allows a non-revoked token to verify', () => {
    const consent = buildBaseConsent();
    const token = mintCapabilityToken(
      consent, baseScope, basePermissions, tokenExpires, { now: tokenNow }
    );

    expect(isRevoked(token.capability_hash, revocationRegistry)).toBe(false);

    expect(() =>
      verifyCapabilityToken(token, consent, { now: new Date('2025-08-01T00:00:00Z') })
    ).not.toThrow();
  });

  it('revocation of one token does not affect others', () => {
    const consent = buildBaseConsent();
    const token1 = mintCapabilityToken(
      consent, baseScope, basePermissions, tokenExpires, { now: tokenNow }
    );
    const token2 = mintCapabilityToken(
      consent, baseScope, basePermissions, tokenExpires, { now: tokenNow }
    );

    revokeCapabilityToken(token1.capability_hash, revocationRegistry);

    expect(isRevoked(token1.capability_hash, revocationRegistry)).toBe(true);
    expect(isRevoked(token2.capability_hash, revocationRegistry)).toBe(false);
  });

  it('rejects revocation with invalid hash format', () => {
    expect(() => revokeCapabilityToken('INVALID', revocationRegistry)).toThrow(
      'Revocation target capability_hash must be a valid 64-character lowercase hex hash.'
    );
  });
});

describe('capability token canonicalization', () => {
  it('produces canonical JSON with no whitespace', () => {
    const consent = buildBaseConsent();
    const token = mintCapabilityToken(
      consent, baseScope, basePermissions, tokenExpires, { now: tokenNow }
    );

    const bytes = canonicalizeCapabilityPayload({
      version: token.version,
      subject: token.subject,
      grantee: token.grantee,
      consent_ref: token.consent_ref,
      scope: token.scope,
      permissions: token.permissions,
      issued_at: token.issued_at,
      not_before: token.not_before,
      expires_at: token.expires_at,
      token_id: token.token_id
    });
    const json = Buffer.from(bytes).toString();

    expect(json).not.toContain(' ');
    expect(json).not.toContain('\n');
    expect(json).not.toContain('\t');
  });

  it('has top-level keys in alphabetical order', () => {
    const consent = buildBaseConsent();
    const token = mintCapabilityToken(
      consent, baseScope, basePermissions, tokenExpires, { now: tokenNow }
    );

    const bytes = canonicalizeCapabilityPayload({
      version: token.version,
      subject: token.subject,
      grantee: token.grantee,
      consent_ref: token.consent_ref,
      scope: token.scope,
      permissions: token.permissions,
      issued_at: token.issued_at,
      not_before: token.not_before,
      expires_at: token.expires_at,
      token_id: token.token_id
    });
    const json = Buffer.from(bytes).toString();

    const consentRefPos = json.indexOf('"consent_ref"');
    const expiresPos = json.indexOf('"expires_at"');
    const granteePos = json.indexOf('"grantee"');
    const issuedPos = json.indexOf('"issued_at"');
    const notBeforePos = json.indexOf('"not_before"');
    const permissionsPos = json.indexOf('"permissions"');
    const scopePos = json.indexOf('"scope"');
    const subjectPos = json.indexOf('"subject"');
    const tokenIdPos = json.indexOf('"token_id"');
    const versionPos = json.indexOf('"version"');

    expect(consentRefPos).toBeLessThan(expiresPos);
    expect(expiresPos).toBeLessThan(granteePos);
    expect(granteePos).toBeLessThan(issuedPos);
    expect(issuedPos).toBeLessThan(notBeforePos);
    expect(notBeforePos).toBeLessThan(permissionsPos);
    expect(permissionsPos).toBeLessThan(scopePos);
    expect(scopePos).toBeLessThan(subjectPos);
    expect(subjectPos).toBeLessThan(tokenIdPos);
    expect(tokenIdPos).toBeLessThan(versionPos);
  });

  it('excludes capability_hash from canonical payload', () => {
    const consent = buildBaseConsent();
    const token = mintCapabilityToken(
      consent, baseScope, basePermissions, tokenExpires, { now: tokenNow }
    );

    const bytes = canonicalizeCapabilityPayload({
      version: token.version,
      subject: token.subject,
      grantee: token.grantee,
      consent_ref: token.consent_ref,
      scope: token.scope,
      permissions: token.permissions,
      issued_at: token.issued_at,
      not_before: token.not_before,
      expires_at: token.expires_at,
      token_id: token.token_id
    });
    const json = Buffer.from(bytes).toString();

    expect(json).not.toContain('capability_hash');
  });

  it('includes null not_before in canonical payload', () => {
    const consent = buildBaseConsent();
    const token = mintCapabilityToken(
      consent, baseScope, basePermissions, tokenExpires, { now: tokenNow }
    );

    const bytes = canonicalizeCapabilityPayload({
      version: token.version,
      subject: token.subject,
      grantee: token.grantee,
      consent_ref: token.consent_ref,
      scope: token.scope,
      permissions: token.permissions,
      issued_at: token.issued_at,
      not_before: null,
      expires_at: token.expires_at,
      token_id: token.token_id
    });
    const json = Buffer.from(bytes).toString();

    expect(json).toContain('"not_before":null');
  });

  it('sorts scope entries by (type, ref)', () => {
    const scope: ScopeEntry[] = [
      { type: 'pack', ref: REF_C },
      { type: 'content', ref: REF_B },
      { type: 'content', ref: REF_A }
    ];

    const bytes = canonicalizeCapabilityPayload({
      version: '1.0',
      subject: SUBJECT,
      grantee: GRANTEE,
      consent_ref: 'a'.repeat(64),
      scope,
      permissions: ['read'],
      issued_at: '2025-06-15T10:00:00Z',
      not_before: null,
      expires_at: '2025-12-31T23:59:59Z',
      token_id: 'b'.repeat(64)
    });
    const json = Buffer.from(bytes).toString();

    // Order should be: content/REF_A, content/REF_B, pack/REF_C
    const contentAPos = json.indexOf(REF_A);
    const contentBPos = json.indexOf(REF_B);
    const packCPos = json.indexOf(REF_C);

    expect(contentAPos).toBeLessThan(contentBPos);
    expect(contentBPos).toBeLessThan(packCPos);
  });

  it('sorts permissions alphabetically', () => {
    const bytes = canonicalizeCapabilityPayload({
      version: '1.0',
      subject: SUBJECT,
      grantee: GRANTEE,
      consent_ref: 'a'.repeat(64),
      scope: baseScope,
      permissions: ['store', 'read', 'derive'],
      issued_at: '2025-06-15T10:00:00Z',
      not_before: null,
      expires_at: '2025-12-31T23:59:59Z',
      token_id: 'b'.repeat(64)
    });
    const json = Buffer.from(bytes).toString();

    const derivePos = json.indexOf('"derive"');
    const readPos = json.indexOf('"read"');
    const storePos = json.indexOf('"store"');

    expect(derivePos).toBeLessThan(readPos);
    expect(readPos).toBeLessThan(storePos);
  });

  it('produces deterministic output regardless of scope input order', () => {
    const scopeABC: ScopeEntry[] = [
      { type: 'content', ref: REF_A },
      { type: 'content', ref: REF_B },
      { type: 'pack', ref: REF_C }
    ];
    const scopeCBA: ScopeEntry[] = [
      { type: 'pack', ref: REF_C },
      { type: 'content', ref: REF_B },
      { type: 'content', ref: REF_A }
    ];

    const base = {
      version: '1.0',
      subject: SUBJECT,
      grantee: GRANTEE,
      consent_ref: 'a'.repeat(64),
      permissions: ['read'],
      issued_at: '2025-06-15T10:00:00Z',
      not_before: null as string | null,
      expires_at: '2025-12-31T23:59:59Z',
      token_id: 'b'.repeat(64)
    };

    const bytes1 = canonicalizeCapabilityPayload({ ...base, scope: scopeABC });
    const bytes2 = canonicalizeCapabilityPayload({ ...base, scope: scopeCBA });

    expect(Buffer.from(bytes1).toString()).toBe(Buffer.from(bytes2).toString());
  });

  it('produces deterministic output regardless of permission input order', () => {
    const base = {
      version: '1.0',
      subject: SUBJECT,
      grantee: GRANTEE,
      consent_ref: 'a'.repeat(64),
      scope: baseScope,
      issued_at: '2025-06-15T10:00:00Z',
      not_before: null as string | null,
      expires_at: '2025-12-31T23:59:59Z',
      token_id: 'b'.repeat(64)
    };

    const bytes1 = canonicalizeCapabilityPayload({ ...base, permissions: ['read', 'store'] });
    const bytes2 = canonicalizeCapabilityPayload({ ...base, permissions: ['store', 'read'] });

    expect(Buffer.from(bytes1).toString()).toBe(Buffer.from(bytes2).toString());
  });
});

describe('capability id', () => {
  it('builds a valid capability id', () => {
    const consent = buildBaseConsent();
    const token = mintCapabilityToken(
      consent, baseScope, basePermissions, tokenExpires, { now: tokenNow }
    );

    const capId = buildCapabilityId(token);
    expect(capId).toMatch(/^aoc:\/\/capability\/v1\/0\/0x[0-9a-f]{64}$/);
  });

  it('includes the capability_hash in the URI', () => {
    const consent = buildBaseConsent();
    const token = mintCapabilityToken(
      consent, baseScope, basePermissions, tokenExpires, { now: tokenNow }
    );

    const capId = buildCapabilityId(token);
    expect(capId).toContain(token.capability_hash);
  });

  it('rejects invalid capability hash', () => {
    const consent = buildBaseConsent();
    const token = mintCapabilityToken(
      consent, baseScope, basePermissions, tokenExpires, { now: tokenNow }
    );
    token.capability_hash = 'INVALID';

    expect(() => buildCapabilityId(token)).toThrow(
      'Capability hash must be 64 lowercase hex characters.'
    );
  });
});

describe('cross-object consistency', () => {
  it('capability hash is consistent with canonical encoding', () => {
    const consent = buildBaseConsent();
    const token = mintCapabilityToken(
      consent, baseScope, basePermissions, tokenExpires, { now: tokenNow }
    );

    const { sha256Hex } = require('../../storage/hash');
    const payloadBytes = canonicalizeCapabilityPayload({
      version: token.version,
      subject: token.subject,
      grantee: token.grantee,
      consent_ref: token.consent_ref,
      scope: token.scope,
      permissions: token.permissions,
      issued_at: token.issued_at,
      not_before: token.not_before,
      expires_at: token.expires_at,
      token_id: token.token_id
    });
    const expectedHash = sha256Hex(payloadBytes);

    expect(token.capability_hash).toBe(expectedHash);
  });

  it('different token_ids produce different capability hashes', () => {
    const consent = buildBaseConsent();
    const token1 = mintCapabilityToken(
      consent, baseScope, basePermissions, tokenExpires, { now: tokenNow }
    );
    const token2 = mintCapabilityToken(
      consent, baseScope, basePermissions, tokenExpires, { now: tokenNow }
    );

    expect(token1.token_id).not.toBe(token2.token_id);
    expect(token1.capability_hash).not.toBe(token2.capability_hash);
  });

  it('tokens from different consents produce different capability hashes', () => {
    const consent1 = buildBaseConsent();
    const consent2 = buildConsentObject(
      SUBJECT, GRANTEE, 'grant', multiScope, multiPermissions,
      { now: new Date('2025-02-01T00:00:00Z'), expires_at: consentExpires }
    );

    const token1 = mintCapabilityToken(
      consent1, baseScope, basePermissions, tokenExpires, { now: tokenNow }
    );
    const token2 = mintCapabilityToken(
      consent2, baseScope, basePermissions, tokenExpires, { now: tokenNow }
    );

    expect(token1.consent_ref).not.toBe(token2.consent_ref);
    expect(token1.capability_hash).not.toBe(token2.capability_hash);
  });
});
