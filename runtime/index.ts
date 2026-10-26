/**
 * Public Runtime Surface (stable)
 *
 * This module is the stable entrypoint intended for SDK/application consumers.
 * Internal and experimental runtime modules are intentionally excluded and are
 * available only through dedicated entrypoints.
 *
 * `createRuntimeServer` and the HMAC capability-token enforcement path
 * (`enforceCapabilityAccess`, formerly re-exported here via `export * from
 * './enforcement'`) are deliberately NOT exported from this stable surface — see
 * docs/security/revocation/14-independent-review.md §Part 1/2. Since SOBE-SEC-03J the
 * HMAC path is disabled outright: `authorizeWithCapability` never allows
 * (`CAPABILITY_PATH_DISABLED`), is no longer exported from `protocol/consent`, and
 * `enforceCapabilityAccess` has no soft mode and is exported from no surface at all
 * (only `runtime/api/server.ts` imports it by file path, where it denies every request).
 * `createRuntimeServer` remains available, explicitly labeled non-stable, via `./internal`.
 * `scripts/check-runtime-export-governance.mjs` fails CI if any of this is re-added.
 */

export { HostedRuntimeClient } from './sdk/client';
export type { HostedRuntimeSdk, HostedRuntimeClientOptions, PayoutCallbackResult } from './sdk/client';
export { InMemoryApiKeyStore, canActFor, toRuntimeCaller } from './auth/apiKeys';
export type { ApiKeyRecord, ApiKeyRole, ApiTier, RuntimeCaller } from './auth/apiKeys';
export { InMemoryRateLimiter } from './limits/rateLimiter';
export { RuntimeLogger } from './logging/logger';
export { InMemoryTrustService, DEFAULT_TRUST_ISSUERS } from './trust/service';

export type {
  AocIdentityConsentRecord,
  AocIdentityCredentialRecord,
  AocIdentityIssuerRecord,
  IdentityVerificationResult,
  RlusdWithdrawalRequest,
  TrustAuditEvent,
} from './trust/types';

export type { ApiRequest, ApiResponse, ErrorResponse, RuntimeEndpoint } from './types/api-types';
export type { PrincipalId, TenantId, ActorKind, RuntimeIdentity, CanonicalPrincipalContext, LegacyPrincipalAliases } from './identity';
export { normalizePrincipalContext } from './identity';

export type { PayoutCallbackInput, PayoutExecuteResult, PayoutAuditEvent } from './payout/types';
export type { DataAccessAuditEvent, DataAccessDecision, DataAccessRequestInput, AccessTokenRecord } from './access/types';
export type { GetUsageSummaryInput, ListAuditEventsInput } from './sdk/client';

export { InMemoryUsageService, UNIT_PRICES } from './usage';
export { InMemoryMonetizationService, InMemoryPricingRegistry } from './monetization';

export type {
  PricingRule,
  BillableEvent,
  BillableEventQuery,
  ConsumerBillingSummary,
  MonetizationUsageEvent,
} from './monetization';

export type {
  MeteredRuntimeEndpoint,
  UsageDecision,
  UsageRecord,
  UsageSummaryItem,
  UsageSummaryQuery,
  UsageSummaryResult,
} from './usage';

export * from './audit';

export { RUNTIME_TRANSPORT_VERSION } from './versioning';
export { RUNTIME_HANDSHAKE_PATH, buildMetadata, toErrorEnvelope } from './types/transport';
export type { RuntimeTransportMetadata, RuntimeRequestEnvelope, RuntimeResponseEnvelope, RuntimeErrorEnvelope, RuntimeHandshakeEnvelope, RuntimeErrorCode } from './types/transport';

export * from './observability';
