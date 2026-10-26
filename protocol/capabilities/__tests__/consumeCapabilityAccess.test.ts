import { buildConsentObject as buildUnsignedConsentObject } from '../../../consent';
import {
  canonicalizeCapabilityPayload,
  computeCapabilityHash,
  mintCapabilityToken
} from '../../../capability';
import { InMemoryNonceRegistry } from '../../../capability/registries/InMemoryNonceRegistry';
import { InMemoryRevocationRegistry } from '../../../capability/registries/InMemoryRevocationRegistry';
import { MarketMakerRegistry } from '../../../shared/marketMakerRegistry';
import { capabilityAccessReasonCodes } from '../../../enforcement';
import {
  capabilityConsumptionReasonCodes,
  consumeCapabilityAccess as consumeCapabilityAccessRaw,
  InMemoryConsentUsageRegistry,
  InMemoryRateLimitRegistry,
  type ConsentUsageRegistry
} from '../consumeCapabilityAccess';
import { enforceCapability as enforceCapabilityRaw } from '../capabilityEnforcer';
import { testSubjectSigner, signTestConsent } from '../../../tests/helpers/consentSigning';

// Every authorization path reads revocation from an injected registry; these
// tests share one and pass it unless a test supplies its own.
const revocationRegistry = new InMemoryRevocationRegistry();
const consumeCapabilityAccess: typeof consumeCapabilityAccessRaw = (input) =>
  consumeCapabilityAccessRaw({ ...input, registries: { revocationRegistry, ...input.registries } });
const enforceCapability: typeof enforceCapabilityRaw = (input) =>
  enforceCapabilityRaw({ ...input, registries: { revocationRegistry, ...input.registries } });


// Consents in these tests are signed by their subject; unsigned consents authorize nothing.
const buildConsentObject: typeof buildUnsignedConsentObject = (...args) =>
  signTestConsent(buildUnsignedConsentObject(...args));

const SUBJECT = testSubjectSigner('subject').did;
const GRANTEE = testSubjectSigner('grantee').did;
const CONTENT_REF = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PACK_REF = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const NOW = new Date('2025-06-15T10:00:00Z');
const CONSENT_EXPIRES = '2025-06-15T10:05:00Z';

function buildConsent(
  marketMakerId?: string,
  expiresAt: string = CONSENT_EXPIRES,
  now: Date = NOW,
  pricing?: { model: 'per_use'; amount: number; currency: string }
) {
  return buildConsentObject(
    SUBJECT,
    GRANTEE,
    'grant',
    [
      { type: 'content', ref: CONTENT_REF },
      { type: 'pack', ref: PACK_REF }
    ],
    ['read'],
    {
      now,
      expires_at: expiresAt,
      ...(marketMakerId !== undefined ? { marketMakerId } : {}),
      ...(pricing !== undefined ? { pricing } : {})
    }
  );
}


class ThrowingConsentUsageRegistry implements ConsentUsageRegistry {
  get(): undefined {
    return undefined;
  }

  record(): never {
    throw new Error('usage metering unavailable');
  }
}

function buildToken(overrides: Record<string, unknown> = {}) {
  const consent = buildConsent(
    typeof overrides.marketMakerId === 'string' ? overrides.marketMakerId : undefined,
    CONSENT_EXPIRES,
    NOW,
    overrides.pricing as { model: 'per_use'; amount: number; currency: string } | undefined
  );

  return {
    consent,
    token: {
      ...mintCapabilityToken(
        consent,
        [
          { type: 'content', ref: CONTENT_REF },
          { type: 'pack', ref: PACK_REF }
        ],
        ['read'],
        '2025-06-15T10:05:00Z',
        { now: new Date('2025-06-15T10:00:00Z') }
      ),
      ...overrides
    }
  };
}

