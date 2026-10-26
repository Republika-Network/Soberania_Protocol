// Canonical identity note: runtime APIs preserve legacy wire fields while mapping to principal semantics.
import { authorizeExecution, type ExecutionAuthorizationResult } from '../../protocol/execution';
import { evaluateEnforcement, type EnforcementDecision } from '../../protocol/enforcement';
import { mintCapability, type ProtocolCapability } from '../../protocol/capability';
import { InMemoryRevocationRegistry, type RevocationRegistry } from '../../capability';
import { createCapabilityRevocationCheck } from '../../protocol/revocation';
import { DataAccessService } from '../access/service';
import type { DataAccessDecision, DataAccessRequestInput } from '../access/types';
import { RuntimeAuditService, type ListAuditEventsInput, type RuntimeAuditEvent } from '../audit/service';
import { InMemoryAuditService } from '../audit/service';
import { RlusdPayoutAdapter } from '../payout/payoutAdapters/rlusd.adapter';
import { RlusdPayoutExecutorService } from '../payout/rlusdPayoutExecutor.service';
import type { PayoutCallbackInput, PayoutExecuteResult } from '../payout/types';
import { InMemoryTrustService, type GrantConsentInput, type RegisterCredentialInput, type VerifyIdentityInput } from '../trust/service';
import type {
  AocIdentityConsentRecord,
  AocIdentityCredentialRecord,
  IdentityVerificationResult,
  RlusdWithdrawalRequest,
} from '../trust/types';
import type { ApiResponse, RuntimeEndpoint } from '../types/api-types';
import { canActFor, type RuntimeCaller } from '../auth/apiKeys';
import { InMemoryUsageService, isMeteredEndpoint } from '../usage';
import { InMemoryMonetizationService, InMemoryPricingRegistry, type PricingRule } from '../monetization';
import type { MeteredRuntimeEndpoint, UsageSummaryResult } from '../usage';
import {
  AccessGrantRevocationUnauthorizedError,
  ControlPlaneService,
  RevocationIdempotencyConflictError,
  type AccessRequest,
  type ConsentDecision,
  type GrantedAccess,
  type RevokeGrantResult,
} from '../controlPlane';
import { normalizePolicyDecision } from '../policy';
import { normalizeReasonCode } from '../governance/reason-codes';

/**
 * Revocation for `/enforcement/evaluate`, `/execution/authorize` and `/capability/mint` is
 * resolved server-side from the core's revocation registry (see
 * docs/security/revocation/04-status-contract.md): one registry answers both the
 * `capability_grant` (token hash) and `consent_grant` (consent hash) subjects, so a consent its
 * subject revoked denies every capability minted from it and blocks new mints. The check is
 * built per core inside `executeRoute`; nothing is read from a process-global registry, and a
 * client-supplied `checkConsentRevocation`/`isRevoked` field in the JSON is overwritten.
 */

/**
 * ADR §13 / docs/security/revocation/08-billing-safety-override.md: security containment
 * operations must never be blocked by billing or entitlement state. `/access/grant/revoke` is
 * deliberately absent from DEFAULT_PRICING_RULES and from `isMeteredEndpoint` — do not add it.
 */
const CONTAINMENT_ENDPOINTS: readonly RuntimeEndpoint[] = ['/access/grant/revoke'];

export function isContainmentEndpoint(endpoint: RuntimeEndpoint): boolean {
  return CONTAINMENT_ENDPOINTS.includes(endpoint);
}

export type RuntimeCore = {
  evaluateEnforcement: typeof evaluateEnforcement;
  authorizeExecution: typeof authorizeExecution;
  mintCapability: typeof mintCapability;
  trustService: InMemoryTrustService;
  payoutExecutor: RlusdPayoutExecutorService;
  dataAccessService: DataAccessService;
  auditService: RuntimeAuditService;
  usageService: InMemoryUsageService;
  monetizationService: InMemoryMonetizationService;
  capabilityAuditService: InMemoryAuditService;
  controlPlaneService: ControlPlaneService;
  /** Revocation authority for capabilities and consents. Single-process in the default core. */
  revocationRegistry: RevocationRegistry;
  /**
   * The trusted clock every time-bound decision is made at. Callers never supply it: a `now`
   * in a request body is refused. Tests and trusted embedders inject it here.
   */
  now: () => Date;
};

