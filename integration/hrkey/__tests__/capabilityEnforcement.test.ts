import { buildConsentObject as buildUnsignedConsentObject } from '../../../consent';
import { mintCapabilityToken } from '../../../capability';
import { evaluateCapabilityAccess as evaluateCapabilityAccessRaw } from '../../../enforcement';
import { MarketMakerRegistry } from '../../../shared/marketMakerRegistry';
import { testSubjectSigner, signTestConsent } from '../../../tests/helpers/consentSigning';
import { InMemoryRevocationRegistry } from '../../../capability/registries/InMemoryRevocationRegistry';

// Every authorization path reads revocation from an injected registry; these
// tests share one and pass it unless a test supplies its own.
const revocationRegistry = new InMemoryRevocationRegistry();
const evaluateCapabilityAccess: typeof evaluateCapabilityAccessRaw = (input) =>
  evaluateCapabilityAccessRaw({ ...input, registries: { revocationRegistry, ...input.registries } });


// Consents in these tests are signed by their subject; unsigned consents authorize nothing.
const buildConsentObject: typeof buildUnsignedConsentObject = (...args) =>
  signTestConsent(buildUnsignedConsentObject(...args));

const SUBJECT = testSubjectSigner('subject').did;
const EMPLOYER = testSubjectSigner('grantee').did;
const CONTENT_REF = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function buildHrKeyCapability() {
  const consent = buildConsentObject(
    SUBJECT,
    EMPLOYER,
    'grant',
    [{ type: 'content', ref: CONTENT_REF }],
    ['read'],
    {
      now: new Date('2025-01-15T14:30:00Z'),
      expires_at: '2026-01-15T14:30:00Z',
      marketMakerId: 'hrkey-v1'
    }
  );

  const capability = mintCapabilityToken(
    consent,
    [{ type: 'content', ref: CONTENT_REF }],
    ['read'],
    '2025-12-31T23:59:59Z',
    { now: new Date('2025-06-15T10:00:00Z') }
  );

  return { consent, capability };
}

describe('HRKey capability enforcement integration', () => {
  it('evaluates a market-maker-bound access request at the service boundary', () => {
    const { consent, capability } = buildHrKeyCapability();
    const marketMakerRegistry = new MarketMakerRegistry();
    marketMakerRegistry.register({
      id: 'hrkey-v1',
      name: 'HRKey',
      version: '1.0.0',
      capabilities: ['employment'],
      status: 'active',
      created_at: '2025-01-15T00:00:00Z'
    });

    const decision = evaluateCapabilityAccess({
      capability,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      marketMakerId: 'hrkey-v1',
      marketMakerRegistry,
      now: '2025-08-01T00:00:00Z',
      metadata: {
        endpoint: 'hrkey.capability.redeem'
      }
    });

    expect(decision).toMatchObject({
      allowed: true,
      decision: 'allow',
      reasonCode: 'ACCESS_ALLOWED',
      checks: {
        integrity: 'pass',
        temporal: 'pass',
        action: 'pass',
        resource: 'pass',
        marketMaker: 'pass'
      }
    });
    expect(decision.metadata.boundMarketMakerId).toBe('hrkey-v1');
  });
});
