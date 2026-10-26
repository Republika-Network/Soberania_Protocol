import { buildConsentObject as buildUnsignedConsentObject } from '../../consent';
import {
  canonicalizeCapabilityPayload,
  computeCapabilityHash,
  mintCapabilityToken
} from '../../capability';
import {
  capabilityAccessReasonCodes,
  evaluateCapabilityAccess as evaluateCapabilityAccessRaw
} from '..';
import { MarketMakerRegistry } from '../../shared/marketMakerRegistry';
import { testSubjectSigner, signTestConsent } from '../../tests/helpers/consentSigning';
import { InMemoryRevocationRegistry } from '../../capability/registries/InMemoryRevocationRegistry';

// Every authorization path reads revocation from an injected registry; these
// tests share one and pass it unless a test supplies its own.
const revocationRegistry = new InMemoryRevocationRegistry();
const evaluateCapabilityAccess: typeof evaluateCapabilityAccessRaw = (input) =>
  evaluateCapabilityAccessRaw({ ...input, registries: { revocationRegistry, ...input.registries } });


// Consents in these tests are signed by their subject; unsigned consents authorize nothing.
const buildConsentObject: typeof buildUnsignedConsentObject = (...args) =>
  signTestConsent(buildUnsignedConsentObject(...args));

const SUBJECT = testSubjectSigner('subject').did;
const GRANTEE = testSubjectSigner('grantee').did;
const CONTENT_REF = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PACK_REF = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const CONSENT_NOW = new Date('2025-01-15T14:30:00Z');
const TOKEN_NOW = new Date('2025-06-15T10:00:00Z');
const CONSENT_EXPIRES = '2026-01-15T14:30:00Z';
const TOKEN_EXPIRES = '2025-12-31T23:59:59Z';

function buildTrustedMarketMakerRegistry(id: string): MarketMakerRegistry {
  const registry = new MarketMakerRegistry();
  registry.register({
    id,
    name: 'HRKey',
    version: '1.0.0',
    capabilities: ['employment'],
    status: 'active',
    created_at: '2025-01-15T00:00:00Z'
  });
  return registry;
}

function buildConsent(marketMakerId?: string) {
  return buildConsentObject(
    SUBJECT,
    GRANTEE,
    'grant',
    [
      { type: 'content', ref: CONTENT_REF },
      { type: 'pack', ref: PACK_REF }
    ],
    ['read', 'store', 'share'],
    {
      now: CONSENT_NOW,
      expires_at: CONSENT_EXPIRES,
      ...(marketMakerId !== undefined ? { marketMakerId } : {})
    }
  );
}

function buildCapability(overrides: Record<string, unknown> = {}) {
  const consentMarketMakerId =
    typeof overrides.marketMakerId === 'string' ? overrides.marketMakerId : undefined;
  const consent = buildConsent(consentMarketMakerId);
  const capability = mintCapabilityToken(
    consent,
    [
      { type: 'content', ref: CONTENT_REF },
      { type: 'pack', ref: PACK_REF }
    ],
    ['read'],
    TOKEN_EXPIRES,
    { now: TOKEN_NOW }
  ) as Record<string, unknown>;

  return {
    consent,
    capability: {
      ...capability,
      ...overrides
    }
  };
}

