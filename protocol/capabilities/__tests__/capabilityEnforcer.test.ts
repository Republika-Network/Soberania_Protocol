import { buildConsentObject as buildUnsignedConsentObject } from '../../../consent';
import { mintCapabilityToken } from '../../../capability';
import { capabilityAccessReasonCodes } from '../../../enforcement';
import { enforceCapability as enforceCapabilityRaw } from '../capabilityEnforcer';
import { MarketMakerRegistry } from '../../../shared/marketMakerRegistry';
import { InMemoryRateLimitRegistry } from '../consumeCapabilityAccess';
import { testSubjectSigner, signTestConsent } from '../../../tests/helpers/consentSigning';
import { InMemoryRevocationRegistry } from '../../../capability/registries/InMemoryRevocationRegistry';

// Every authorization path reads revocation from an injected registry; these
// tests share one and pass it unless a test supplies its own.
const revocationRegistry = new InMemoryRevocationRegistry();
const enforceCapability: typeof enforceCapabilityRaw = (input) =>
  enforceCapabilityRaw({ ...input, registries: { revocationRegistry, ...input.registries } });


// Consents in these tests are signed by their subject; unsigned consents authorize nothing.
const buildConsentObject: typeof buildUnsignedConsentObject = (...args) =>
  signTestConsent(buildUnsignedConsentObject(...args));

const SUBJECT = testSubjectSigner('subject').did;
const GRANTEE = testSubjectSigner('grantee').did;
const CONTENT_REF = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CONSENT_EXPIRES = '2025-06-15T10:05:00Z';
const NOW = new Date('2025-06-15T10:00:00Z');

function buildConsent(marketMakerId?: string) {
  return buildConsentObject(
    SUBJECT,
    GRANTEE,
    'grant',
    [{ type: 'content', ref: CONTENT_REF }],
    ['read'],
    {
      now: new Date('2025-06-15T10:00:00Z'),
      expires_at: CONSENT_EXPIRES,
      ...(marketMakerId !== undefined ? { marketMakerId } : {})
    }
  );
}

function buildToken(overrides: Record<string, unknown> = {}) {
  const consent = buildConsent(
    typeof overrides.marketMakerId === 'string' ? overrides.marketMakerId : undefined
  );

  return {
    consent,
    token: {
      ...mintCapabilityToken(
        consent,
        [{ type: 'content', ref: CONTENT_REF }],
        ['read'],
        '2025-06-15T10:00:03Z',
        { now: new Date('2025-06-15T10:00:00Z') }
      ),
      ...overrides
    }
  };
}

