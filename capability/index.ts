export {
  mintCapabilityToken,
  validateCapabilityToken,
  verifyCapabilityToken,
  resetNonceRegistry
} from './capabilityToken';
export { buildCapabilityId } from './capabilityId';
export { canonicalizeCapabilityPayload } from './canonical';
export type { CapabilityPayload } from './canonical';
export { computeCapabilityHash } from './hash';
export {
  revokeCapabilityToken,
  isRevoked,
  revokeConsent,
  isConsentHashRevoked,
  readRevocation
} from './revocation';
export type { RevocationReading } from './revocation';
export { InMemoryRevocationRegistry } from './registries/InMemoryRevocationRegistry';
export type { RevocationRegistry, ConsentRevocationRecord } from './registries/RevocationRegistry';
export type {
  CapabilityTokenV1,
  MintCapabilityOptions,
  ScopeEntry
} from './types';