const DEFAULT_PRICING_RULES: PricingRule[] = [
  { resource: '/data/access', action: 'execute', unit_price: 0.05, currency: 'AOC' },
  { resource: '/payout/execute', action: 'execute', unit_price: 0.25, currency: 'AOC' },
  { resource: '/trust/verify', action: 'execute', unit_price: 0, currency: 'AOC' },
];

const defaultTrustService = new InMemoryTrustService();
const defaultPayoutExecutor = new RlusdPayoutExecutorService(defaultTrustService, new RlusdPayoutAdapter());
const defaultDataAccessService = new DataAccessService(defaultTrustService);
const defaultAuditService = new RuntimeAuditService(defaultTrustService, defaultPayoutExecutor, defaultDataAccessService);
const defaultUsageService = new InMemoryUsageService();
const defaultMonetizationService = new InMemoryMonetizationService(new InMemoryPricingRegistry(DEFAULT_PRICING_RULES));
const defaultCapabilityAuditService = new InMemoryAuditService();
const defaultControlPlaneService = new ControlPlaneService();

const ROUTE_ERRORS = {
  invalidRequest: 'INVALID_REQUEST',
  executionError: 'EXECUTION_ERROR',
  routeNotFound: 'ROUTE_NOT_FOUND',
  protocolError: 'PROTOCOL_ERROR',
  callerNotAuthorized: 'CALLER_NOT_AUTHORIZED',
} as const;

function field(payload: unknown, name: string): unknown {
  return payload !== null && typeof payload === 'object' ? (payload as Record<string, unknown>)[name] : undefined;
}

/**
 * Principals named in `payload` that the caller must be allowed to act for,
 * per endpoint. Identities in the request body are claims; only the caller's
 * API key record (its principals and roles) decides whom it may represent.
 * `undefined` means the endpoint is restricted to admin callers.
 */
function requiredPrincipals(endpoint: RuntimeEndpoint, payload: unknown): unknown[] | undefined {
  switch (endpoint) {
    case '/enforcement/evaluate':
    case '/execution/authorize':
      return [field(payload, 'grantee')];
    case '/capability/mint':
      return [field(field(payload, 'consent'), 'subject')];
    case '/access/request':
      return [field(payload, 'requester_id')];
    case '/access/requests':
    case '/access/request/decision':
      return [field(payload, 'subject_id')];
    case '/access/grants/active': {
      const named = [field(payload, 'subject_id'), field(payload, 'requester_id')].filter((value) => value !== undefined);
      return named.length > 0 ? named : [undefined];
    }
    case '/access/grant/revoke':
      // Identifiers named in the body must be the caller's own; authority over the grant itself is
      // decided by ControlPlaneService against the stored grant's subject and requester.
      return [field(payload, 'subject_id'), field(payload, 'requester_id')].filter((value) => value !== undefined);
    case '/data/access':
    case '/payout/execute':
    case '/trust/verify':
    case '/usage/summary':
      return [field(payload, 'consumer_id')];
    case '/audit/events': {
      const named = [field(payload, 'subject_hash'), field(payload, 'consumer_id')].filter((value) => value !== undefined);
      return named.length > 0 ? named : [undefined];
    }
    // Issuer authentication for these is a signature checked by the trust service.
    case '/trust/credential/register':
    case '/trust/consent/grant':
      return [];
    default:
      return undefined;
  }
}

function authorizeCaller(endpoint: RuntimeEndpoint, payload: unknown, caller: RuntimeCaller | undefined): ApiResponse<never> | undefined {
  if (caller === undefined) {
    return failure(ROUTE_ERRORS.callerNotAuthorized, 'An authenticated caller is required.');
  }
  const principals = requiredPrincipals(endpoint, payload);
  const allowed = principals === undefined ? canActFor(caller, undefined) : principals.every((principal) => canActFor(caller, principal));
  return allowed ? undefined : failure(ROUTE_ERRORS.callerNotAuthorized, `Caller ${caller.owner} may not act for the principals named in this request.`);
}

export const DEFAULT_RUNTIME_CORE: RuntimeCore = {
  evaluateEnforcement,
  authorizeExecution,
  mintCapability,
  trustService: defaultTrustService,
  payoutExecutor: defaultPayoutExecutor,
  dataAccessService: defaultDataAccessService,
  auditService: defaultAuditService,
  usageService: defaultUsageService,
  monetizationService: defaultMonetizationService,
  capabilityAuditService: defaultCapabilityAuditService,
  controlPlaneService: defaultControlPlaneService,
  revocationRegistry: new InMemoryRevocationRegistry(),
  now: () => new Date(),
};

