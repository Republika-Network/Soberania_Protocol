import {
  InMemoryRateLimitRegistry,
  InMemoryRevocationRegistry,
  MarketMakerRegistry,
  buildConsentObject as buildUnsignedConsentObject,
  executeCapabilityFlow,
  mintCapabilityToken
} from '../../aoc/sdk';
import { testSubjectSigner, signTestConsent } from '../helpers/consentSigning';

// Consents in these tests are signed by their subject; unsigned consents authorize nothing.
const buildConsentObject: typeof buildUnsignedConsentObject = (...args) =>
  signTestConsent(buildUnsignedConsentObject(...args));

const SUBJECT = testSubjectSigner('subject').did;
const GRANTEE = testSubjectSigner('grantee').did;
const MARKET_MAKER_ID = 'hrkey-v1';
const CONTENT_REF = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const NOW = '2025-06-15T10:00:00Z';
const revocationRegistry = new InMemoryRevocationRegistry();

function createMarketMakerRegistry(): MarketMakerRegistry {
  const marketMakers = new MarketMakerRegistry();
  marketMakers.register({
    id: MARKET_MAKER_ID,
    name: 'HRKey',
    version: '1.0.0',
    capabilities: ['content.read'],
    status: 'active',
    created_at: NOW
  });
  return marketMakers;
}

function createCapability(options?: {
  pricing?: { model: 'per_use'; amount: number; currency: string };
  marketMakerBound?: boolean;
}) {
  const marketMakerBound = options?.marketMakerBound ?? true;
  const consent = buildConsentObject(
    SUBJECT,
    GRANTEE,
    'grant',
    [{ type: 'content', ref: CONTENT_REF }],
    ['read'],
    {
      now: new Date(NOW),
      expires_at: '2025-06-15T10:05:00Z',
      ...(marketMakerBound ? { marketMakerId: MARKET_MAKER_ID } : {}),
      ...(options?.pricing ? { pricing: options.pricing } : {})
    }
  );

  const capability = mintCapabilityToken(
    consent,
    [{ type: 'content', ref: CONTENT_REF }],
    ['read'],
    '2025-06-15T10:05:00Z',
    { now: new Date(NOW) }
  );

  return { consent, capability };
}

