import {
  validateCapabilityToken,
  type CapabilityTokenV1
} from '../../../capability';
import { readRevocation } from '../../../capability/revocation';
import type { NonceRegistry } from '../../../capability/registries/NonceRegistry';
import type { RevocationRegistry } from '../../../capability/registries/RevocationRegistry';
import {
  validateConsentObject,
  verifyConsentObjectProof,
  type ConsentObjectV1
} from '../../../consent';
import type {
  CapabilityAccessChecks,
  CapabilityAccessRequest,
  CapabilityResource
} from '../core';
import {
  capabilityAccessReasonCodes,
  evaluateCapabilityAccess
} from '../core';
import type { CapabilityAccessReasonCode } from '../core/reasonCodes';
import { validateCapabilityActions } from '../../../shared/capabilityActions';
import type { MarketMakerRegistry } from '../../../shared/marketMakerRegistry';
import { verifyCapabilityConsentBinding } from '../consent/consentBinding';

const CLOCK_SKEW_SECONDS = 300;
const ALLOWED_RESOURCE_TYPES = new Set(['field', 'content', 'pack']);
const HASH_HEX_PATTERN = /^[a-f0-9]{64}$/;
const CAPABILITY_CONSUMPTION_ALLOWED_REASON =
  'Capability consumption is authorized and all runtime enforcement checks passed.';

export const capabilityConsumptionReasonCodes = {
  ...capabilityAccessReasonCodes,
  CAPABILITY_REPLAYED: 'CAPABILITY_REPLAYED',
  REPLAY_PROTECTION_REQUIRED: 'REPLAY_PROTECTION_REQUIRED',
  RATE_LIMITED: 'RATE_LIMITED'
} as const;

export type CapabilityConsumptionReasonCode =
  | CapabilityAccessReasonCode
  | (typeof capabilityConsumptionReasonCodes)[keyof Omit<
      typeof capabilityConsumptionReasonCodes,
      keyof typeof capabilityAccessReasonCodes
    >];

export const capabilityConsumptionReasonCodeTaxonomy = {
  authorization: capabilityAccessReasonCodes,
  runtime: {
    CAPABILITY_REVOKED: capabilityConsumptionReasonCodes.CAPABILITY_REVOKED,
    CAPABILITY_REPLAYED: capabilityConsumptionReasonCodes.CAPABILITY_REPLAYED,
    REPLAY_PROTECTION_REQUIRED: capabilityConsumptionReasonCodes.REPLAY_PROTECTION_REQUIRED,
    RATE_LIMITED: capabilityConsumptionReasonCodes.RATE_LIMITED
  }
} as const;

export type CapabilityConsumptionCheckState = 'pass' | 'fail' | 'not_applicable';

export type CapabilityConsumptionChecks = CapabilityAccessChecks & {
  consent: CapabilityConsumptionCheckState;
  revocation: CapabilityConsumptionCheckState;
  replay: CapabilityConsumptionCheckState;
};

export type ConsentUsageResult = 'allow' | 'deny';

export type ConsentUsageState = {
  consentRef: string;
  usageCount: number;
  lastAccessedAt: string;
  lastAccessResult: ConsentUsageResult;
};

export interface ConsentUsageRegistry {
  get(consentRef: string): ConsentUsageState | undefined;
  record(
    consentRef: string,
    result: ConsentUsageResult,
    timestamp: string
  ): ConsentUsageState;
}

export type RateLimitConfig = {
  maxAttempts: number;
  windowMs: number;
};

export type RateLimitState = {
  key: string;
  count: number;
  windowStartedAt: string;
};

export interface RateLimitRegistry {
  get(key: string): RateLimitState | undefined;
  increment(key: string, now: Date, config: RateLimitConfig): RateLimitState;
  isLimited(key: string, now: Date, config: RateLimitConfig): boolean;
}

export class InMemoryRateLimitRegistry implements RateLimitRegistry {
  private readonly states = new Map<string, RateLimitState>();

  get(key: string): RateLimitState | undefined {
    const state = this.states.get(key);
    return state ? { ...state } : undefined;
  }

  increment(key: string, now: Date, config: RateLimitConfig): RateLimitState {
    const nowMs = now.getTime();
    const current = this.states.get(key);
    const shouldResetWindow =
      !current || nowMs - Date.parse(current.windowStartedAt) >= config.windowMs;
    const next: RateLimitState = shouldResetWindow
      ? {
          key,
          count: 1,
          windowStartedAt: normalizeEvaluatedAt(now)
        }
      : {
          key,
          count: current.count + 1,
          windowStartedAt: current.windowStartedAt
        };

    this.states.set(key, next);
    return { ...next };
  }

