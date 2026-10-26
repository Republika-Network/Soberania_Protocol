import { generateKeyPairSync } from 'crypto';
import {
  InMemoryRevocationRegistry,
  MarketMakerRegistry,
  buildConsentObject,
  createDidKeySigner,
  signConsentObject,
  consumeCapabilityAccess,
  evaluateCapabilityAccess,
  executeCapabilityFlow,
  interpretWithCapability,
  mintCapabilityToken
} from '../aoc/sdk';

// The subject's key stays in the subject's wallet; it is generated here only
// to keep the example self-contained.
const subjectSigner = createDidKeySigner(generateKeyPairSync('ed25519').privateKey);
const SUBJECT = subjectSigner.did;
const MARKET_MAKER_DID = 'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH';
const MARKET_MAKER_ID = 'hrkey-v1';
const CONTENT_REF = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const NOW = '2025-06-15T10:00:00Z';

// Every authorization decision reads revocation from an injected registry; there is no default.
const revocations = new InMemoryRevocationRegistry();
const marketMakers = new MarketMakerRegistry();
marketMakers.register({
  id: MARKET_MAKER_ID,
  name: 'HRKey',
  version: '1.0.0',
  capabilities: ['content.read'],
  endpoint: 'https://api.hrkey.example/capabilities',
  status: 'active',
  created_at: NOW
});

// A consent grants nothing until its subject signs it.
const consent = signConsentObject(buildConsentObject(
  SUBJECT,
  MARKET_MAKER_DID,
  'grant',
  [{ type: 'content', ref: CONTENT_REF }],
  ['read'],
  {
    now: new Date(NOW),
    expires_at: '2025-06-15T10:05:00Z',
    marketMakerId: MARKET_MAKER_ID
  }
), subjectSigner);

const capability = mintCapabilityToken(
  consent,
  [{ type: 'content', ref: CONTENT_REF }],
  ['read'],
  '2025-06-15T10:05:00Z',
  { now: new Date(NOW) }
);

// ------------------------------
// 1) Low-level explicit flow
// ------------------------------
const evaluation = evaluateCapabilityAccess({
  capability,
  consent,
  action: 'read',
  resource: { type: 'content', ref: CONTENT_REF },
  marketMakerId: MARKET_MAKER_ID,
  marketMakerRegistry: marketMakers,
  registries: { revocationRegistry: revocations },
  now: NOW
});

if (!evaluation.allowed) {
  throw new Error(`Evaluation denied: ${evaluation.reasonCode} (${evaluation.reason})`);
}

const consumption = consumeCapabilityAccess({
  capability,
  consent,
  action: 'read',
  resource: { type: 'content', ref: CONTENT_REF },
  marketMakerId: MARKET_MAKER_ID,
  marketMakerRegistry: marketMakers,
  registries: { revocationRegistry: revocations },
  now: NOW
});

if (!consumption.allowed) {
  throw new Error(`Consumption denied: ${consumption.reasonCode} (${consumption.reason})`);
}

const explicitInterpretation = interpretWithCapability(
  {
    capability,
    consent,
    action: 'read',
    resource: `content:${CONTENT_REF}`,
    now: NOW,
    input: {
      query: 'Summarize the content for hiring readiness.',
      context: {
        resources: {
          [`content:${CONTENT_REF}`]: {
            profile: {
              yearsExperience: 6,
              domains: ['payments', 'identity']
            }
          }
        }
      }
    }
  },
  {
    marketMakerRegistry: marketMakers
  }
);

// ------------------------------
// 2) Simplified wrapper flow
// ------------------------------
const wrapped = executeCapabilityFlow({
  capability,
  consent,
  action: 'read',
  resource: { type: 'content', ref: CONTENT_REF },
  marketMakerId: MARKET_MAKER_ID,
  marketMakerRegistry: marketMakers,
  registries: { revocationRegistry: revocations },
  now: NOW,
  interpreter: {
    enabled: true,
    query: 'Summarize the content for hiring readiness.',
    context: {
      resources: {
        [`content:${CONTENT_REF}`]: {
          profile: {
            yearsExperience: 6,
            domains: ['payments', 'identity']
          }
        }
      }
    }
  }
});

console.log({
  lowLevel: {
    evaluationAllowed: evaluation.allowed,
    consumptionAllowed: consumption.allowed,
    interpreterAllowed: explicitInterpretation.allowed
  },
  wrapper: {
    allowed: wrapped.allowed,
    stage: wrapped.stage,
    reasonCode: wrapped.reasonCode,
    reason: wrapped.reason
  }
});