describe('evaluateCapabilityAccess', () => {
  it('allows access for a valid capability', () => {
    const { capability, consent } = buildCapability();
    const decision = evaluateCapabilityAccess({
      capability,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: '2025-08-01T00:00:00Z'
    });

    expect(decision.allowed).toBe(true);
    expect(decision.decision).toBe('allow');
    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.ACCESS_ALLOWED);
    expect(decision.checks).toEqual({
      integrity: 'pass',
      temporal: 'pass',
      action: 'pass',
      resource: 'pass',
      marketMaker: 'not_applicable',
      usage: 'not_applicable',
      policy: 'not_applicable'
    });
    expect(decision.metadata.matchedResource).toBe(`content:${CONTENT_REF}`);
  });

  it('denies when capability is missing', () => {
    const decision = evaluateCapabilityAccess({
      capability: undefined,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: '2025-08-01T00:00:00Z'
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.CAPABILITY_MISSING);
  });

  it('denies malformed capability objects', () => {
    const { capability, consent } = buildCapability({ permissions: [] });
    const decision = evaluateCapabilityAccess({
      capability,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: '2025-08-01T00:00:00Z'
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.CAPABILITY_INVALID);
  });

  it('denies inactive capabilities', () => {
    const { capability, consent } = buildCapability({ status: 'inactive' });
    const decision = evaluateCapabilityAccess({
      capability,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: '2025-08-01T00:00:00Z'
    });

    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.CAPABILITY_INACTIVE);
  });

  it('denies not-yet-valid capabilities', () => {
    const { consent } = buildCapability();
    const capability = mintCapabilityToken(
      consent,
      [{ type: 'content', ref: CONTENT_REF }],
      ['read'],
      TOKEN_EXPIRES,
      { now: TOKEN_NOW, not_before: '2025-09-01T00:00:00Z' }
    );

    const decision = evaluateCapabilityAccess({
      capability,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: '2025-08-01T00:00:00Z'
    });

    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.CAPABILITY_NOT_YET_VALID);
  });

  it('denies expired capabilities', () => {
    const { capability, consent } = buildCapability();
    const decision = evaluateCapabilityAccess({
      capability,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: '2026-01-01T00:00:00Z'
    });

    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.CAPABILITY_EXPIRED);
  });


  it('denies when parent consent is expired even if capability is otherwise valid', () => {
    const { capability, consent } = buildCapability();
    const decision = evaluateCapabilityAccess({
      capability,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: '2026-02-01T00:00:00Z'
    });

    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.CONSENT_EXPIRED);
  });

  it('denies when capability expiry exceeds parent consent expiry', () => {
    const { capability, consent } = buildCapability();
    const forgedCapability: any = {
      ...capability,
      expires_at: '2026-02-01T00:00:00Z'
    };
    forgedCapability.capability_hash = computeCapabilityHash(
      canonicalizeCapabilityPayload(forgedCapability as any)
    );

    const decision = evaluateCapabilityAccess({
      capability: forgedCapability,
      consent,
      action: 'read',
      resource: { type: 'content', ref: CONTENT_REF },
      now: '2025-08-01T00:00:00Z'
    });

    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.EXPIRATION_MISMATCH);
  });

  it('denies invalid requested actions as structurally invalid input', () => {
    const { capability, consent } = buildCapability();
    const decision = evaluateCapabilityAccess({
      capability,
      consent,
      action: 'write',
      resource: { type: 'content', ref: CONTENT_REF },
      now: '2025-08-01T00:00:00Z'
    });

    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.CAPABILITY_INVALID);
  });

  it('denies exact non-granted but valid requested actions with ACTION_NOT_ALLOWED', () => {
    const { capability, consent } = buildCapability();
    const decision = evaluateCapabilityAccess({
      capability,
      consent,
      action: 'share',
      resource: { type: 'content', ref: CONTENT_REF },
      now: '2025-08-01T00:00:00Z'
    });

    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.ACTION_NOT_ALLOWED);
  });

  it('allows exact granted non-read actions', () => {
    const { consent } = buildCapability();
    const capability = mintCapabilityToken(
      consent,
      [
        { type: 'content', ref: CONTENT_REF },
        { type: 'pack', ref: PACK_REF }
      ],
      ['read', 'share'],
      TOKEN_EXPIRES,
      { now: TOKEN_NOW }
    );

    const decision = evaluateCapabilityAccess({
      capability,
      consent,
      action: 'share',
      resource: { type: 'content', ref: CONTENT_REF },
      now: '2025-08-01T00:00:00Z'
    });

    expect(decision.allowed).toBe(true);
    expect(decision.checks.action).toBe('pass');
  });

  it('allows bound market maker checks to pass for granted non-read actions', () => {
    const consent = buildConsent('hrkey-v1');
    const capability = mintCapabilityToken(
      consent,
      [
        { type: 'content', ref: CONTENT_REF },
        { type: 'pack', ref: PACK_REF }
      ],
      ['share'],
      TOKEN_EXPIRES,
      { now: TOKEN_NOW, marketMakerId: 'hrkey-v1' }
    );

    const decision = evaluateCapabilityAccess({
      capability,
      consent,
      action: 'share',
      resource: { type: 'content', ref: CONTENT_REF },
      marketMakerId: 'hrkey-v1',
      marketMakerRegistry: buildTrustedMarketMakerRegistry('hrkey-v1'),
      now: '2025-08-01T00:00:00Z'
    });

    expect(decision.allowed).toBe(true);
    expect(decision.checks.marketMaker).toBe('pass');
  });

  it('denies resource mismatch', () => {
    const { capability, consent } = buildCapability();
    const decision = evaluateCapabilityAccess({
      capability,
      consent,
      action: 'read',
      resource: { type: 'content', ref: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' },
      now: '2025-08-01T00:00:00Z'
    });

    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.RESOURCE_NOT_ALLOWED);
  });

  it('allows exact resource string matches', () => {
    const { capability, consent } = buildCapability();
    const decision = evaluateCapabilityAccess({
      capability,
      consent,
      action: 'read',
      resource: `content:${CONTENT_REF}`,
      now: '2025-08-01T00:00:00Z'
    });

    expect(decision.allowed).toBe(true);
  });

  it('allows when a bound market maker matches', () => {
    const { capability, consent } = buildCapability({ marketMakerId: 'hrkey-v1' });
    const decision = evaluateCapabilityAccess({
      capability,
      consent,
      action: 'read',
      resource: `content:${CONTENT_REF}`,
      marketMakerId: 'hrkey-v1',
      marketMakerRegistry: buildTrustedMarketMakerRegistry('hrkey-v1'),
      now: '2025-08-01T00:00:00Z'
    });

    expect(decision.allowed).toBe(true);
    expect(decision.checks.marketMaker).toBe('pass');
  });

  it('denies when a bound market maker is missing', () => {
    const { capability, consent } = buildCapability({ marketMakerId: 'hrkey-v1' });
    const decision = evaluateCapabilityAccess({
      capability,
      consent,
      action: 'read',
      resource: `content:${CONTENT_REF}`,
      marketMakerRegistry: buildTrustedMarketMakerRegistry('hrkey-v1'),
      now: '2025-08-01T00:00:00Z'
    });

    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.MARKET_MAKER_REQUIRED);
  });

  it('denies when a bound market maker cannot be verified because no registry was provided', () => {
    const { capability, consent } = buildCapability({ marketMakerId: 'hrkey-v1' });
    const decision = evaluateCapabilityAccess({
      capability,
      consent,
      action: 'read',
      resource: `content:${CONTENT_REF}`,
      now: '2025-08-01T00:00:00Z'
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.MARKET_MAKER_TRUST_UNVERIFIABLE);
  });



  it('denies capabilities with an unknown but structurally valid market maker when a registry is enforced', () => {
    const registry = new MarketMakerRegistry();
    const { capability, consent } = buildCapability({ marketMakerId: 'hrkey-v1' });

    const decision = evaluateCapabilityAccess({
      capability,
      consent,
      action: 'read',
      resource: `content:${CONTENT_REF}`,
      marketMakerId: 'hrkey-v1',
      marketMakerRegistry: registry,
      now: '2025-08-01T00:00:00Z'
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.UNKNOWN_MARKET_MAKER);
    expect(decision.metadata.failureStage).toBe('marketMaker');
  });

  it('denies capabilities bound to deprecated market makers when a registry is enforced', () => {
    const registry = new MarketMakerRegistry();
    registry.register({
      id: 'hrkey-v1',
      name: 'HRKey',
      version: '1.0.0',
      capabilities: ['employment'],
      status: 'deprecated',
      created_at: '2025-01-15T00:00:00Z'
    });
    const { capability, consent } = buildCapability({ marketMakerId: 'hrkey-v1' });

    const decision = evaluateCapabilityAccess({
      capability,
      consent,
      action: 'read',
      resource: `content:${CONTENT_REF}`,
      marketMakerId: 'hrkey-v1',
      marketMakerRegistry: registry,
      now: '2025-08-01T00:00:00Z'
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.MARKET_MAKER_DEPRECATED);
    expect(decision.metadata.marketMakerStatus).toBe('deprecated');
  });

  it('denies capabilities bound to revoked market makers when a registry is enforced', () => {
    const registry = new MarketMakerRegistry();
    registry.register({
      id: 'hrkey-v1',
      name: 'HRKey',
      version: '1.0.0',
      capabilities: ['employment'],
      status: 'revoked',
      created_at: '2025-01-15T00:00:00Z'
    });
    const { capability, consent } = buildCapability({ marketMakerId: 'hrkey-v1' });

    const decision = evaluateCapabilityAccess({
      capability,
      consent,
      action: 'read',
      resource: `content:${CONTENT_REF}`,
      marketMakerId: 'hrkey-v1',
      marketMakerRegistry: registry,
      now: '2025-08-01T00:00:00Z'
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.MARKET_MAKER_REVOKED);
    expect(decision.metadata.marketMakerStatus).toBe('revoked');
  });

  it('accepts capabilities with a registered market maker when a registry is enforced', () => {
    const registry = new MarketMakerRegistry();
    registry.register({
      id: 'hrkey-v1',
      name: 'HRKey',
      version: '1.0.0',
      capabilities: ['employment'],
      status: 'active',
      created_at: '2025-01-15T00:00:00Z'
    });
    const { capability, consent } = buildCapability({ marketMakerId: 'hrkey-v1' });

    const decision = evaluateCapabilityAccess({
      capability,
      consent,
      action: 'read',
      resource: `content:${CONTENT_REF}`,
      marketMakerId: 'hrkey-v1',
      marketMakerRegistry: registry,
      now: '2025-08-01T00:00:00Z'
    });

    expect(decision.allowed).toBe(true);
    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.ACCESS_ALLOWED);
  });

  it('denies when a bound market maker mismatches', () => {
    const { capability, consent } = buildCapability({ marketMakerId: 'hrkey-v1' });
    const decision = evaluateCapabilityAccess({
      capability,
      consent,
      action: 'read',
      resource: `content:${CONTENT_REF}`,
      marketMakerId: 'other-maker',
      marketMakerRegistry: buildTrustedMarketMakerRegistry('hrkey-v1'),
      now: '2025-08-01T00:00:00Z'
    });

    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.MARKET_MAKER_MISMATCH);
  });

  it('denies when consent and capability marketMakerId bindings mismatch', () => {
    const consent = buildConsentObject(
      SUBJECT,
      GRANTEE,
      'grant',
      [{ type: 'content', ref: CONTENT_REF }],
      ['read'],
      {
        now: CONSENT_NOW,
        expires_at: CONSENT_EXPIRES,
        marketMakerId: 'hrkey-v1'
      }
    );
    const capability = {
      ...mintCapabilityToken(
        consent,
        [{ type: 'content', ref: CONTENT_REF }],
        ['read'],
        TOKEN_EXPIRES,
        { now: TOKEN_NOW }
      ),
      marketMakerId: 'other-maker'
    };
    capability.capability_hash = computeCapabilityHash(
      canonicalizeCapabilityPayload({
        version: capability.version,
        subject: capability.subject,
        grantee: capability.grantee,
        consent_ref: capability.consent_ref,
        scope: capability.scope,
        permissions: capability.permissions,
        marketMakerId: capability.marketMakerId,
        issued_at: capability.issued_at,
        not_before: capability.not_before,
        expires_at: capability.expires_at,
        token_id: capability.token_id
      })
    );

    const decision = evaluateCapabilityAccess({
      capability,
      consent,
      action: 'read',
      resource: `content:${CONTENT_REF}`,
      marketMakerId: 'hrkey-v1',
      now: '2025-08-01T00:00:00Z'
    });

    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.CONSENT_MISMATCH);
  });

  it('denies with CONSENT_MISMATCH when capability subject mismatches the parent consent', () => {
    const { consent, capability } = buildCapability();
    const mismatchedCapability: any = {
      ...capability,
      subject: 'did:key:z6MkDifferentSubject1234567890abc'
    };
    mismatchedCapability.capability_hash = computeCapabilityHash(
      canonicalizeCapabilityPayload({
        version: mismatchedCapability.version as string,
        subject: mismatchedCapability.subject as string,
        grantee: mismatchedCapability.grantee as string,
        consent_ref: mismatchedCapability.consent_ref as string,
        scope: mismatchedCapability.scope as any,
        permissions: mismatchedCapability.permissions as any,
        issued_at: mismatchedCapability.issued_at as string,
        not_before: mismatchedCapability.not_before as string | null,
        expires_at: mismatchedCapability.expires_at as string,
        token_id: mismatchedCapability.token_id as string
      })
    );

    const decision = evaluateCapabilityAccess({
      capability: mismatchedCapability,
      consent,
      action: 'read',
      resource: `content:${CONTENT_REF}`,
      now: '2025-08-01T00:00:00Z'
    });

    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.CONSENT_MISMATCH);
  });

  it('denies malformed timestamps fail-closed', () => {
    const { capability, consent } = buildCapability({ expires_at: 'not-a-time' });
    const decision = evaluateCapabilityAccess({
      capability,
      consent,
      action: 'read',
      resource: `content:${CONTENT_REF}`,
      now: '2025-08-01T00:00:00Z'
    });

    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.CAPABILITY_INVALID);
  });

  it('denies when usage or policy hooks deny', () => {
    const { capability, consent } = buildCapability();
    const usageDecision = evaluateCapabilityAccess({
      capability,
      consent,
      action: 'read',
      resource: `content:${CONTENT_REF}`,
      now: '2025-08-01T00:00:00Z',
      hooks: {
        usage: () => ({
          allowed: false,
          reasonCode: capabilityAccessReasonCodes.USAGE_DENIED,
          reason: 'Usage quota exceeded.'
        })
      }
    });
    expect(usageDecision.reasonCode).toBe(capabilityAccessReasonCodes.USAGE_DENIED);

    const policyDecision = evaluateCapabilityAccess({
      capability,
      consent,
      action: 'read',
      resource: `content:${CONTENT_REF}`,
      now: '2025-08-01T00:00:00Z',
      hooks: {
        policy: () => ({
          allowed: false,
          reasonCode: capabilityAccessReasonCodes.POLICY_DENIED,
          reason: 'Policy denied the request.'
        })
      }
    });
    expect(policyDecision.reasonCode).toBe(capabilityAccessReasonCodes.POLICY_DENIED);
  });

  it('classifies structured integrity failures without relying on message fragments', () => {
    expect(
      evaluateCapabilityAccess({
        capability: undefined,
        action: 'read',
        resource: `content:${CONTENT_REF}`,
        now: '2025-08-01T00:00:00Z'
      }).reasonCode
    ).toBe(capabilityAccessReasonCodes.CAPABILITY_MISSING);

    expect(
      evaluateCapabilityAccess({
        capability: buildCapability({ permissions: [] }).capability,
        action: 'read',
        resource: `content:${CONTENT_REF}`,
        now: '2025-08-01T00:00:00Z'
      }).reasonCode
    ).toBe(capabilityAccessReasonCodes.CAPABILITY_INVALID);

    expect(
      evaluateCapabilityAccess({
        capability: buildCapability().capability,
        action: '',
        resource: `content:${CONTENT_REF}`,
        now: '2025-08-01T00:00:00Z'
      }).reasonCode
    ).toBe(capabilityAccessReasonCodes.ACTION_MISSING);

    expect(
      evaluateCapabilityAccess({
        capability: buildCapability().capability,
        action: 'read',
        resource: 'bad-resource',
        now: '2025-08-01T00:00:00Z'
      }).reasonCode
    ).toBe(capabilityAccessReasonCodes.RESOURCE_MISSING);

    expect(
      evaluateCapabilityAccess({
        capability: buildCapability().capability,
        consent: { ...buildConsent(), subject: 'not-a-did' } as any,
        action: 'read',
        resource: `content:${CONTENT_REF}`,
        now: '2025-08-01T00:00:00Z'
      }).reasonCode
    ).toBe(capabilityAccessReasonCodes.CONSENT_INVALID);
  });

  it('fails closed with usage-stage INTERNAL_EVALUATION_ERROR when the usage hook throws', () => {
    const { capability, consent } = buildCapability();
    const decision = evaluateCapabilityAccess({
      capability,
      consent,
      action: 'read',
      resource: `content:${CONTENT_REF}`,
      now: '2025-08-01T00:00:00Z',
      hooks: {
        usage: () => {
          throw new Error('usage boom');
        }
      }
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.INTERNAL_EVALUATION_ERROR);
    expect(decision.metadata.failureStage).toBe('usage');
  });

  it('fails closed with policy-stage INTERNAL_EVALUATION_ERROR when the policy hook throws', () => {
    const { capability, consent } = buildCapability();
    const decision = evaluateCapabilityAccess({
      capability,
      consent,
      action: 'read',
      resource: `content:${CONTENT_REF}`,
      now: '2025-08-01T00:00:00Z',
      hooks: {
        policy: () => {
          throw new Error('policy boom');
        }
      }
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.INTERNAL_EVALUATION_ERROR);
    expect(decision.metadata.failureStage).toBe('policy');
  });

  it('denies when supplied consent mismatches capability provenance', () => {
    const { capability, consent } = buildCapability();
    const otherConsent = buildConsentObject(
      SUBJECT,
      GRANTEE,
      'grant',
      [{ type: 'content', ref: CONTENT_REF }],
      ['read'],
      { now: new Date('2025-02-01T00:00:00Z'), expires_at: CONSENT_EXPIRES }
    );

    const decision = evaluateCapabilityAccess({
      capability,
      consent: otherConsent,
      action: 'read',
      resource: `content:${CONTENT_REF}`,
      now: '2025-08-01T00:00:00Z'
    });

    expect(decision.reasonCode).toBe(capabilityAccessReasonCodes.CONSENT_MISMATCH);
  });
});