  isLimited(key: string, now: Date, config: RateLimitConfig): boolean {
    const state = this.states.get(key);
    if (!state) {
      return false;
    }

    const withinWindow = now.getTime() - Date.parse(state.windowStartedAt) < config.windowMs;
    if (!withinWindow) {
      return false;
    }

    return state.count >= config.maxAttempts;
  }
}

export class InMemoryConsentUsageRegistry implements ConsentUsageRegistry {
  private readonly states = new Map<string, ConsentUsageState>();

  get(consentRef: string): ConsentUsageState | undefined {
    const state = this.states.get(consentRef);
    return state ? { ...state } : undefined;
  }

  record(
    consentRef: string,
    result: ConsentUsageResult,
    timestamp: string
  ): ConsentUsageState {
    const current = this.states.get(consentRef);
    const next: ConsentUsageState = {
      consentRef,
      usageCount: (current?.usageCount ?? 0) + (result === 'allow' ? 1 : 0),
      lastAccessedAt: timestamp,
      lastAccessResult: result
    };

    this.states.set(consentRef, next);
    return { ...next };
  }
}

export type CapabilityConsumptionRequest = {
  capability: CapabilityAccessRequest['capability'];
  consent?: ConsentObjectV1 | null;
  action: string;
  resource: CapabilityResource;
  marketMakerId?: string;
  now?: string | number | Date;
  usageContext?: Record<string, unknown>;
  paymentContext?: {
    paid: boolean;
  };
  policyContext?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  rateLimit?: {
    registry: RateLimitRegistry;
    maxAttempts: number;
    windowMs: number;
  };
  marketMakerRegistry?: Pick<MarketMakerRegistry, 'exists' | 'getStatus'>;
  hooks?: CapabilityAccessRequest['hooks'];
  registries?: {
    nonceRegistry?: NonceRegistry;
    revocationRegistry?: RevocationRegistry;
    consentUsageRegistry?: ConsentUsageRegistry;
  };
  consume?: boolean;
  requireReplayProtection?: boolean;
};

export type CapabilityConsumptionDecision = {
  allowed: boolean;
  decision: 'allow' | 'deny';
  reasonCode: CapabilityConsumptionReasonCode;
  reason: string;
  evaluatedAt: string;
  checks: CapabilityConsumptionChecks;
  metadata: Record<string, unknown>;
  consumed: boolean;
  replayChecked: boolean;
  revocationChecked: boolean;
  usage?: Pick<ConsentUsageState, 'usageCount' | 'lastAccessedAt' | 'lastAccessResult'>;
  payment?: {
    required: boolean;
    amount?: number;
    currency?: string;
  };
};

function normalizeNow(now?: string | number | Date): Date {
  const normalized = now instanceof Date ? new Date(now.getTime()) : now !== undefined ? new Date(now) : new Date();
  if (Number.isNaN(normalized.getTime())) {
    throw new Error('Evaluation timestamp must be a valid date.');
  }
  return normalized;
}

function normalizeEvaluatedAt(now?: string | number | Date): string {
  return normalizeNow(now)
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z');
}

function makeChecks(): CapabilityConsumptionChecks {
  return {
    integrity: 'fail',
    consent: 'not_applicable',
    revocation: 'not_applicable',
    replay: 'not_applicable',
    temporal: 'not_applicable',
    action: 'fail',
    resource: 'fail',
    marketMaker: 'not_applicable',
    usage: 'not_applicable',
    policy: 'not_applicable'
  };
}

function deepCloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  const entries = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>);
  for (const entry of entries) {
    deepFreeze(entry);
  }

  return Object.freeze(value);
}

function cloneCapability(
  capability: CapabilityConsumptionRequest['capability']
): CapabilityConsumptionRequest['capability'] {
  if (capability === null || capability === undefined) {
    return capability;
  }
  return deepFreeze(deepCloneJson(capability));
}

function cloneConsent(
  consent: CapabilityConsumptionRequest['consent']
): CapabilityConsumptionRequest['consent'] {
  if (consent === null || consent === undefined) {
    return consent;
  }
  return deepFreeze(deepCloneJson(consent));
}