describe('executeCapabilityFlow', () => {
  it('returns evaluation-stage deny and does not call interpreter when evaluation fails', () => {
    const marketMakerRegistry = createMarketMakerRegistry();
    const { consent, capability } = createCapability();

    const result = executeCapabilityFlow({
      registries: { revocationRegistry },
      capability,
      consent,
      action: 'store',
      resource: { type: 'content', ref: CONTENT_REF },
      marketMakerId: MARKET_MAKER_ID,
      marketMakerRegistry,
      now: NOW,
      interpreter: {
        enabled: true,
        query: 'This should not run.'
      }
    });

    expect(result.allowed).toBe(false);
    expect(result.stage).toBe('evaluation');
    expect(result.evaluation.allowed).toBe(false);
    expect(result.consumption).toBeUndefined();
    expect(result.interpretation).toBeUndefined();
    expect(result.reasonCode).toBe(result.evaluation.reasonCode);
    expect(result.reason).toBe(result.evaluation.reason);
  });

  it('returns consumption-stage deny and does not call interpreter when consumption fails', () => {
    const marketMakerRegistry = createMarketMakerRegistry();
    const { consent, capability } = createCapability({
      pricing: { model: 'per_use', amount: 10, currency: 'USD' }
    });

    const result = executeCapabilityFlow({
      registries: { revocationRegistry },
      capability,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      marketMakerId: MARKET_MAKER_ID,
      marketMakerRegistry,
      now: NOW,
      interpreter: {
        enabled: true,
        query: 'This should not run either.'
      }
    });

    expect(result.allowed).toBe(false);
    expect(result.stage).toBe('consumption');
    expect(result.evaluation.allowed).toBe(true);
    expect(result.consumption?.allowed).toBe(false);
    expect(result.interpretation).toBeUndefined();
    expect(result.reasonCode).toBe('PAYMENT_REQUIRED');
    expect(result.reasonCode).toBe(result.consumption?.reasonCode);
    expect(result.reason).toBe(result.consumption?.reason);
  });

  it('returns successful consumption when interpreter is disabled', () => {
    const marketMakerRegistry = createMarketMakerRegistry();
    const { consent, capability } = createCapability();

    const result = executeCapabilityFlow({
      registries: { revocationRegistry },
      capability,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      marketMakerId: MARKET_MAKER_ID,
      marketMakerRegistry,
      now: NOW
    });

    expect(result.allowed).toBe(true);
    expect(result.stage).toBe('consumption');
    expect(result.evaluation.allowed).toBe(true);
    expect(result.consumption?.allowed).toBe(true);
    expect(result.interpretation).toBeUndefined();
    expect(result.reasonCode).toBe('ACCESS_ALLOWED');
    expect(result.reason).toBe('Capability flow succeeded after evaluation and runtime consumption.');
  });

  it('runs interpretation only after successful consumption', () => {
    const { consent, capability } = createCapability({ marketMakerBound: false });

    const result = executeCapabilityFlow({
      registries: { revocationRegistry },
      capability,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: NOW,
      interpreter: {
        enabled: true,
        query: 'Summarize the candidate profile.',
        context: {
          resources: {
            [`content:${CONTENT_REF}`]: {
              profile: { seniority: 'senior' }
            }
          }
        }
      }
    });

    expect(result.stage).toBe('interpretation');
    expect(result.evaluation.allowed).toBe(true);
    expect(result.consumption?.allowed).toBe(true);
    expect(result.interpretation?.allowed).toBe(true);
    expect(result.allowed).toBe(true);
    expect(result.reasonCode).toBe('ACCESS_ALLOWED');
    expect(result.reason).toBe('Capability flow succeeded after evaluation and runtime consumption.');
  });

  it('returns consumption-stage RATE_LIMITED and does not invoke interpreter when rate limit is hit', () => {
    const { consent, capability: firstCapability } = createCapability({ marketMakerBound: false });
    const { capability: secondCapability } = createCapability({ marketMakerBound: false });
    const rateLimitRegistry = new InMemoryRateLimitRegistry();

    const first = executeCapabilityFlow({
      capability: firstCapability,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: NOW,
      rateLimit: {
        registry: rateLimitRegistry,
        maxAttempts: 1,
        windowMs: 60_000
      }
    });

    const second = executeCapabilityFlow({
      capability: secondCapability,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: '2025-06-15T10:00:05Z',
      rateLimit: {
        registry: rateLimitRegistry,
        maxAttempts: 1,
        windowMs: 60_000
      },
      interpreter: {
        enabled: true,
        query: 'This second request should be throttled.'
      }
    });

    expect(first.allowed).toBe(true);
    expect(first.stage).toBe('consumption');
    expect(second.allowed).toBe(false);
    expect(second.stage).toBe('consumption');
    expect(second.reasonCode).toBe('RATE_LIMITED');
    expect(second.reasonCode).toBe(second.consumption?.reasonCode);
    expect(second.interpretation).toBeUndefined();
  });

  it('returns evaluation-stage deny with trust reason passthrough for deprecated and revoked market makers', () => {
    const deprecatedRegistry = createMarketMakerRegistry();
    const revokedRegistry = createMarketMakerRegistry();
    const { consent, capability } = createCapability();

    deprecatedRegistry.register({
      id: 'legacy-hrkey-v1',
      name: 'Legacy HRKey',
      version: '0.9.0',
      capabilities: ['content.read'],
      status: 'deprecated',
      created_at: NOW
    });
    revokedRegistry.register({
      id: 'legacy-hrkey-v1',
      name: 'Legacy HRKey',
      version: '0.9.0',
      capabilities: ['content.read'],
      status: 'revoked',
      created_at: NOW
    });

    const deprecatedResult = executeCapabilityFlow({
      registries: { revocationRegistry },
      capability,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      marketMakerId: MARKET_MAKER_ID,
      marketMakerRegistry: {
        exists: (id: string) => (id === MARKET_MAKER_ID ? true : deprecatedRegistry.exists(id)),
        getStatus: (id: string) =>
          id === MARKET_MAKER_ID ? 'deprecated' : deprecatedRegistry.getStatus(id)
      },
      now: NOW,
      interpreter: {
        enabled: true,
        query: 'This should not run.'
      }
    });

    expect(deprecatedResult.allowed).toBe(false);
    expect(deprecatedResult.stage).toBe('evaluation');
    expect(deprecatedResult.consumption).toBeUndefined();
    expect(deprecatedResult.interpretation).toBeUndefined();
    expect(deprecatedResult.reasonCode).toBe('MARKET_MAKER_DEPRECATED');
    expect(deprecatedResult.reasonCode).toBe(deprecatedResult.evaluation.reasonCode);

    const revokedResult = executeCapabilityFlow({
      registries: { revocationRegistry },
      capability,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      marketMakerId: MARKET_MAKER_ID,
      marketMakerRegistry: {
        exists: (id: string) => (id === MARKET_MAKER_ID ? true : revokedRegistry.exists(id)),
        getStatus: (id: string) =>
          id === MARKET_MAKER_ID ? 'revoked' : revokedRegistry.getStatus(id)
      },
      now: NOW,
      interpreter: {
        enabled: true,
        query: 'This should not run.'
      }
    });

    expect(revokedResult.allowed).toBe(false);
    expect(revokedResult.stage).toBe('evaluation');
    expect(revokedResult.consumption).toBeUndefined();
    expect(revokedResult.interpretation).toBeUndefined();
    expect(revokedResult.reasonCode).toBe('MARKET_MAKER_REVOKED');
    expect(revokedResult.reasonCode).toBe(revokedResult.evaluation.reasonCode);
  });

  it('returns interpretation failure code without mutating deny propagation', () => {
    const { consent, capability } = createCapability({ marketMakerBound: false });

    const result = executeCapabilityFlow({
      registries: { revocationRegistry },
      capability,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: NOW,
      interpreter: {
        enabled: true,
        query: 'This should fail due to missing resource context.'
      }
    });

    expect(result.allowed).toBe(false);
    expect(result.stage).toBe('interpretation');
    expect(result.evaluation.allowed).toBe(true);
    expect(result.consumption?.allowed).toBe(true);
    expect(result.reasonCode).toBe('INTERPRETER_EXECUTION_FAILED');
    expect(result.reason).toContain('No capability-resolved data found');
  });
});
