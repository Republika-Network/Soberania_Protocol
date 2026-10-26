export { evaluateCapabilityAccess } from '../capabilities/core/evaluateCapabilityAccess';
export {
  consumeCapabilityAccess,
  InMemoryRateLimitRegistry,
  InMemoryConsentUsageRegistry
} from '../capabilities/runtime/consumeCapabilityAccess';

export {
  mintCapabilityToken,
  validateCapabilityToken,
  verifyCapabilityToken
} from '../capabilities/tokens/capabilityToken';

export {
  buildConsentObject,
  validateConsentObject
} from '../../consent/consentObject';

export {
  signConsentObject,
  verifyConsentObjectProof
} from '../../consent/signing';
export { createDidKeySigner, didKeyFromEd25519Key } from '../../consent/proof';
export type { ConsentSubjectSigner, SubjectConsentProofV1 } from '../../consent/proof';

export { MarketMakerRegistry } from '../capabilities/market/marketMakerRegistry';
export { InMemoryRevocationRegistry } from '../../capability/registries/InMemoryRevocationRegistry';
export type { RevocationRegistry, ConsentRevocationRecord } from '../../capability/registries/RevocationRegistry';
export {
  executeCapabilityFlow
} from './executeCapabilityFlow';

export type {
  ExecuteCapabilityFlowRequest,
  ExecuteCapabilityFlowResponse
} from './executeCapabilityFlow';

export { interpretWithCapability } from '../capabilities/interpreter/interpretWithCapability';

export type {
  CapabilityAccessDecision,
  CapabilityAccessRequest,
  CapabilityAccessReasonCode,
  CapabilityResource
} from '../capabilities/core';

export type {
  CapabilityConsumptionDecision,
  CapabilityConsumptionRequest,
  CapabilityConsumptionReasonCode,
  RateLimitConfig,
  RateLimitRegistry,
  RateLimitState
} from '../capabilities/runtime';

export type { CapabilityTokenV1, MintCapabilityOptions, ScopeEntry as CapabilityScopeEntry } from '../../capability/types';

export type {
  BuildConsentOptions,
  ConsentObjectV1,
  ScopeEntry as ConsentScopeEntry
} from '../../consent/types';

export type {
  MarketMaker,
  MarketMakerStatus
} from '../../shared/marketMakerRegistry';