function normalizeAction(action: string): string {
  const normalizedAction = action.trim().toLowerCase();
  validateCapabilityActions([normalizedAction], {
    containerLabel: 'Requested actions',
    itemLabel: 'Requested action',
    emptyMessage: 'Requested action is required for access evaluation.',
    maxEntries: 1
  });
  return normalizedAction;
}

function normalizeResource(resource: CapabilityResource): { type: 'field' | 'content' | 'pack'; ref: string } {
  const raw =
    typeof resource === 'string'
      ? (() => {
          const [type, ref, ...rest] = resource.trim().split(':');
          if (!type || !ref || rest.length > 0) {
            throw new Error('Requested resource must be a canonical "type:ref" string.');
          }
          return { type, ref };
        })()
      : resource && typeof resource === 'object'
        ? {
            type: typeof resource.type === 'string' ? resource.type.trim() : '',
            ref: typeof resource.ref === 'string' ? resource.ref.trim() : ''
          }
        : null;

  if (!raw) {
    throw new Error('Requested resource must include string type and ref fields.');
  }

  if (!ALLOWED_RESOURCE_TYPES.has(raw.type)) {
    throw new Error('Requested resource type must be one of: field, content, pack.');
  }

  if (!HASH_HEX_PATTERN.test(raw.ref)) {
    throw new Error('Requested resource ref must be 64 lowercase hex characters.');
  }

  return raw as { type: 'field' | 'content' | 'pack'; ref: string };
}

