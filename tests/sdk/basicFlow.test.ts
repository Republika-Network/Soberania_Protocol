import {
  buildConsentObject as buildUnsignedConsentObject,
  consumeCapabilityAccess as consumeCapabilityAccessRaw,
  evaluateCapabilityAccess as evaluateCapabilityAccessRaw,
  mintCapabilityToken,
  MarketMakerRegistry
} from '../../aoc/sdk';
import { testSubjectSigner, signTestConsent } from '../helpers/consentSigning';
import { InMemoryRevocationRegistry } from '../../capability/registries/InMemoryRevocationRegistry';

// Every authorization path reads revocation from an injected registry; these
// tests share one and pass it unless a test supplies its own.
const revocationRegistry = new InMemoryRevocationRegistry();
const evaluateCapabilityAccess: typeof evaluateCapabilityAccessRaw = (input) =>
  evaluateCapabilityAccessRaw({ ...input, registries: { revocationRegistry, ...input.registries } });
const consumeCapabilityAccess: typeof consumeCapabilityAccessRaw = (input) =>
  consumeCapabilityAccessRaw({ ...input, registries: { revocationRegistry, ...input.registries } });


// Consents in these tests are signed by their subject; unsigned consents authorize nothing.
const buildConsentObject: typeof buildUnsignedConsentObject = (...args) =>
  signTestConsent(buildUnsignedConsentObject(...args));

const SUBJECT = testSubjectSigner('subject').did;
const GRANTEE = testSubjectSigner('grantee').did;
const MARKET_MAKER_ID = 'hrkey-v1';
const CONTENT_REF = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const NOW = '2025-06-15T10:00:00Z';

describe('AOC capability SDK basic flow', () => {
  it('creates consent, mints capability, evaluates allow, and consumes successfully via SDK exports', () => {
    const marketMakers = new MarketMakerRegistry();
    marketMakers.register({
      id: MARKET_MAKER_ID,
      name: 'HRKey',
      version: '1.0.0',
      capabilities: ['content.read'],
      status: 'active',
      created_at: NOW
    });

    const consent = buildConsentObject(
      SUBJECT,
      GRANTEE,
      'grant',
      [{ type: 'content', ref: CONTENT_REF }],
      ['read'],
      {
        now: new Date(NOW),
        expires_at: '2025-06-15T10:05:00Z',
        marketMakerId: MARKET_MAKER_ID
      }
    );

    const capability = mintCapabilityToken(
      consent,
      [{ type: 'content', ref: CONTENT_REF }],
      ['read'],
      '2025-06-15T10:05:00Z',
      { now: new Date(NOW) }
    );

    const evaluation = evaluateCapabilityAccess({
      capability,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      marketMakerId: MARKET_MAKER_ID,
      marketMakerRegistry: marketMakers,
      now: NOW
    });

    expect(evaluation.allowed).toBe(true);
    expect(evaluation.decision).toBe('allow');

    const consumption = consumeCapabilityAccess({
      capability,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      marketMakerId: MARKET_MAKER_ID,
      marketMakerRegistry: marketMakers,
      now: NOW
    });

    expect(consumption.allowed).toBe(true);
    expect(consumption.decision).toBe('allow');
  });
});