describe('consumeCapabilityAccess', () => {
  it('allows valid capability consumption and marks replay state by default', () => {
    const nonceRegistry = new InMemoryNonceRegistry();
    const { token, consent } = buildToken();

    const decision = consumeCapabilityAccess({
      capability: token,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: NOW,
      registries: { nonceRegistry, revocationRegistry: new InMemoryRevocationRegistry() }
    });

    expect(decision.allowed).toBe(true);
    expect(decision.decision).toBe('allow');
    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.ACCESS_ALLOWED);
    expect(decision.reason).toBe(
      'Capability consumption is authorized and all runtime enforcement checks passed.'
    );
    expect(decision.replayChecked).toBe(true);
    expect(decision.revocationChecked).toBe(true);
    expect(decision.consumed).toBe(true);
    expect(nonceRegistry.hasSeen(token.token_id, NOW)).toBe(true);
  });

  it('denies revoked capabilities at consumption time', () => {
    const revocationRegistry = new InMemoryRevocationRegistry();
    const { token, consent } = buildToken();
    revocationRegistry.revoke(token.capability_hash);

    const decision = consumeCapabilityAccess({
      capability: token,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: NOW,
      registries: { revocationRegistry, nonceRegistry: new InMemoryNonceRegistry() }
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe(capabilityConsumptionReasonCodes.CAPABILITY_REVOKED);
    expect(decision.checks.revocation).toBe('fail');
    expect(decision.consumed).toBe(false);
  });

  it('denies replayed capabilities when a nonce registry is supplied', () => {
    const nonceRegistry = new InMemoryNonceRegistry();
    const { token, consent } = buildToken();
    nonceRegistry.markSeen(token.token_id, token.expires_at);

    const decision = consumeCapabilityAccess({
      capability: token,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: NOW,
      registries: { nonceRegistry, revocationRegistry: new InMemoryRevocationRegistry() }
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe(capabilityConsumptionReasonCodes.CAPABILITY_REPLAYED);
    expect(decision.checks.replay).toBe('fail');
    expect(decision.consumed).toBe(false);
  });

  it('fails closed when replay protection is required but no nonce registry is supplied', () => {
    const { token, consent } = buildToken();

    const decision = consumeCapabilityAccess({
      capability: token,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: NOW,
      requireReplayProtection: true,
      registries: { revocationRegistry: new InMemoryRevocationRegistry() }
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe(capabilityConsumptionReasonCodes.REPLAY_PROTECTION_REQUIRED);
    expect(decision.replayChecked).toBe(false);
    expect(decision.consumed).toBe(false);
  });

  it('records first-time successful usage per consent and returns usage state', () => {
    const usageRegistry = new InMemoryConsentUsageRegistry();
    const { token, consent } = buildToken();

    const decision = consumeCapabilityAccess({
      capability: token,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: NOW,
      registries: {
        nonceRegistry: new InMemoryNonceRegistry(),
        revocationRegistry: new InMemoryRevocationRegistry(),
        consentUsageRegistry: usageRegistry
      }
    });

    expect(decision.allowed).toBe(true);
    expect(decision.usage).toEqual({
      usageCount: 1,
      lastAccessedAt: '2025-06-15T10:00:00Z',
      lastAccessResult: 'allow'
    });
    expect(usageRegistry.get(token.consent_ref)).toEqual({
      consentRef: token.consent_ref,
      usageCount: 1,
      lastAccessedAt: '2025-06-15T10:00:00Z',
      lastAccessResult: 'allow'
    });
  });

  it('keeps unpriced capability consumption behavior unchanged', () => {
    const usageRegistry = new InMemoryConsentUsageRegistry();
    const { token, consent } = buildToken();

    const decision = consumeCapabilityAccess({
      capability: token,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: NOW,
      consume: false,
      registries: {
        revocationRegistry: new InMemoryRevocationRegistry(),
        consentUsageRegistry: usageRegistry
      }
    });

    expect(decision.allowed).toBe(true);
    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.ACCESS_ALLOWED);
    expect(decision.payment).toBeUndefined();
    expect(decision.usage?.usageCount).toBe(1);
  });

  it('allows consumption under the configured fixed-window rate limit', () => {
    const rateLimitRegistry = new InMemoryRateLimitRegistry();
    const first = buildToken();
    const second = buildToken();

    const firstDecision = consumeCapabilityAccess({
      capability: first.token,
      consent: first.consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: NOW,
      consume: false,
      rateLimit: {
        registry: rateLimitRegistry,
        maxAttempts: 2,
        windowMs: 60_000
      },
      registries: { revocationRegistry: new InMemoryRevocationRegistry() }
    });

    const secondDecision = consumeCapabilityAccess({
      capability: second.token,
      consent: second.consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: new Date('2025-06-15T10:00:10Z'),
      consume: false,
      rateLimit: {
        registry: rateLimitRegistry,
        maxAttempts: 2,
        windowMs: 60_000
      },
      registries: { revocationRegistry: new InMemoryRevocationRegistry() }
    });

    expect(firstDecision.allowed).toBe(true);
    expect(secondDecision.allowed).toBe(true);
    expect(rateLimitRegistry.get(first.token.consent_ref)?.count).toBe(2);
  });

  it('denies with RATE_LIMITED once configured attempts are exceeded', () => {
    const usageRegistry = new InMemoryConsentUsageRegistry();
    const nonceRegistry = new InMemoryNonceRegistry();
    const rateLimitRegistry = new InMemoryRateLimitRegistry();
    const first = buildToken();
    const second = buildToken();

    consumeCapabilityAccess({
      capability: first.token,
      consent: first.consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: NOW,
      rateLimit: {
        registry: rateLimitRegistry,
        maxAttempts: 1,
        windowMs: 60_000
      },
      registries: {
        nonceRegistry,
        revocationRegistry: new InMemoryRevocationRegistry(),
        consentUsageRegistry: usageRegistry
      }
    });

    const limitedDecision = consumeCapabilityAccess({
      capability: second.token,
      consent: second.consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: new Date('2025-06-15T10:00:10Z'),
      rateLimit: {
        registry: rateLimitRegistry,
        maxAttempts: 1,
        windowMs: 60_000
      },
      registries: {
        nonceRegistry,
        revocationRegistry: new InMemoryRevocationRegistry(),
        consentUsageRegistry: usageRegistry
      }
    });

    expect(limitedDecision.allowed).toBe(false);
    expect(limitedDecision.reasonCode).toBe(capabilityConsumptionReasonCodes.RATE_LIMITED);
    expect(limitedDecision.metadata.failureStage).toBe('rate_limit');
    expect(limitedDecision.metadata.rateLimitKey).toBe(first.token.consent_ref);
    expect(limitedDecision.usage).toBeUndefined();
    expect(usageRegistry.get(first.token.consent_ref)?.usageCount).toBe(1);
    expect(nonceRegistry.hasSeen(second.token.token_id, NOW)).toBe(false);
  });

  it('resets fixed-window rate limits after windowMs passes', () => {
    const rateLimitRegistry = new InMemoryRateLimitRegistry();
    const first = buildToken();
    const second = buildToken();

    const firstDecision = consumeCapabilityAccess({
      capability: first.token,
      consent: first.consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: NOW,
      consume: false,
      rateLimit: {
        registry: rateLimitRegistry,
        maxAttempts: 1,
        windowMs: 30_000
      },
      registries: { revocationRegistry: new InMemoryRevocationRegistry() }
    });

    const secondDecision = consumeCapabilityAccess({
      capability: second.token,
      consent: second.consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: new Date('2025-06-15T10:00:31Z'),
      consume: false,
      rateLimit: {
        registry: rateLimitRegistry,
        maxAttempts: 1,
        windowMs: 30_000
      },
      registries: { revocationRegistry: new InMemoryRevocationRegistry() }
    });

    expect(firstDecision.allowed).toBe(true);
    expect(secondDecision.allowed).toBe(true);
    expect(rateLimitRegistry.get(first.token.consent_ref)?.count).toBe(1);
  });

  it('denies priced capability consumption when payment has not been satisfied', () => {
    const usageRegistry = new InMemoryConsentUsageRegistry();
    const { token, consent } = buildToken({
      pricing: { model: 'per_use', amount: 25, currency: 'USD' }
    });

    const decision = consumeCapabilityAccess({
      capability: token,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: NOW,
      consume: false,
      registries: {
        revocationRegistry: new InMemoryRevocationRegistry(),
        consentUsageRegistry: usageRegistry
      }
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.PAYMENT_REQUIRED);
    expect(decision.payment).toEqual({ required: true, amount: 25, currency: 'USD' });
    expect(decision.usage).toBeUndefined();
    expect(usageRegistry.get(token.consent_ref)).toBeUndefined();
  });

  it('allows priced capability consumption when paymentContext.paid is true', () => {
    const usageRegistry = new InMemoryConsentUsageRegistry();
    const { token, consent } = buildToken({
      pricing: { model: 'per_use', amount: 25, currency: 'USD' }
    });

    const decision = consumeCapabilityAccess({
      capability: token,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: NOW,
      consume: false,
      paymentContext: { paid: true },
      registries: {
        revocationRegistry: new InMemoryRevocationRegistry(),
        consentUsageRegistry: usageRegistry
      }
    });

    expect(decision.allowed).toBe(true);
    expect(decision.payment).toEqual({ required: false, amount: 25, currency: 'USD' });
    expect(decision.usage?.usageCount).toBe(1);
    expect(decision.usage?.lastAccessResult).toBe('allow');
  });

  it('accumulates usage across multiple paid accesses', () => {
    const usageRegistry = new InMemoryConsentUsageRegistry();
    const first = buildToken({ pricing: { model: 'per_use', amount: 25, currency: 'USD' } });
    const second = buildToken({ pricing: { model: 'per_use', amount: 25, currency: 'USD' } });

    const firstDecision = consumeCapabilityAccess({
      capability: first.token,
      consent: first.consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: NOW,
      consume: false,
      paymentContext: { paid: true },
      registries: {
        revocationRegistry: new InMemoryRevocationRegistry(),
        consentUsageRegistry: usageRegistry
      }
    });

    const secondDecision = consumeCapabilityAccess({
      capability: second.token,
      consent: second.consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: new Date('2025-06-15T10:00:30Z'),
      consume: false,
      paymentContext: { paid: true },
      registries: {
        revocationRegistry: new InMemoryRevocationRegistry(),
        consentUsageRegistry: usageRegistry
      }
    });

    expect(firstDecision.usage?.usageCount).toBe(1);
    expect(secondDecision.usage).toEqual({
      usageCount: 2,
      lastAccessedAt: '2025-06-15T10:00:30Z',
      lastAccessResult: 'allow'
    });
    expect(secondDecision.payment).toEqual({ required: false, amount: 25, currency: 'USD' });
  });

  it('does not record denied usage attempts', () => {
    const usageRegistry = new InMemoryConsentUsageRegistry();
    const { token, consent } = buildToken();

    const decision = consumeCapabilityAccess({
      capability: token,
      consent,
      action: 'share',
      resource: { type: 'content', ref: CONTENT_REF },
      now: NOW,
      registries: {
        nonceRegistry: new InMemoryNonceRegistry(),
        revocationRegistry: new InMemoryRevocationRegistry(),
        consentUsageRegistry: usageRegistry
      }
    });

    expect(decision.allowed).toBe(false);
    expect(decision.usage).toBeUndefined();
    expect(usageRegistry.get(token.consent_ref)).toBeUndefined();
  });

  it('accumulates usageCount across multiple allowed calls for the same consent', () => {
    const usageRegistry = new InMemoryConsentUsageRegistry();
    const first = buildToken();
    const second = buildToken();

    const firstDecision = consumeCapabilityAccess({
      capability: first.token,
      consent: first.consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: NOW,
      consume: false,
      registries: {
        revocationRegistry: new InMemoryRevocationRegistry(),
        consentUsageRegistry: usageRegistry
      }
    });

    const secondDecision = consumeCapabilityAccess({
      capability: second.token,
      consent: second.consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: new Date('2025-06-15T10:00:30Z'),
      consume: false,
      registries: {
        revocationRegistry: new InMemoryRevocationRegistry(),
        consentUsageRegistry: usageRegistry
      }
    });

    expect(firstDecision.usage?.usageCount).toBe(1);
    expect(secondDecision.usage).toEqual({
      usageCount: 2,
      lastAccessedAt: '2025-06-15T10:00:30Z',
      lastAccessResult: 'allow'
    });
    expect(usageRegistry.get(first.token.consent_ref)?.usageCount).toBe(2);
  });

  it('treats consume=false as a non-marking presentation even when allowed', () => {
    const nonceRegistry = new InMemoryNonceRegistry();
    const { token, consent } = buildToken();

    const decision = consumeCapabilityAccess({
      capability: token,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: NOW,
      consume: false,
      registries: { nonceRegistry, revocationRegistry: new InMemoryRevocationRegistry() }
    });

    expect(decision.allowed).toBe(true);
    expect(decision.consumed).toBe(false);
    expect(nonceRegistry.hasSeen(token.token_id, NOW)).toBe(false);
  });

  it('records usage even when consume=false', () => {
    const usageRegistry = new InMemoryConsentUsageRegistry();
    const nonceRegistry = new InMemoryNonceRegistry();
    const { token, consent } = buildToken();

    const decision = consumeCapabilityAccess({
      capability: token,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: NOW,
      consume: false,
      registries: {
        nonceRegistry,
        revocationRegistry: new InMemoryRevocationRegistry(),
        consentUsageRegistry: usageRegistry
      }
    });

    expect(decision.allowed).toBe(true);
    expect(decision.consumed).toBe(false);
    expect(decision.usage).toEqual({
      usageCount: 1,
      lastAccessedAt: '2025-06-15T10:00:00Z',
      lastAccessResult: 'allow'
    });
    expect(nonceRegistry.hasSeen(token.token_id, NOW)).toBe(false);
  });

  it('ignores usage metering failures and preserves the original decision', () => {
    const { token, consent } = buildToken();

    const decision = consumeCapabilityAccess({
      capability: token,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: NOW,
      registries: {
        nonceRegistry: new InMemoryNonceRegistry(),
        revocationRegistry: new InMemoryRevocationRegistry(),
        consentUsageRegistry: new ThrowingConsentUsageRegistry()
      }
    });

    expect(decision.allowed).toBe(true);
    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.ACCESS_ALLOWED);
    expect(decision.usage).toBeUndefined();
  });

  it('keeps the decision shape backward-compatible when no usage registry is provided', () => {
    const { token, consent } = buildToken();

    const decision = consumeCapabilityAccess({
      capability: token,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: NOW,
      registries: {
        nonceRegistry: new InMemoryNonceRegistry(),
        revocationRegistry: new InMemoryRevocationRegistry()
      }
    });

    expect(decision.allowed).toBe(true);
    expect('usage' in decision).toBe(false);
  });

  it('does not mark replay state on deny', () => {
    const nonceRegistry = new InMemoryNonceRegistry();
    const { token, consent } = buildToken();

    const decision = consumeCapabilityAccess({
      capability: token,
      consent,
      action: 'share',
      resource: { type: 'content', ref: CONTENT_REF },
      now: NOW,
      registries: { nonceRegistry, revocationRegistry: new InMemoryRevocationRegistry() }
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.ACTION_NOT_ALLOWED);
    expect(decision.consumed).toBe(false);
    expect(nonceRegistry.hasSeen(token.token_id, NOW)).toBe(false);
  });

  it('keeps evaluation deny precedence over rate limiting', () => {
    const rateLimitRegistry = new InMemoryRateLimitRegistry();
    const { token, consent } = buildToken();

    const decision = consumeCapabilityAccess({
      capability: token,
      consent,
      action: 'share',
      resource: { type: 'content', ref: CONTENT_REF },
      now: NOW,
      rateLimit: {
        registry: rateLimitRegistry,
        maxAttempts: 1,
        windowMs: 60_000
      },
      registries: { revocationRegistry: new InMemoryRevocationRegistry() }
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.ACTION_NOT_ALLOWED);
    expect(rateLimitRegistry.get(token.consent_ref)).toBeUndefined();
  });

  it('keeps trust deny precedence over rate limiting', () => {
    const rateLimitRegistry = new InMemoryRateLimitRegistry();
    const marketMakerRegistry = new MarketMakerRegistry();
    marketMakerRegistry.register({
      id: 'hrkey-v1',
      name: 'HRKey',
      version: '1.0.0',
      capabilities: ['read'],
      status: 'revoked',
      created_at: '2025-01-01T00:00:00Z'
    });
    const { token, consent } = buildToken({ marketMakerId: 'hrkey-v1' });

    const decision = consumeCapabilityAccess({
      capability: token,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      marketMakerId: 'hrkey-v1',
      marketMakerRegistry,
      now: NOW,
      rateLimit: {
        registry: rateLimitRegistry,
        maxAttempts: 1,
        windowMs: 60_000
      },
      registries: { revocationRegistry: new InMemoryRevocationRegistry() }
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.MARKET_MAKER_REVOKED);
    expect(rateLimitRegistry.get(token.consent_ref)).toBeUndefined();
  });

  it('keeps replay deny precedence over pricing', () => {
    const nonceRegistry = new InMemoryNonceRegistry();
    const { token, consent } = buildToken({
      pricing: { model: 'per_use', amount: 25, currency: 'USD' }
    });
    nonceRegistry.markSeen(token.token_id, token.expires_at);

    const decision = consumeCapabilityAccess({
      capability: token,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: NOW,
      registries: {
        nonceRegistry,
        revocationRegistry: new InMemoryRevocationRegistry()
      }
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe(capabilityConsumptionReasonCodes.CAPABILITY_REPLAYED);
    expect(decision.payment).toBeUndefined();
  });

  it('denies malformed resources and invalid inputs deterministically', () => {
    const { token, consent } = buildToken();

    const decision = consumeCapabilityAccess({
      capability: token,
      consent,
      action: 'read',
      resource: 'bad-resource-format' as any,
      now: NOW,
      registries: {
        nonceRegistry: new InMemoryNonceRegistry(),
        revocationRegistry: new InMemoryRevocationRegistry()
      }
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.CAPABILITY_INVALID);
  });

  it('denies valid but unauthorized resources', () => {
    const { token, consent } = buildToken();

    const decision = consumeCapabilityAccess({
      capability: token,
      consent,
      action: 'read',
      resource: { type: 'field', ref: CONTENT_REF },
      now: NOW,
      registries: {
        nonceRegistry: new InMemoryNonceRegistry(),
        revocationRegistry: new InMemoryRevocationRegistry()
      }
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.RESOURCE_NOT_ALLOWED);
  });

  it('denies market-maker mismatch and unknown market makers when registry enforcement is enabled', () => {
    const registry = new MarketMakerRegistry();
    registry.register({
      id: 'hrkey-v1',
      name: 'HRKey',
      version: '1.0.0',
      capabilities: ['read'],
      status: 'active',
      created_at: '2025-01-01T00:00:00Z'
    });
    const { token, consent } = buildToken({ marketMakerId: 'hrkey-v1' });

    const mismatchDecision = consumeCapabilityAccess({
      capability: token,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      marketMakerId: 'other-maker',
      marketMakerRegistry: registry,
      now: NOW,
      registries: {
        nonceRegistry: new InMemoryNonceRegistry(),
        revocationRegistry: new InMemoryRevocationRegistry()
      }
    });
    expect(mismatchDecision.allowed).toBe(false);
    expect(mismatchDecision.reasonCode).toBe(capabilityAccessReasonCodes.MARKET_MAKER_MISMATCH);

    const { token: unknownToken, consent: unknownConsent } = buildToken({ marketMakerId: 'missing-maker' });
    const unknownDecision = consumeCapabilityAccess({
      capability: unknownToken,
      consent: unknownConsent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      marketMakerId: 'missing-maker',
      marketMakerRegistry: registry,
      now: NOW,
      registries: {
        nonceRegistry: new InMemoryNonceRegistry(),
        revocationRegistry: new InMemoryRevocationRegistry()
      }
    });
    expect(unknownDecision.allowed).toBe(false);
    expect(unknownDecision.reasonCode).toBe(capabilityAccessReasonCodes.UNKNOWN_MARKET_MAKER);
  });



  it('denies deprecated and revoked market makers before payment can override trust', () => {
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

    const pricedConsent = buildConsentObject(
      SUBJECT,
      GRANTEE,
      'grant',
      [{ type: 'content', ref: CONTENT_REF }],
      ['read'],
      {
        now: new Date(NOW),
        expires_at: CONSENT_EXPIRES,
        marketMakerId: 'hrkey-v1',
        pricing: { model: 'per_use', amount: 25, currency: 'USD' }
      }
    );
    const pricedToken = mintCapabilityToken(
      pricedConsent,
      [{ type: 'content', ref: CONTENT_REF }],
      ['read'],
      CONSENT_EXPIRES,
      { now: new Date(NOW) }
    );

    const deprecatedDecision = consumeCapabilityAccess({
      capability: pricedToken,
      consent: pricedConsent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      marketMakerId: 'hrkey-v1',
      marketMakerRegistry: deprecatedRegistry,
      paymentContext: { paid: true },
      now: NOW,
      registries: {
        nonceRegistry: new InMemoryNonceRegistry(),
        revocationRegistry: new InMemoryRevocationRegistry(),
        consentUsageRegistry: new InMemoryConsentUsageRegistry()
      }
    });
    expect(deprecatedDecision.allowed).toBe(false);
    expect(deprecatedDecision.reasonCode).toBe(capabilityAccessReasonCodes.MARKET_MAKER_DEPRECATED);
    expect(deprecatedDecision.payment).toEqual({ required: false, amount: 25, currency: 'USD' });

    const usageRegistry = new InMemoryConsentUsageRegistry();
    const revokedDecision = consumeCapabilityAccess({
      capability: pricedToken,
      consent: pricedConsent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      marketMakerId: 'hrkey-v1',
      marketMakerRegistry: revokedRegistry,
      paymentContext: { paid: true },
      now: NOW,
      registries: {
        nonceRegistry: new InMemoryNonceRegistry(),
        revocationRegistry: new InMemoryRevocationRegistry(),
        consentUsageRegistry: usageRegistry
      }
    });
    expect(revokedDecision.allowed).toBe(false);
    expect(revokedDecision.reasonCode).toBe(capabilityAccessReasonCodes.MARKET_MAKER_REVOKED);
    expect(revokedDecision.usage).toBeUndefined();
    expect(usageRegistry.get(pricedToken.consent_ref)).toBeUndefined();
  });

  it('normalizes action casing and surrounding whitespace before evaluation', () => {
    const nonceRegistry = new InMemoryNonceRegistry();
    const { token, consent } = buildToken();

    const decision = consumeCapabilityAccess({
      capability: token,
      consent,
      action: ' READ ',
      resource: { type: 'content', ref: CONTENT_REF },
      now: NOW,
      registries: { nonceRegistry, revocationRegistry: new InMemoryRevocationRegistry() }
    });

    expect(decision.allowed).toBe(true);
    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.ACCESS_ALLOWED);
  });

  it('rejects malformed resource types fail-closed before evaluation', () => {
    const { token, consent } = buildToken();

    const decision = consumeCapabilityAccess({
      capability: token,
      consent,
      action: 'read',
      resource: { type: 'blob', ref: CONTENT_REF } as any,
      now: NOW,
      registries: {
        nonceRegistry: new InMemoryNonceRegistry(),
        revocationRegistry: new InMemoryRevocationRegistry()
      }
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.CAPABILITY_INVALID);
    expect(decision.checks.resource).toBe('fail');
  });

  it('rejects capability timestamps that exceed allowed clock skew', () => {
    const consent = buildConsent(undefined, '2025-12-31T23:59:59Z', new Date('2025-06-15T10:00:00Z'));
    const skewedToken = mintCapabilityToken(
      consent,
      [
        { type: 'content', ref: CONTENT_REF },
        { type: 'pack', ref: PACK_REF }
      ],
      ['read'],
      '2025-12-31T23:59:59Z',
      { now: new Date('2025-08-01T00:06:00Z') }
    );

    const decision = consumeCapabilityAccess({
      capability: skewedToken,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: NOW,
      registries: {
        nonceRegistry: new InMemoryNonceRegistry(),
        revocationRegistry: new InMemoryRevocationRegistry()
      }
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.CAPABILITY_INVALID);
    expect(decision.reason).toContain('Capability issued_at exceeds allowed clock skew.');
  });



  it('denies expired capabilities via centralized evaluation and does not run hooks', () => {
    const consentNow = new Date('2025-06-15T10:00:00Z');
    const consumeNow = new Date('2025-06-15T10:00:02Z');
    const consent = buildConsent(undefined, '2025-06-15T10:00:05Z', consentNow);
    const expiredToken = mintCapabilityToken(
      consent,
      [
        { type: 'content', ref: CONTENT_REF },
        { type: 'pack', ref: PACK_REF }
      ],
      ['read'],
      '2025-06-15T10:00:01Z',
      { now: consentNow }
    );

    const decision = consumeCapabilityAccess({
      capability: expiredToken,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: consumeNow,
      hooks: {
        usage: () => {
          throw new Error('engine hook should not run for expired capability');
        }
      },
      registries: {
        nonceRegistry: new InMemoryNonceRegistry(),
        revocationRegistry: new InMemoryRevocationRegistry()
      }
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.CAPABILITY_EXPIRED);
    expect(decision.reason).toBe('Capability has expired at the requested evaluation time.');
    expect(decision.checks.temporal).toBe('fail');
    expect(decision.metadata).toEqual({
      capabilityHash: expiredToken.capability_hash,
      tokenId: expiredToken.token_id,
      failureStage: 'temporal'
    });
  });

  it('denies capabilities that are not yet valid via centralized evaluation', () => {
    const consentNow = new Date('2025-06-15T10:00:00Z');
    const consumeNow = new Date('2025-06-15T10:00:01Z');
    const consent = buildConsent(undefined, '2025-06-15T10:00:05Z', consentNow);
    const notYetValidToken = mintCapabilityToken(
      consent,
      [
        { type: 'content', ref: CONTENT_REF },
        { type: 'pack', ref: PACK_REF }
      ],
      ['read'],
      '2025-06-15T10:00:05Z',
      {
        now: consentNow,
        not_before: '2025-06-15T10:00:02Z'
      }
    );

    const decision = consumeCapabilityAccess({
      capability: notYetValidToken,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: NOW,
      registries: {
        nonceRegistry: new InMemoryNonceRegistry(),
        revocationRegistry: new InMemoryRevocationRegistry()
      }
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.CAPABILITY_NOT_YET_VALID);
    expect(decision.reason).toBe('Capability is not yet valid at the requested evaluation time.');
    expect(decision.checks.temporal).toBe('fail');
  });

  it('rejects expires_at values in far-future skew windows before the engine runs', () => {
    const consentNow = new Date('2025-06-15T10:00:00Z');
    const consent = buildConsent(undefined, '2025-06-15T10:10:00Z', consentNow);
    const farFutureExpiryToken = mintCapabilityToken(
      consent,
      [
        { type: 'content', ref: CONTENT_REF },
        { type: 'pack', ref: PACK_REF }
      ],
      ['read'],
      '2025-06-15T10:10:00Z',
      { now: consentNow }
    );

    const decision = consumeCapabilityAccess({
      capability: farFutureExpiryToken,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: NOW,
      registries: {
        nonceRegistry: new InMemoryNonceRegistry(),
        revocationRegistry: new InMemoryRevocationRegistry()
      }
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.CAPABILITY_INVALID);
    expect(decision.reason).toBe('Capability expires_at exceeds allowed clock skew.');
    expect(decision.checks.temporal).toBe('fail');
  });

  it('rejects not_before values beyond allowed skew', () => {
    const consentNow = new Date('2025-06-15T10:00:00Z');
    const consent = buildConsent(undefined, '2025-06-15T10:10:00Z', consentNow);
    const skewedNotBeforeToken = mintCapabilityToken(
      consent,
      [
        { type: 'content', ref: CONTENT_REF },
        { type: 'pack', ref: PACK_REF }
      ],
      ['read'],
      '2025-06-15T10:10:00Z',
      {
        now: consentNow,
        not_before: '2025-06-15T10:06:00Z'
      }
    );

    const decision = consumeCapabilityAccess({
      capability: skewedNotBeforeToken,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: NOW,
      registries: {
        nonceRegistry: new InMemoryNonceRegistry(),
        revocationRegistry: new InMemoryRevocationRegistry()
      }
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.CAPABILITY_INVALID);
    expect(decision.reason).toBe('Capability not_before exceeds allowed clock skew.');
    expect(decision.checks.temporal).toBe('fail');
  });

  it('denies when consent is expired and does not increment usage or allow payment bypass', () => {
    const usageRegistry = new InMemoryConsentUsageRegistry();
    const consentNow = new Date('2025-06-15T10:00:00Z');
    const consent = buildConsent(undefined, '2025-06-15T10:00:01Z', consentNow, {
      model: 'per_use',
      amount: 25,
      currency: 'USD'
    });
    const token = mintCapabilityToken(
      consent,
      [{ type: 'content', ref: CONTENT_REF }],
      ['read'],
      '2025-06-15T10:00:01Z',
      { now: consentNow }
    );

    const decision = consumeCapabilityAccess({
      capability: token,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: new Date('2025-06-15T10:00:02Z'),
      paymentContext: { paid: true },
      registries: {
        nonceRegistry: new InMemoryNonceRegistry(),
        revocationRegistry: new InMemoryRevocationRegistry(),
        consentUsageRegistry: usageRegistry
      }
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.CONSENT_EXPIRED);
    expect(decision.payment).toEqual({ required: false, amount: 25, currency: 'USD' });
    expect(decision.usage).toBeUndefined();
    expect(usageRegistry.get(token.consent_ref)).toBeUndefined();
  });

  it('denies expiration mismatch when capability exceeds consent window', () => {
    const consent = buildConsent(undefined, '2025-06-15T10:00:03Z', new Date('2025-06-15T10:00:00Z'));
    const token = mintCapabilityToken(
      consent,
      [{ type: 'content', ref: CONTENT_REF }],
      ['read'],
      '2025-06-15T10:00:03Z',
      { now: new Date('2025-06-15T10:00:00Z') }
    );
    const forgedToken = {
      ...token,
      expires_at: '2025-06-15T10:00:04Z'
    };
    forgedToken.capability_hash = computeCapabilityHash(
      canonicalizeCapabilityPayload(forgedToken as any)
    );

    const decision = consumeCapabilityAccess({
      capability: forgedToken,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: NOW,
      registries: {
        nonceRegistry: new InMemoryNonceRegistry(),
        revocationRegistry: new InMemoryRevocationRegistry()
      }
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.EXPIRATION_MISMATCH);
  });

  it('allows temporal edge values that stay within the skew window', () => {
    const consentNow = new Date('2025-06-15T10:00:00Z');
    const consent = buildConsent(undefined, '2025-06-15T10:05:00Z', consentNow);
    const edgeToken = mintCapabilityToken(
      consent,
      [
        { type: 'content', ref: CONTENT_REF },
        { type: 'pack', ref: PACK_REF }
      ],
      ['read'],
      '2025-06-15T10:05:00Z',
      {
        now: consentNow,
        not_before: '2025-06-15T10:00:00Z'
      }
    );

    const decision = consumeCapabilityAccess({
      capability: edgeToken,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: NOW,
      registries: {
        nonceRegistry: new InMemoryNonceRegistry(),
        revocationRegistry: new InMemoryRevocationRegistry()
      }
    });

    expect(decision.allowed).toBe(true);
    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.ACCESS_ALLOWED);
  });

  it('evaluates against immutable capability snapshots even if the caller mutates the original input', () => {
    const nonceRegistry = new InMemoryNonceRegistry();
    const { token, consent } = buildToken();
    const request = {
      capability: token,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF } as const,
      now: NOW,
      hooks: {
        usage: () => {
          (request.capability as any).permissions = ['share'];
          return { allowed: true };
        }
      },
      registries: { nonceRegistry, revocationRegistry: new InMemoryRevocationRegistry() }
    };

    const decision = consumeCapabilityAccess(request);

    expect(decision.allowed).toBe(true);
    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.ACCESS_ALLOWED);
  });

  it('returns sanitized metadata only', () => {
    const nonceRegistry = new InMemoryNonceRegistry();
    const { token, consent } = buildToken();

    const decision = consumeCapabilityAccess({
      capability: token,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: NOW,
      metadata: { secret: 'should-not-echo' },
      registries: { nonceRegistry, revocationRegistry: new InMemoryRevocationRegistry() }
    });

    expect(decision.metadata).toEqual({
      capabilityHash: token.capability_hash,
      tokenId: token.token_id,
      failureStage: 'completed'
    });
  });

  it('keeps the legacy bridge read flow compatible while delegating to consumption', () => {
    const nonceRegistry = new InMemoryNonceRegistry();
    const { token, consent } = buildToken();

    const decision = enforceCapability({
      token,
      consent,
      required_scope: `content:${CONTENT_REF}`,
      now: NOW,
      registries: { nonceRegistry, revocationRegistry: new InMemoryRevocationRegistry() }
    });

    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe('OK');
    expect(decision.metadata?.legacyBridgeAction).toBe('read');
    expect(decision.metadata?.consumed).toBe(true);
    expect(nonceRegistry.hasSeen(token.token_id, NOW)).toBe(true);
  });
});
