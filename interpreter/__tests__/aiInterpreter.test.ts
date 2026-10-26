import { mintCapabilityToken } from '../../capability';
import { buildConsentObject as buildUnsignedConsentObject } from '../../consent';
import { capabilityAccessReasonCodes } from '../../enforcement';
import { InMemoryConsentUsageRegistry } from '../../protocol/capabilities';
import { MarketMakerRegistry } from '../../shared/marketMakerRegistry';
import { interpretWithCapability as interpretWithCapabilityRaw, runInterpreter } from '../aiInterpreter';
import { testSubjectSigner, signTestConsent } from '../../tests/helpers/consentSigning';
import { InMemoryRevocationRegistry } from '../../capability/registries/InMemoryRevocationRegistry';

// Every authorization path reads revocation from an injected registry; these
// tests share one and pass it unless a test supplies its own.
const revocationRegistry = new InMemoryRevocationRegistry();
const interpretWithCapability: typeof interpretWithCapabilityRaw = (input, dependencies = {}) =>
  interpretWithCapabilityRaw(input, { ...dependencies, registries: { revocationRegistry, ...dependencies.registries } });


// Consents in these tests are signed by their subject; unsigned consents authorize nothing.
const buildConsentObject: typeof buildUnsignedConsentObject = (...args) =>
  signTestConsent(buildUnsignedConsentObject(...args));

const SUBJECT = testSubjectSigner('subject').did;
const GRANTEE = 'did:aoc:grantee456';
const NOW = '2025-06-15T10:00:00Z';
const EXPIRES_AT = '2025-06-15T10:05:00Z';
const CONTENT_REF = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function buildRequest(overrides: Partial<Parameters<typeof interpretWithCapability>[0]> = {}) {
  const consent = buildConsentObject(
    SUBJECT,
    GRANTEE,
    'grant',
    [{ type: 'content', ref: CONTENT_REF }],
    ['read'],
    {
      now: new Date(NOW),
      expires_at: EXPIRES_AT
    }
  );

  const capability = mintCapabilityToken(
    consent,
    [{ type: 'content', ref: CONTENT_REF }],
    ['read'],
    EXPIRES_AT,
    { now: new Date(NOW) }
  );

  return {
    consent,
    capability,
    action: 'read',
    resource: `content:${CONTENT_REF}`,
    input: {
      query: 'Summarize the reference payload',
      context: {
        resources: {
          [`content:${CONTENT_REF}`]: {
            candidate: 'Taylor',
            role: 'Engineer',
            rating: 'strong'
          }
        }
      }
    },
    now: NOW,
    ...overrides
  };
}

describe('runInterpreter', () => {
  it('returns deterministic structure', () => {
    const data = { b: 2, a: 1 };
    expect(runInterpreter('Explain', data)).toBe(runInterpreter('Explain', data));
  });
});