describe('legacy capability bridge mapping', () => {
  it('maps consent mismatch pre-checks to CONSENT_MISMATCH', () => {
    const { token } = buildToken();
    const mismatchedConsent = buildConsentObject(
      SUBJECT,
      GRANTEE,
      'grant',
      [{ type: 'content', ref: CONTENT_REF }],
      ['read'],
      { now: new Date('2025-02-01T00:00:00Z'), expires_at: CONSENT_EXPIRES }
    );

    const decision = enforceCapability({
      token,
      consent: mismatchedConsent,
      required_scope: `content:${CONTENT_REF}`,
      now: new Date('2025-06-15T10:00:05Z')
    });

    expect(decision).toMatchObject({ code: 'CONSENT_MISMATCH' });
    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.CONSENT_MISMATCH);
  });

  it('maps consent-invalid bridge pre-checks to CONSENT_MISMATCH', () => {
    const { token, consent } = buildToken();

    const decision = enforceCapability({
      token,
      consent: {
        ...consent,
        action: 'revoke',
        scope: [],
        permissions: [],
        expires_at: null,
        revoke_target: { capability_hash: token.capability_hash }
      } as any,
      required_scope: `content:${CONTENT_REF}`,
      now: new Date('2025-06-15T10:00:05Z')
    });

    expect(decision.code).toBe('CONSENT_MISMATCH');
  });

  it('maps consent expiration to EXPIRED', () => {
    const consent = buildConsentObject(
      SUBJECT,
      GRANTEE,
      'grant',
      [{ type: 'content', ref: CONTENT_REF }],
      ['read'],
      { now: new Date('2025-06-15T10:00:01Z'), expires_at: '2025-06-15T10:00:04Z' }
    );
    const token = mintCapabilityToken(
      consent,
      [{ type: 'content', ref: CONTENT_REF }],
      ['read'],
      '2025-06-15T10:00:04Z',
      { now: new Date('2025-06-15T10:00:01Z') }
    );

    const decision = enforceCapability({
      token,
      consent,
      required_scope: `content:${CONTENT_REF}`,
      now: new Date('2025-06-15T10:00:05Z')
    });

    expect(decision.code).toBe('EXPIRED');
  });

  it('maps market-maker binding decisions to REQUEST_CONTEXT_MISMATCH', () => {
    const { token, consent } = buildToken({ marketMakerId: 'hrkey-v1' });

    const requiredDecision = enforceCapability({
      token,
      consent,
      required_scope: `content:${CONTENT_REF}`,
      now: NOW
    });
    expect(requiredDecision.code).toBe('REQUEST_CONTEXT_MISMATCH');

    const mismatchDecision = enforceCapability({
      token,
      consent,
      required_scope: `content:${CONTENT_REF}`,
      request_context: { marketMakerId: 'other-maker' },
      now: NOW
    });
    expect(mismatchDecision.code).toBe('REQUEST_CONTEXT_MISMATCH');
  });

  it('maps market-maker trust denies to REQUEST_CONTEXT_MISMATCH', () => {
    const deprecatedRegistry = new MarketMakerRegistry();
    deprecatedRegistry.register({
      id: 'hrkey-v1',
      name: 'HRKey',
      version: '1.0.0',
      capabilities: ['read'],
      status: 'deprecated',
      created_at: '2025-01-01T00:00:00Z'
    });
    const revokedRegistry = new MarketMakerRegistry();
    revokedRegistry.register({
      id: 'hrkey-v1',
      name: 'HRKey',
      version: '1.0.0',
      capabilities: ['read'],
      status: 'revoked',
      created_at: '2025-01-01T00:00:00Z'
    });

    const { token, consent } = buildToken({ marketMakerId: 'hrkey-v1' });

    const deprecatedDecision = enforceCapability({
      token,
      consent,
      required_scope: `content:${CONTENT_REF}`,
      request_context: { marketMakerId: 'hrkey-v1' },
      marketMakerRegistry: deprecatedRegistry,
      now: NOW
    });
    expect(deprecatedDecision.code).toBe('REQUEST_CONTEXT_MISMATCH');

    const revokedDecision = enforceCapability({
      token,
      consent,
      required_scope: `content:${CONTENT_REF}`,
      request_context: { marketMakerId: 'hrkey-v1' },
      marketMakerRegistry: revokedRegistry,
      now: NOW
    });
    expect(revokedDecision.code).toBe('REQUEST_CONTEXT_MISMATCH');
  });

  it('maps unknown market-makers to REQUEST_CONTEXT_MISMATCH when registry enforcement is enabled', () => {
    const registry = new MarketMakerRegistry();
    const { token, consent } = buildToken({ marketMakerId: 'hrkey-v1' });

    const decision = enforceCapability({
      token,
      consent,
      required_scope: `content:${CONTENT_REF}`,
      request_context: { marketMakerId: 'hrkey-v1' },
      marketMakerRegistry: registry,
      now: NOW
    });

    expect(decision.code).toBe('REQUEST_CONTEXT_MISMATCH');
    expect(decision.reason).toContain('not registered');
  });

  it('maps usage and policy denies to RESOURCE_RESTRICTION_FAILED', () => {
    const { token, consent } = buildToken();

    const usageDecision = enforceCapability({
      token,
      consent,
      required_scope: `content:${CONTENT_REF}`,
      now: NOW,
      hooks: {
        usage: () => ({
          allowed: false,
          reasonCode: capabilityAccessReasonCodes.USAGE_DENIED,
          reason: 'Usage quota exceeded.'
        })
      }
    });
    expect(usageDecision.code).toBe('RESOURCE_RESTRICTION_FAILED');

    const policyDecision = enforceCapability({
      token,
      consent,
      required_scope: `content:${CONTENT_REF}`,
      now: NOW,
      hooks: {
        policy: () => ({
          allowed: false,
          reasonCode: capabilityAccessReasonCodes.POLICY_DENIED,
          reason: 'Policy denied the request.'
        })
      }
    });
    expect(policyDecision.code).toBe('RESOURCE_RESTRICTION_FAILED');
  });

  it('maps RATE_LIMITED consumption denies to RESOURCE_RESTRICTION_FAILED', () => {
    const { token, consent } = buildToken();
    const rateLimitRegistry = new InMemoryRateLimitRegistry();

    const firstDecision = enforceCapability({
      token,
      consent,
      required_scope: `content:${CONTENT_REF}`,
      now: NOW,
      consume: false,
      rateLimit: {
        registry: rateLimitRegistry,
        maxAttempts: 1,
        windowMs: 60_000
      }
    });
    expect(firstDecision.code).toBe('OK');

    const secondDecision = enforceCapability({
      token: buildToken().token,
      consent,
      required_scope: `content:${CONTENT_REF}`,
      now: new Date('2025-06-15T10:00:01Z'),
      consume: false,
      rateLimit: {
        registry: rateLimitRegistry,
        maxAttempts: 1,
        windowMs: 60_000
      }
    });
    expect(secondDecision.code).toBe('RESOURCE_RESTRICTION_FAILED');
    expect(secondDecision.reason).toContain('Rate limit exceeded');
  });

  it('denies non-read actions when the legacy bridge is misused outside its read-only contract', () => {
    const { token, consent } = buildToken();

    const decision = enforceCapability({
      token,
      consent,
      required_scope: `content:${CONTENT_REF}`,
      action: 'share' as any,
      now: NOW
    });

    expect(decision.code).toBe('INVALID_CAPABILITY');
    expect(decision.reason).toContain('Capability does not allow action "share".');
    expect(decision.metadata?.legacyBridgeAction).toBe('share');
  });

  it('defaults the bridge to read access and supports explicit read access', () => {
    const { token, consent } = buildToken();

    const implicitDecision = enforceCapability({
      token,
      consent,
      required_scope: `content:${CONTENT_REF}`,
      now: NOW
    });
    expect(implicitDecision.code).toBe('OK');
    expect(implicitDecision.metadata?.legacyBridgeAction).toBe('read');

    const explicitDecision = enforceCapability({
      token,
      consent,
      required_scope: `content:${CONTENT_REF}`,
      action: 'read',
      now: NOW
    });
    expect(explicitDecision.code).toBe('OK');
    expect(explicitDecision.metadata?.legacyBridgeAction).toBe('read');
  });
});