function parseTimestamp(timestamp: string, label: string): Date {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} must be a valid date.`);
  }
  return parsed;
}

function enforceTimestampWithinSkew(
  timestamp: string,
  now: Date,
  label: string
): Date {
  const parsed = parseTimestamp(timestamp, label);
  if (Math.abs(parsed.getTime() - now.getTime()) > CLOCK_SKEW_SECONDS * 1000) {
    throw new Error(`${label} exceeds allowed clock skew.`);
  }
  return parsed;
}

function enforceCapabilityTemporalIntegrity(
  capability: CapabilityTokenV1,
  consent: ConsentObjectV1 | null | undefined,
  now: Date
): void {
  enforceTimestampWithinSkew(capability.issued_at, now, 'Capability issued_at');

  if (capability.not_before) {
    enforceTimestampWithinSkew(capability.not_before, now, 'Capability not_before');
  }

  enforceTimestampWithinSkew(capability.expires_at, now, 'Capability expires_at');

  if (consent) {
    enforceTimestampWithinSkew(consent.issued_at, now, 'Consent issued_at');
  }
}

function sanitizeMetadata(base: {
  capabilityHash?: string;
  tokenId?: string;
  rateLimitKey?: string;
  rateLimitWindowStartedAt?: string;
  rateLimitCount?: number;
  rateLimitMaxAttempts?: number;
  rateLimitWindowMs?: number;
  failureStage?: string;
}): Record<string, unknown> {
  return {
    ...(base.capabilityHash !== undefined ? { capabilityHash: base.capabilityHash } : {}),
    ...(base.tokenId !== undefined ? { tokenId: base.tokenId } : {}),
    ...(base.rateLimitKey !== undefined ? { rateLimitKey: base.rateLimitKey } : {}),
    ...(base.rateLimitWindowStartedAt !== undefined
      ? { rateLimitWindowStartedAt: base.rateLimitWindowStartedAt }
      : {}),
    ...(base.rateLimitCount !== undefined ? { rateLimitCount: base.rateLimitCount } : {}),
    ...(base.rateLimitMaxAttempts !== undefined
      ? { rateLimitMaxAttempts: base.rateLimitMaxAttempts }
      : {}),
    ...(base.rateLimitWindowMs !== undefined ? { rateLimitWindowMs: base.rateLimitWindowMs } : {}),
    ...(base.failureStage !== undefined ? { failureStage: base.failureStage } : {})
  };
}

function toUsageOutput(
  state: ConsentUsageState
): Pick<ConsentUsageState, 'usageCount' | 'lastAccessedAt' | 'lastAccessResult'> {
  return {
    usageCount: state.usageCount,
    lastAccessedAt: state.lastAccessedAt,
    lastAccessResult: state.lastAccessResult
  };
}

function recordUsage(
  request: CapabilityConsumptionRequest,
  capability: CapabilityTokenV1 | null | undefined,
  result: ConsentUsageResult,
  evaluatedAt: string
): Pick<ConsentUsageState, 'usageCount' | 'lastAccessedAt' | 'lastAccessResult'> | undefined {
  const registry = request.registries?.consentUsageRegistry;
  const consentRef = capability?.consent_ref;

  if (!registry || typeof consentRef !== 'string' || consentRef.length === 0) {
    return undefined;
  }

  try {
    return toUsageOutput(registry.record(consentRef, result, evaluatedAt));
  } catch {
    return undefined;
  }
}

function deny(
  evaluatedAt: string,
  reasonCode: CapabilityConsumptionReasonCode,
  reason: string,
  checks: CapabilityConsumptionChecks,
  metadata: Record<string, unknown>,
  replayChecked: boolean,
  revocationChecked: boolean,
  usage?: Pick<ConsentUsageState, 'usageCount' | 'lastAccessedAt' | 'lastAccessResult'>,
  payment?: CapabilityConsumptionDecision['payment']
): CapabilityConsumptionDecision {
  return {
    allowed: false,
    decision: 'deny',
    reasonCode,
    reason,
    evaluatedAt,
    checks,
    metadata,
    consumed: false,
    replayChecked,
    revocationChecked,
    ...(usage ? { usage } : {}),
    ...(payment ? { payment } : {})
  };
}

function buildPaymentDecision(consent: ConsentObjectV1 | null | undefined, paid: boolean): CapabilityConsumptionDecision['payment'] | undefined {
  if (!consent?.pricing) {
    return undefined;
  }

  return {
    required: paid !== true,
    amount: consent.pricing.amount,
    currency: consent.pricing.currency
  };
}

function buildEvaluationRequest(
  request: CapabilityConsumptionRequest,
  normalizedCapability: CapabilityConsumptionRequest['capability'],
  normalizedConsent: CapabilityConsumptionRequest['consent'],
  normalizedAction: string,
  normalizedResource: { type: 'field' | 'content' | 'pack'; ref: string },
  evaluatedAt: string
): CapabilityAccessRequest {
  return {
    capability: normalizedCapability,
    consent: normalizedConsent,
    action: normalizedAction,
    resource: normalizedResource,
    marketMakerId: request.marketMakerId,
    now: evaluatedAt,
    usageContext: request.usageContext ? { ...request.usageContext } : undefined,
    policyContext: request.policyContext ? { ...request.policyContext } : undefined,
    metadata: undefined,
    marketMakerRegistry: request.marketMakerRegistry,
    hooks: request.hooks,
    registries: { revocationRegistry: request.registries?.revocationRegistry }
  };
}

function validateRateLimitConfig(config: RateLimitConfig): void {
  if (!Number.isInteger(config.maxAttempts) || config.maxAttempts <= 0) {
    throw new Error('rateLimit.maxAttempts must be a positive integer.');
  }
  if (!Number.isInteger(config.windowMs) || config.windowMs <= 0) {
    throw new Error('rateLimit.windowMs must be a positive integer.');
  }
}

export function consumeCapabilityAccess(
  request: CapabilityConsumptionRequest
): CapabilityConsumptionDecision {
  const now = normalizeNow(request.now);
  const evaluatedAt = normalizeEvaluatedAt(now);
  const checks = makeChecks();

  try {
    const normalizedCapability = cloneCapability(request.capability);
    const normalizedConsent = cloneConsent(request.consent);
    const normalizedAction = normalizeAction(request.action);
    const normalizedResource = normalizeResource(request.resource);

    validateCapabilityToken(normalizedCapability as CapabilityTokenV1);
    checks.integrity = 'pass';
    checks.action = 'pass';
    checks.resource = 'pass';

    const capability = normalizedCapability as CapabilityTokenV1;
    const metadata = sanitizeMetadata({
      capabilityHash: capability.capability_hash,
      tokenId: capability.token_id
    });

    if (!normalizedConsent) {
      checks.consent = 'fail';
      return deny(
        evaluatedAt,
        capabilityAccessReasonCodes.CONSENT_INVALID,
        'Parent consent is required for capability consumption.',
        checks,
        sanitizeMetadata({ ...metadata, failureStage: 'integrity' }),
        false,
        false
      );
    }

    if (normalizedConsent) {
      try {
        validateConsentObject(normalizedConsent);
      } catch (error) {
        checks.consent = 'fail';
        return deny(
          evaluatedAt,
          capabilityAccessReasonCodes.CONSENT_INVALID,
          (error as Error).message || 'Parent consent is invalid for capability consumption.',
          checks,
          sanitizeMetadata({ ...metadata, failureStage: 'integrity' }),
          false,
          false
        );
      }

      const proof = verifyConsentObjectProof(normalizedConsent);
      if (!proof.valid) {
        checks.consent = 'fail';
        return deny(
          evaluatedAt,
          capabilityAccessReasonCodes.CONSENT_UNAUTHENTICATED,
          proof.reason,
          checks,
          sanitizeMetadata({ ...metadata, failureStage: 'integrity' }),
          false,
          false
        );
      }

      try {
        verifyCapabilityConsentBinding(capability, normalizedConsent);
        checks.consent = 'pass';
      } catch (error) {
        checks.consent = 'fail';
        return deny(
          evaluatedAt,
          capabilityAccessReasonCodes.CONSENT_MISMATCH,
          (error as Error).message || 'Capability does not match the supplied parent consent.',
          checks,
          sanitizeMetadata({ ...metadata, failureStage: 'integrity' }),
          false,
          false
        );
      }
    }

    try {
      enforceCapabilityTemporalIntegrity(capability, normalizedConsent, now);
      checks.temporal = 'pass';
    } catch (error) {
      checks.temporal = 'fail';
      return deny(
        evaluatedAt,
        capabilityAccessReasonCodes.CAPABILITY_INVALID,
        (error as Error).message || 'Capability temporal validation failed.',
        checks,
        sanitizeMetadata({ ...metadata, failureStage: 'temporal' }),
        false,
        false
      );
    }

    const nonceRegistry = request.registries?.nonceRegistry;
    const shouldConsume = request.consume !== false;
    const shouldCheckReplay = Boolean(nonceRegistry) && shouldConsume;

    const accessDecision = evaluateCapabilityAccess(
      buildEvaluationRequest(
        request,
        normalizedCapability,
        normalizedConsent,
        normalizedAction,
        normalizedResource,
        evaluatedAt
      )
    );
    checks.temporal = accessDecision.checks.temporal;
    checks.action = accessDecision.checks.action;
    checks.resource = accessDecision.checks.resource;
    checks.marketMaker = accessDecision.checks.marketMaker;
    checks.usage = accessDecision.checks.usage;
    checks.policy = accessDecision.checks.policy;

    if (!accessDecision.allowed) {
      // Evaluation already read the registry; a revocation denial is reported as such.
      if (
        accessDecision.reasonCode === capabilityAccessReasonCodes.CONSENT_REVOKED ||
        accessDecision.reasonCode === capabilityAccessReasonCodes.CAPABILITY_REVOKED ||
        accessDecision.reasonCode === capabilityAccessReasonCodes.REVOCATION_UNAVAILABLE
      ) {
        checks.revocation = 'fail';
      }
      return deny(
        evaluatedAt,
        accessDecision.reasonCode,
        accessDecision.reason,
        checks,
        sanitizeMetadata({
          ...metadata,
          failureStage:
            typeof accessDecision.metadata.failureStage === 'string'
              ? accessDecision.metadata.failureStage
              : 'integrity'
        }),
        shouldCheckReplay,
        true,
        undefined,
        buildPaymentDecision(normalizedConsent, request.paymentContext?.paid === true)
      );
    }

    if (request.rateLimit) {
      validateRateLimitConfig(request.rateLimit);
      const rateLimitKey = capability.consent_ref;
      const rateLimitConfig: RateLimitConfig = {
        maxAttempts: request.rateLimit.maxAttempts,
        windowMs: request.rateLimit.windowMs
      };
      if (request.rateLimit.registry.isLimited(rateLimitKey, now, rateLimitConfig)) {
        const state = request.rateLimit.registry.get(rateLimitKey);
        return deny(
          evaluatedAt,
          capabilityConsumptionReasonCodes.RATE_LIMITED,
          `Rate limit exceeded for consent_ref "${rateLimitKey}".`,
          checks,
          sanitizeMetadata({
            ...metadata,
            rateLimitKey,
            rateLimitWindowStartedAt: state?.windowStartedAt,
            rateLimitCount: state?.count,
            rateLimitMaxAttempts: rateLimitConfig.maxAttempts,
            rateLimitWindowMs: rateLimitConfig.windowMs,
            failureStage: 'rate_limit'
          }),
          shouldCheckReplay,
          false
        );
      }

      const state = request.rateLimit.registry.increment(rateLimitKey, now, rateLimitConfig);
      Object.assign(metadata, {
        rateLimitKey,
        rateLimitWindowStartedAt: state.windowStartedAt,
        rateLimitCount: state.count,
        rateLimitMaxAttempts: rateLimitConfig.maxAttempts,
        rateLimitWindowMs: rateLimitConfig.windowMs
      });
    }

    // Revocation is read again here, from the injected registry: consumption never
    // trusts that an earlier evaluation checked it. A revoked consent withdraws this
    // capability; a revoked hash is containment of this token; no registry, no access.
    const revocation = readRevocation(request.registries?.revocationRegistry, {
      capability_hash: capability.capability_hash,
      consent_hash: normalizedConsent!.consent_hash
    });
    checks.revocation = revocation.state === 'clear' ? 'pass' : 'fail';
    if (revocation.state === 'unavailable') {
      return deny(
        evaluatedAt,
        capabilityConsumptionReasonCodes.REVOCATION_UNAVAILABLE,
        `Revocation status could not be determined: ${revocation.reason}`,
        checks,
        sanitizeMetadata({ ...metadata, failureStage: 'revocation' }),
        shouldCheckReplay,
        false
      );
    }
    if (revocation.state !== 'clear') {
      return deny(
        evaluatedAt,
        revocation.state === 'revoked_consent'
          ? capabilityConsumptionReasonCodes.CONSENT_REVOKED
          : capabilityConsumptionReasonCodes.CAPABILITY_REVOKED,
        revocation.state === 'revoked_consent'
          ? 'Parent consent has been revoked by its subject.'
          : 'Capability token has been revoked.',
        checks,
        sanitizeMetadata({ ...metadata, failureStage: 'revocation' }),
        shouldCheckReplay,
        true
      );
    }

    if (shouldCheckReplay) {
      checks.replay = 'pass';
      if (nonceRegistry!.hasSeen(capability.token_id, now)) {
        checks.replay = 'fail';
        return deny(
          evaluatedAt,
          capabilityConsumptionReasonCodes.CAPABILITY_REPLAYED,
          'Capability token_id has already been presented (replay detected).',
          checks,
          sanitizeMetadata({ ...metadata, failureStage: 'replay' }),
          true,
          true
        );
      }
    } else if (request.requireReplayProtection) {
      checks.replay = 'fail';
      return deny(
        evaluatedAt,
        capabilityConsumptionReasonCodes.REPLAY_PROTECTION_REQUIRED,
        'Replay protection is required for consumption but no nonce registry was supplied.',
        checks,
        sanitizeMetadata({ ...metadata, failureStage: 'replay' }),
        false,
        true
      );
    }

    const paid = request.paymentContext?.paid === true;
    const payment = buildPaymentDecision(normalizedConsent, paid);

    if (normalizedConsent?.pricing && !paid) {
      return deny(
        evaluatedAt,
        capabilityAccessReasonCodes.PAYMENT_REQUIRED,
        'Payment is required before this capability can be consumed.',
        checks,
        sanitizeMetadata({ ...metadata, failureStage: 'payment' }),
        shouldCheckReplay,
        true,
        undefined,
        payment
      );
    }

    let consumed = false;
    if (shouldConsume && nonceRegistry) {
      nonceRegistry.markSeen(capability.token_id, capability.expires_at);
      nonceRegistry.cleanup?.(now);
      consumed = true;
    }

    const usage = recordUsage(request, capability, 'allow', evaluatedAt);

    return {
      allowed: true,
      decision: 'allow',
      reasonCode: capabilityAccessReasonCodes.ACCESS_ALLOWED,
      reason: CAPABILITY_CONSUMPTION_ALLOWED_REASON,
      evaluatedAt,
      checks,
      metadata: sanitizeMetadata({ ...metadata, failureStage: 'completed' }),
      consumed,
      replayChecked: shouldCheckReplay,
      revocationChecked: true,
      ...(usage ? { usage } : {}),
      ...(payment ? { payment } : {})
    };
  } catch (error) {
    if (checks.consent === 'not_applicable' && request.consent) {
      checks.consent = 'fail';
    }

    return deny(
      evaluatedAt,
      capabilityAccessReasonCodes.CAPABILITY_INVALID,
      (error as Error).message || 'Capability consumption request is invalid.',
      checks,
      sanitizeMetadata({ failureStage: 'integrity' }),
      false,
      checks.revocation !== 'not_applicable'
    );
  }
}