describe('interpretWithCapability', () => {
  it('allows interpretation with valid capability', () => {
    const usageRegistry = new InMemoryConsentUsageRegistry();
    const response = interpretWithCapability(buildRequest(), {
      registries: { consentUsageRegistry: usageRegistry }
    });

    expect(response.allowed).toBe(true);
    expect(response.result?.metadata?.source).toBe('capability-context');
    expect(response.usage.usageCount).toBe(1);
  });

  it('denies when capability invalid', () => {
    const request = buildRequest();
    const response = interpretWithCapability({
      ...request,
      capability: {
        ...request.capability,
        permissions: []
      }
    });

    expect(response.allowed).toBe(false);
    expect(response.error?.code).toBe(capabilityAccessReasonCodes.CAPABILITY_INVALID);
  });

  it('denies expired consent before interpreter execution with no side effects', () => {
    const usageRegistry = new InMemoryConsentUsageRegistry();
    const interpreterSpy = jest.spyOn(require('../aiInterpreter'), 'runInterpreter');
    const request = buildRequest({
      now: '2025-06-15T10:05:02Z',
      consent: buildConsentObject(
        SUBJECT,
        GRANTEE,
        'grant',
        [{ type: 'content', ref: CONTENT_REF }],
        ['read'],
        {
          now: new Date(NOW),
          expires_at: '2025-06-15T10:05:01Z'
        }
      )
    });
    request.capability = mintCapabilityToken(
      request.consent!,
      [{ type: 'content', ref: CONTENT_REF }],
      ['read'],
      '2025-06-15T10:05:01Z',
      { now: new Date(NOW) }
    );

    const response = interpretWithCapability(request, {
      registries: { consentUsageRegistry: usageRegistry }
    });

    expect(response.allowed).toBe(false);
    expect(response.error?.code).toBe(capabilityAccessReasonCodes.CONSENT_EXPIRED);
    expect(interpreterSpy).not.toHaveBeenCalled();
    expect(usageRegistry.get(request.capability.consent_ref)).toBeUndefined();
    interpreterSpy.mockRestore();
  });

  it('denies when payment required but not paid', () => {
    const request = buildRequest({
      consent: buildConsentObject(
        SUBJECT,
        GRANTEE,
        'grant',
        [{ type: 'content', ref: CONTENT_REF }],
        ['read'],
        {
          now: new Date(NOW),
          expires_at: EXPIRES_AT,
          pricing: { model: 'per_use', amount: 25, currency: 'USD' }
        }
      )
    });

    const capability = mintCapabilityToken(
      request.consent!,
      [{ type: 'content', ref: CONTENT_REF }],
      ['read'],
      EXPIRES_AT,
      { now: new Date(NOW) }
    );

    const response = interpretWithCapability({
      ...request,
      capability
    });

    expect(response.allowed).toBe(false);
    expect(response.error?.code).toBe(capabilityAccessReasonCodes.PAYMENT_REQUIRED);
    expect(response.payment).toEqual({ required: true, amount: 25, currency: 'USD' });
  });

  it('executes AI when paid', () => {
    const pricedConsent = buildConsentObject(
      SUBJECT,
      GRANTEE,
      'grant',
      [{ type: 'content', ref: CONTENT_REF }],
      ['read'],
      {
        now: new Date(NOW),
        expires_at: EXPIRES_AT,
        pricing: { model: 'per_use', amount: 25, currency: 'USD' }
      }
    );
    const capability = mintCapabilityToken(
      pricedConsent,
      [{ type: 'content', ref: CONTENT_REF }],
      ['read'],
      EXPIRES_AT,
      { now: new Date(NOW) }
    );

    const response = interpretWithCapability(
      buildRequest({
        consent: pricedConsent,
        capability,
        paymentContext: { paid: true }
      }),
      { registries: { consentUsageRegistry: new InMemoryConsentUsageRegistry() } }
    );

    expect(response.allowed).toBe(true);
    expect(response.result?.interpretation).toContain('Deterministic interpretation');
    expect(response.payment).toEqual({ required: false, amount: 25, currency: 'USD' });
  });

  it('does not increment usage on denied access', () => {
    const usageRegistry = new InMemoryConsentUsageRegistry();
    const request = buildRequest();

    const response = interpretWithCapability(
      {
        ...request,
        capability: {
          ...request.capability,
          permissions: []
        }
      },
      { registries: { consentUsageRegistry: usageRegistry } }
    );

    expect(response.allowed).toBe(false);
    expect(usageRegistry.get(request.capability.consent_ref)).toBeUndefined();
  });

  it('denies before interpreter execution for deprecated or revoked market makers', () => {
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

    const usageRegistry = new InMemoryConsentUsageRegistry();
    const interpreterSpy = jest.spyOn(require('../aiInterpreter'), 'runInterpreter');
    const request = buildRequest({
      consent: buildRequest().consent,
      capability: buildRequest().capability
    });
    request.consent = buildConsentObject(
      SUBJECT,
      GRANTEE,
      'grant',
      [{ type: 'content', ref: CONTENT_REF }],
      ['read'],
      { now: new Date(NOW), expires_at: EXPIRES_AT, marketMakerId: 'hrkey-v1' }
    );
    request.capability = mintCapabilityToken(
      request.consent,
      [{ type: 'content', ref: CONTENT_REF }],
      ['read'],
      EXPIRES_AT,
      { now: new Date(NOW) }
    );

    const deprecatedResponse = interpretWithCapability(request, {
      marketMakerRegistry: deprecatedRegistry,
      registries: { consentUsageRegistry: usageRegistry }
    });
    expect(deprecatedResponse.allowed).toBe(false);
    expect(deprecatedResponse.error?.code).toBe(capabilityAccessReasonCodes.MARKET_MAKER_DEPRECATED);

    const revokedResponse = interpretWithCapability(request, {
      marketMakerRegistry: revokedRegistry,
      registries: { consentUsageRegistry: usageRegistry }
    });
    expect(revokedResponse.allowed).toBe(false);
    expect(revokedResponse.error?.code).toBe(capabilityAccessReasonCodes.MARKET_MAKER_REVOKED);
    expect(interpreterSpy).not.toHaveBeenCalled();
    expect(usageRegistry.get(request.capability.consent_ref)).toBeUndefined();
    interpreterSpy.mockRestore();
  });

  it('increments usage on successful interpretation', () => {
    const usageRegistry = new InMemoryConsentUsageRegistry();
    const request = buildRequest();

    const response = interpretWithCapability(request, {
      registries: { consentUsageRegistry: usageRegistry }
    });

    expect(response.allowed).toBe(true);
    expect(usageRegistry.get(request.capability.consent_ref)?.usageCount).toBe(1);
  });

  it('returns deterministic structure', () => {
    const request = buildRequest();
    const usageRegistry = new InMemoryConsentUsageRegistry();

    const first = interpretWithCapability(request, {
      registries: { consentUsageRegistry: usageRegistry }
    });
    const second = interpretWithCapability(request, {
      registries: { consentUsageRegistry: new InMemoryConsentUsageRegistry() }
    });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(first.result?.interpretation).toBe(second.result?.interpretation);
  });

  it('supports HRKey reference payload metadata', () => {
    const response = interpretWithCapability(
      buildRequest({
        input: {
          query: 'Summarize the HRKey reference',
          context: {
            hrkeyReference: {
              [`content:${CONTENT_REF}`]: {
                referee: 'Jordan',
                relationship: 'Manager',
                recommendation: 'hire'
              }
            }
          }
        }
      }),
      { registries: { consentUsageRegistry: new InMemoryConsentUsageRegistry() } }
    );

    expect(response.allowed).toBe(true);
    expect(response.result?.metadata).toMatchObject({ source: 'hrkey-reference' });
  });
});
