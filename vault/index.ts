export { createInMemoryVault } from './vault';
export type {
  Vault,
  VaultStore,
  VaultError,
  VaultErrorCode,
  VaultAccessRequest,
  VaultAccessResult,
  VaultPolicyDecision,
  VaultOptions,
  ResolvedField,
  UnresolvedField
} from './types';

export {
  MEMORY_CATEGORIES,
  RETENTION_CLASSES,
  GOVERNANCE_CRITICALITY_LEVELS,
  classifyMemory,
  inferRetentionClass,
  inferDecayEligibility,
  inferCompressionEligibility,
  createMemoryMetadata
} from './memoryTaxonomy';
export type {
  MemoryCategory,
  RetentionClass,
  GovernanceCriticality,
  MemoryMetadata,
  ClassifyMemoryInput
} from './memoryTaxonomy';
export * from './contentOwnership';
