export type {
  RevocableSubjectType,
  RevocationErrorCode,
  RevocationFailureCategory,
  RevocationStatus,
  VerifiedNotRevokedStatus,
  RevokedStatus,
  UnknownRevocationStatus,
  MaterialActionDecision,
} from './revocation-types';
export { REVOCATION_ERROR_CODES } from './revocation-types';

export {
  resolveMaterialActionDecision,
  isRevocationBlocking,
  verifiedNotRevokedStatus,
  revokedStatus,
  unavailableRevocationStatus,
  revocationLookupFailedStatus,
  revocationLookupTimeoutStatus,
  revocationPermissionDeniedStatus,
  revocationRecordMalformedStatus,
  revocationAuthorityMismatchStatus,
  revocationTrustDomainMismatchStatus,
  revocationSubjectMismatchStatus,
  revocationUnsupportedVersionStatus,
  mapRevocationStatusToHttpStatus,
} from './revocation-policy';

export type {
  RevocationCheckPort,
  RevocationSubjectRef,
  BooleanRevocationRegistry,
  CapabilityModelRevocationRegistry,
} from './revocation-check';
export {
  createRegistryRevocationCheck,
  createCapabilityRevocationCheck,
  createStaticRevocationCheck,
  withRevocationTimeout,
  ALWAYS_UNKNOWN_REVOCATION_CHECK,
} from './revocation-check';

export type { RevocationTelemetryEvent, RevocationTelemetryHook } from './revocation-telemetry';
export { REVOCATION_TELEMETRY_EVENTS, emitRevocationTelemetry, redactRevocationTelemetryPayload } from './revocation-telemetry';
