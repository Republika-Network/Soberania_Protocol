export { createHRKeyAdapter } from './aocVaultAdapter';
export type {
  IHRKeyVaultAdapter,
  RegisterPackInput,
  RegisterPackResult,
  GrantConsentInput,
  GrantConsentResult,
  SignedConsentInput,
  MintCapabilityInput,
  MintCapabilityResult,
  AccessRequestInput,
  CandidateDID,
  EmployerDID,
  HRKeySDLPath,
} from './types';

// Re-export AOC types that HRKey needs to construct inputs.
export type {
  ScopeEntry,
  ConsentObjectV1,
  CapabilityTokenV1,
  PackManifestV1,
  FieldReference,
  VaultAccessResult,
  VaultPolicyDecision,
  VaultErrorCode,
  ResolvedField,
  UnresolvedField,
} from './types';

export { HrkeyPayoutEngine } from './payoutEngine';
export type { HrkeyPayoutEngineOptions } from './payoutEngine';