/** Endpoints whose decision depends on the evaluation time. They run at the core's clock only. */
const CLOCK_BOUND_ENDPOINTS: readonly RuntimeEndpoint[] = [
  '/enforcement/evaluate',
  '/execution/authorize',
  '/trust/verify',
  '/data/access',
  '/payout/execute',
];

/**
 * A caller-supplied `now` is refused rather than ignored: a client that relied on it (to revive
 * an expired consent, capability or credential with a past timestamp) fails visibly instead of
 * silently getting a server-clock decision it did not expect.
 */
function callerClockDenial(endpoint: RuntimeEndpoint, payload: unknown): ApiResponse<never> | undefined {
  if (!CLOCK_BOUND_ENDPOINTS.includes(endpoint)) return undefined;
  if (payload !== null && typeof payload === 'object' && 'now' in (payload as Record<string, unknown>)) {
    return failure(ROUTE_ERRORS.invalidRequest, 'now is not accepted; the evaluation time is the server clock.');
  }
  return undefined;
}

function atServerClock<T extends Record<string, unknown>>(payload: T, core: RuntimeCore): T & { now: Date } {
  return { ...payload, now: core.now() };
}

function success<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

function failure(code: string, message: string): ApiResponse<never> {
  return { success: false, error: { code, message } };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNumericString(value: unknown): value is string {
  return typeof value === 'string' && /^\d+(\.\d+)?$/.test(value.trim());
}

function parseOptionalDate(input: unknown): Date | undefined {
  if (input === undefined) {
    return undefined;
  }
  if (input instanceof Date) {
    return input;
  }
  if (typeof input !== 'string') {
    return undefined;
  }

  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed;
}

function parseOptionalMeteredEndpoint(input: unknown): MeteredRuntimeEndpoint | undefined {
  if (input === undefined) {
    return undefined;
  }
  if (input !== '/data/access' && input !== '/payout/execute' && input !== '/trust/verify') {
    return undefined;
  }
  return input;
}

function fromBooleanDecision(allowed: boolean, reasonCode: string): { decision: 'allow' | 'deny'; reasonCode: string } {
  return { decision: normalizePolicyDecision(allowed ? 'allowed' : 'denied'), reasonCode: normalizeReasonCode(reasonCode) };
}

export function deriveDecision(endpoint: RuntimeEndpoint, data: unknown): { decision: 'allow' | 'deny'; reasonCode: string } {
  if (endpoint === '/enforcement/evaluate') {
    const enforcement = data as EnforcementDecision;
    return fromBooleanDecision(enforcement.allowed, enforcement.reason_code);
  }

  if (endpoint === '/execution/authorize') {
    const execution = data as ExecutionAuthorizationResult;
    return fromBooleanDecision(execution.authorized, execution.reason_code);
  }
  if (endpoint === '/trust/verify') {
    const verification = data as IdentityVerificationResult;
    return fromBooleanDecision(verification.valid, verification.reason_code);
  }
  if (endpoint === '/trust/credential/register') {
    return { decision: 'allow', reasonCode: 'CREDENTIAL_REGISTERED' };
  }
  if (endpoint === '/trust/consent/grant') {
    return { decision: 'allow', reasonCode: 'CONSENT_GRANTED' };
  }
  if (endpoint === '/payout/execute') {
    const payout = data as { allowed: boolean; reason_code: string };
    return fromBooleanDecision(payout.allowed, payout.reason_code);
  }
  if (endpoint === '/payout/callback') {
    const callback = data as { received: true; reason_code: string };
    return fromBooleanDecision(callback.received, callback.reason_code);
  }
  if (endpoint === '/data/access') {
    const access = data as { allowed: boolean; reason_code: string };
    return fromBooleanDecision(access.allowed, access.reason_code);
  }
  if (endpoint === '/capability/mint') {
    return { decision: 'allow', reasonCode: 'CAPABILITY_MINTED' };
  }
  if (endpoint === '/access/request') {
    return { decision: 'allow', reasonCode: 'ACCESS_REQUEST_CREATED' };
  }
  if (endpoint === '/access/requests') {
    return { decision: 'allow', reasonCode: 'ACCESS_REQUESTS_LISTED' };
  }
  if (endpoint === '/access/request/decision') {
    const result = data as { decision: { decision: 'approve' | 'deny' } };
    return { decision: 'allow', reasonCode: result.decision.decision === 'approve' ? 'ACCESS_REQUEST_APPROVED' : 'ACCESS_REQUEST_DENIED' };
  }
  if (endpoint === '/access/grants/active') {
    return { decision: 'allow', reasonCode: 'ACTIVE_GRANTS_LISTED' };
  }
  if (endpoint === '/access/grant/revoke') {
    return { decision: 'allow', reasonCode: 'GRANT_REVOKED' };
  }
  if (endpoint === '/audit/events') {
    return { decision: 'allow', reasonCode: 'AUDIT_EVENTS_LISTED' };
  }
  if (endpoint === '/usage/summary') {
    return { decision: 'allow', reasonCode: 'USAGE_SUMMARY_LISTED' };
  }

  const knownEndpoints: RuntimeEndpoint[] = [
    '/enforcement/evaluate',
    '/execution/authorize',
    '/capability/mint',
    '/access/request',
    '/access/requests',
    '/access/request/decision',
    '/access/grants/active',
    '/access/grant/revoke',
    '/payout/execute',
    '/payout/callback',
    '/trust/credential/register',
    '/trust/verify',
    '/trust/consent/grant',
    '/data/access',
    '/audit/events',
    '/usage/summary',
  ];

  if (!knownEndpoints.includes(endpoint)) {
    return {
      decision: 'deny',
      reasonCode: 'UNKNOWN_ENDPOINT',
    };
  }

  return {
    decision: 'allow',
    reasonCode: 'UNHANDLED_ENDPOINT',
  };
}

export function executeRoute(
  endpoint: RuntimeEndpoint,
  payload: unknown,
  core: RuntimeCore = DEFAULT_RUNTIME_CORE,
  caller?: RuntimeCaller
): ApiResponse<
  | EnforcementDecision
  | ExecutionAuthorizationResult
  | ProtocolCapability
  | AocIdentityCredentialRecord
  | IdentityVerificationResult
  | AocIdentityConsentRecord
  | PayoutExecuteResult
  | DataAccessDecision
  | AccessRequest
  | AccessRequest[]
  | { request: AccessRequest; decision: ConsentDecision; grant?: GrantedAccess }
  | GrantedAccess
  | GrantedAccess[]
  | RevokeGrantResult
  | { received: true; reason_code: string }
  | { events: RuntimeAuditEvent[] }
  | UsageSummaryResult
> {
  const callerDenial = authorizeCaller(endpoint, payload, caller);
  if (callerDenial !== undefined) {
    return callerDenial;
  }

  const clockDenial = callerClockDenial(endpoint, payload);
  if (clockDenial !== undefined) {
    return clockDenial;
  }

  const revocationCheck = createCapabilityRevocationCheck(core.revocationRegistry);

  try {
    switch (endpoint) {
      case '/enforcement/evaluate':
        return success(
          core.evaluateEnforcement(
            atServerClock(payload as Parameters<typeof evaluateEnforcement>[0], core),
            revocationCheck
          )
        );
      case '/execution/authorize':
        return success(
          core.authorizeExecution(
            atServerClock(payload as Parameters<typeof authorizeExecution>[0], core),
            revocationCheck
          )
        );
      case '/capability/mint':
        return success(
          core.mintCapability({
            ...(payload as Parameters<typeof mintCapability>[0]),
            checkConsentRevocation: revocationCheck,
          })
        );
      case '/access/request': {
        const request = payload as {
          subject_id?: string;
          requester_id?: string;
          dataset_id?: string;
          purpose?: string;
          requested_scope?: string[];
        };
        if (!isNonEmptyString(request.subject_id)) {
          return failure(ROUTE_ERRORS.invalidRequest, 'subject_id is required.');
        }
        if (!isNonEmptyString(request.requester_id)) {
          return failure(ROUTE_ERRORS.invalidRequest, 'requester_id is required.');
        }
        if (!isNonEmptyString(request.dataset_id)) {
          return failure(ROUTE_ERRORS.invalidRequest, 'dataset_id is required.');
        }
        if (!isNonEmptyString(request.purpose)) {
          return failure(ROUTE_ERRORS.invalidRequest, 'purpose is required.');
        }
        if (request.requested_scope !== undefined && !Array.isArray(request.requested_scope)) {
          return failure(ROUTE_ERRORS.invalidRequest, 'requested_scope must be an array when provided.');
        }
        return success(
          core.controlPlaneService.createAccessRequest({
            subject_id: request.subject_id,
            requester_id: request.requester_id,
            dataset_id: request.dataset_id,
            purpose: request.purpose,
            requested_scope: request.requested_scope ?? [],
          })
        );
      }
      case '/access/requests': {
        const request = payload as { subject_id?: string; status?: 'pending' | 'approved' | 'denied' };
        if (!isNonEmptyString(request.subject_id)) {
          return failure(ROUTE_ERRORS.invalidRequest, 'subject_id is required.');
        }
        if (
          request.status !== undefined &&
          request.status !== 'pending' &&
          request.status !== 'approved' &&
          request.status !== 'denied'
        ) {
          return failure(ROUTE_ERRORS.invalidRequest, 'status must be one of pending, approved, denied.');
        }
        return success(core.controlPlaneService.listRequestsBySubject({ subject_id: request.subject_id, status: request.status }));
      }
      case '/access/request/decision': {
        const request = payload as { request_id?: string; subject_id?: string; decision?: 'approve' | 'deny'; reason?: string };
        if (!isNonEmptyString(request.request_id)) {
          return failure(ROUTE_ERRORS.invalidRequest, 'request_id is required.');
        }
        if (!isNonEmptyString(request.subject_id)) {
          return failure(ROUTE_ERRORS.invalidRequest, 'subject_id is required.');
        }
        if (request.decision !== 'approve' && request.decision !== 'deny') {
          return failure(ROUTE_ERRORS.invalidRequest, 'decision must be approve or deny.');
        }
        return success(
          core.controlPlaneService.decideAccessRequest({
            request_id: request.request_id,
            subject_id: request.subject_id,
            decision: request.decision,
            reason: request.reason,
          })
        );
      }
      case '/access/grants/active': {
        const request = payload as { subject_id?: string; requester_id?: string };
        return success(core.controlPlaneService.listActiveGrants({ subject_id: request.subject_id, requester_id: request.requester_id }));
      }
      case '/access/grant/revoke': {
        // Security containment: this handler must never consult usageService/monetizationService
        // or any billing/entitlement state before calling revokeGrant (ADR §13,
        // docs/security/revocation/08-billing-safety-override.md).
        const request = payload as {
          grant_id?: string;
          subject_id?: string;
          requester_id?: string;
          reason?: string;
          idempotency_key?: string;
        };
        if (!isNonEmptyString(request.grant_id)) {
          return failure(ROUTE_ERRORS.invalidRequest, 'grant_id is required.');
        }
        try {
          return success(
            core.controlPlaneService.revokeGrant({
              grant_id: request.grant_id,
              subject_id: request.subject_id,
              requester_id: request.requester_id,
              reason: request.reason,
              idempotency_key: request.idempotency_key,
              // The authenticated key, not the body, is who revokes: the service checks it
              // against the stored grant's subject and requester.
              authority: { owner: caller!.owner, principals: caller!.principals, admin: caller!.roles.includes('admin') },
            })
          );
        } catch (error) {
          if (error instanceof RevocationIdempotencyConflictError) {
            return failure('IDEMPOTENCY_CONFLICT', error.message);
          }
          if (error instanceof AccessGrantRevocationUnauthorizedError) {
            return failure(ROUTE_ERRORS.callerNotAuthorized, `Caller ${caller!.owner} has no authority over grant ${request.grant_id}.`);
          }
          throw error;
        }
      }
      case '/payout/execute': {
        const request = payload as Partial<RlusdWithdrawalRequest>;
        if (!isNonEmptyString(request.withdrawal_id)) {
          return failure(ROUTE_ERRORS.invalidRequest, 'withdrawal_id is required.');
        }
        if (!isNonEmptyString(request.subject_hash)) {
          return failure(ROUTE_ERRORS.invalidRequest, 'subject_hash is required.');
        }
        if (!isNonEmptyString(request.consumer_id)) {
          return failure(ROUTE_ERRORS.invalidRequest, 'consumer_id is required.');
        }
        if (!isNumericString(request.amount)) {
          return failure(ROUTE_ERRORS.invalidRequest, 'amount must be a numeric string.');
        }

        try {
          return success(core.payoutExecutor.execute(request as RlusdWithdrawalRequest, core.now()));
        } catch (error) {
          return failure(
            ROUTE_ERRORS.executionError,
            error instanceof Error ? error.message : 'Unknown payout execution error.'
          );
        }
      }
      case '/payout/callback':
        return success(core.payoutExecutor.callback(payload as PayoutCallbackInput));
      case '/trust/credential/register':
        return success(core.trustService.registerCredential(payload as RegisterCredentialInput));
      case '/trust/verify':
        return success(
          core.trustService.verifyIdentity(atServerClock(payload as Record<string, unknown>, core) as unknown as VerifyIdentityInput)
        );
      case '/trust/consent/grant':
        return success(core.trustService.grantConsent(payload as GrantConsentInput));
      case '/data/access': {
        const request = atServerClock(payload as Partial<DataAccessRequestInput>, core);
        if (!isNonEmptyString(request.subject_hash)) {
          return failure(ROUTE_ERRORS.invalidRequest, 'subject_hash is required.');
        }
        if (!isNonEmptyString(request.consumer_id)) {
          return failure(ROUTE_ERRORS.invalidRequest, 'consumer_id is required.');
        }
        if (!isNonEmptyString(request.dataset_id)) {
          return failure(ROUTE_ERRORS.invalidRequest, 'dataset_id is required.');
        }
        if (!isNonEmptyString(request.purpose)) {
          return failure(ROUTE_ERRORS.invalidRequest, 'purpose is required.');
        }
        if (request.requested_scope !== undefined && !Array.isArray(request.requested_scope)) {
          return failure(ROUTE_ERRORS.invalidRequest, 'requested_scope must be an array when provided.');
        }

        return success(core.dataAccessService.requestAccess(request as DataAccessRequestInput));
      }
      case '/audit/events': {
        const request = payload as Partial<ListAuditEventsInput>;
        const from = parseOptionalDate(request.from);
        const to = parseOptionalDate(request.to);
        if (request.from !== undefined && from === undefined) {
          return failure(ROUTE_ERRORS.invalidRequest, 'from must be a valid ISO-8601 date string.');
        }
        if (request.to !== undefined && to === undefined) {
          return failure(ROUTE_ERRORS.invalidRequest, 'to must be a valid ISO-8601 date string.');
        }

        const events = core.auditService.listEvents({
          subject_hash: request.subject_hash,
          consumer_id: request.consumer_id,
          event_type: request.event_type,
          from,
          to,
        });

        return success({ events });
      }
      case '/usage/summary': {
        const request = payload as { consumer_id?: string; endpoint?: string; from?: string; to?: string };
        if (!isNonEmptyString(request.consumer_id)) {
          return failure(ROUTE_ERRORS.invalidRequest, 'consumer_id is required.');
        }

        const endpoint = parseOptionalMeteredEndpoint(request.endpoint);
        if (request.endpoint !== undefined && endpoint === undefined) {
          return failure(ROUTE_ERRORS.invalidRequest, 'endpoint must be one of /data/access, /payout/execute, /trust/verify.');
        }

        const from = parseOptionalDate(request.from);
        const to = parseOptionalDate(request.to);
        if (request.from !== undefined && from === undefined) {
          return failure(ROUTE_ERRORS.invalidRequest, 'from must be a valid ISO-8601 date string.');
        }
        if (request.to !== undefined && to === undefined) {
          return failure(ROUTE_ERRORS.invalidRequest, 'to must be a valid ISO-8601 date string.');
        }

        return success(
          core.usageService.getSummary({
            consumer_id: request.consumer_id,
            endpoint,
            from,
            to,
          })
        );
      }
      default:
        return failure(ROUTE_ERRORS.routeNotFound, `Unsupported endpoint: ${endpoint}`);
    }
  } catch (error) {
    return failure(ROUTE_ERRORS.protocolError, error instanceof Error ? error.message : 'Unknown protocol error.');
  }
}

export function maybeResolveUsageConsumerId(endpoint: RuntimeEndpoint, payload: unknown): string | undefined {
  if (!isMeteredEndpoint(endpoint) || payload === null || typeof payload !== 'object') {
    return undefined;
  }

  const candidate = (payload as { consumer_id?: unknown }).consumer_id;
  if (typeof candidate !== 'string' || candidate.trim() === '') {
    return undefined;
  }
  return candidate;
}
