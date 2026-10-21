export type { SovereignSigningKey, SovereignKeyPair, SovereignProof } from './proof';
export { deriveSovereignKeyId, generateSovereignKeyPair, signSovereignPayload, verifySovereignSignature } from './proof';

export { SovereignAssetState, isValidSovereignAssetState } from './state';

export type { OriginClaim, AuthorityClaim, BuildOriginClaimInput, BuildAuthorityClaimInput } from './claims';
export { AuthorityClaimKind, buildOriginClaim, buildAuthorityClaim } from './claims';
export type { SignedClaim, SignedClaimVerificationResult, ContestClaimInput } from './claims';
export { signClaim, verifySignedClaim, contestClaim } from './claims';

// --- SM-05: first-class derivation assertions and lineage -------------------

export type { DerivationClaim, BuildDerivationClaimInput, ClaimValidationResult } from './claims';
export {
  DERIVATION_RELATION_KINDS,
  DerivationRelationKind,
  buildDerivationClaim,
  isValidAuthorityClaim,
  isValidDerivationClaim,
  isValidOriginClaim,
  validateAuthorityClaim,
  validateDerivationClaim,
  validateOriginClaim,
} from './claims';

export type {
  SovereignLineageDirection,
  SovereignLineageEdge,
  SovereignLineageNode,
  SovereignLineageTrace,
  SovereignLineageTraceSchemaVersion,
  TraceSovereignLineageInput,
  TraceSovereignLineageValidationResult,
} from './lineage';
export {
  DEFAULT_SOVEREIGN_LINEAGE_MAX_DEPTH,
  SOVEREIGN_LINEAGE_DIRECTIONS,
  SOVEREIGN_LINEAGE_TRACE_SCHEMA_VERSION,
  isValidSovereignLineageMaxDepth,
  isValidTraceSovereignLineageInput,
  traceSovereignLineage,
  validateTraceSovereignLineageInput,
} from './lineage';

export {
  SOVEREIGN_MANIFEST_SCHEMA_VERSION,
} from './manifest';
export type {
  SovereignManifestSchemaVersion,
  SovereignRegistrant,
  SovereignManifestV1,
  SignedSovereignManifest,
  BuildSovereignManifestV1Input,
  ManifestValidationResult,
} from './manifest';
export { validateSovereignManifestV1, buildSovereignManifestV1, computeManifestDigest, signSovereignManifest } from './manifest';

export type {
  CheckOutcome,
  BindingOutcome,
  SovereignManifestVerificationChecks,
  SovereignManifestVerificationResult,
  VerifySovereignManifestOptions,
} from './verify';
export { verifySovereignManifest } from './verify';

// --- SM-08: signed sovereign claim verification -----------------------------

export type {
  SovereignClaimVerificationChecks,
  SovereignClaimVerificationResult,
  VerifiableSovereignClaim,
  VerifySignedSovereignClaimOptions,
} from './verify';
export { verifySignedSovereignClaim } from './verify';

export type { SovereignAssetRegistry } from './registry';
export { resolveSovereignAsset, resolveSovereignAssetVersion } from './registry';
