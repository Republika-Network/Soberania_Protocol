import { type CapabilityTokenV1 } from '../../../capability';
import type { NonceRegistry } from '../../../capability/registries/NonceRegistry';
import type { RevocationRegistry } from '../../../capability/registries/RevocationRegistry';
import type { ConsentObjectV1 } from '../../../consent';
import type { MarketMakerRegistry } from '../../../shared/marketMakerRegistry';
import {
  capabilityAccessReasonCodes,
  type CapabilityAccessRequest
} from '../core';
import {
  consumeCapabilityAccess,
  capabilityConsumptionReasonCodes,
  type RateLimitConfig,
  type RateLimitRegistry
} from '../runtime/consumeCapabilityAccess';

export type EnforceCapabilityInput = {
  required_scope: string;
  token: CapabilityTokenV1 & Record<string, unknown>;
  /** Required: access is denied without the parent consent. */
  consent: ConsentObjectV1;
  now?: Date;
  resource_context?: Record<string, unknown>;
  request_context?: Record<string, unknown>;
  registries?: { nonceRegistry?: NonceRegistry; revocationRegistry?: RevocationRegistry };
  rateLimit?: RateLimitConfig & { registry: RateLimitRegistry };
  consume?: boolean;
  action?: 'read';
  hooks?: CapabilityAccessRequest['hooks'];
  marketMakerRegistry?: Pick<MarketMakerRegistry, 'exists' | 'getStatus'>;
};

export type EnforceCapabilityDecision = {
  allowed: boolean;
  reasonCode: string;
  code:
    | 'OK'
    | 'EXPIRED'
    | 'NOT_YET_VALID'
    | 'REPLAY'
    | 'REVOKED'
    | 'SCOPE_MISMATCH'
    | 'INVALID_SCOPE'
    | 'INVALID_CAPABILITY'
    | 'CONSENT_MISMATCH'
    | 'REQUEST_CONTEXT_MISMATCH'
    | 'RESOURCE_RESTRICTION_FAILED'
    | 'MALFORMED_CAPABILITY'
    | 'INTERNAL_DENY';
  reason: string;
  metadata?: Record<string, unknown>;
};


function deny(
  code: EnforceCapabilityDecision['code'],
  reason: string
): EnforceCapabilityDecision {
  return { allowed: false, reasonCode: capabilityAccessReasonCodes.CAPABILITY_INVALID, code, reason };
}

function mapReasonCode(reasonCode: string): EnforceCapabilityDecision['code'] {
  switch (reasonCode) {
    case capabilityAccessReasonCodes.ACCESS_ALLOWED:
      return 'OK';
    case capabilityAccessReasonCodes.CAPABILITY_EXPIRED:
    case capabilityAccessReasonCodes.CONSENT_EXPIRED:
      return 'EXPIRED';
    case capabilityAccessReasonCodes.CAPABILITY_NOT_YET_VALID:
      return 'NOT_YET_VALID';
    case capabilityAccessReasonCodes.RESOURCE_NOT_ALLOWED:
      return 'SCOPE_MISMATCH';
    case capabilityAccessReasonCodes.RESOURCE_MISSING:
      return 'INVALID_SCOPE';
    case capabilityAccessReasonCodes.CAPABILITY_INVALID:
    case capabilityAccessReasonCodes.CAPABILITY_MISSING:
    case capabilityAccessReasonCodes.ACTION_MISSING:
    case capabilityAccessReasonCodes.ACTION_NOT_ALLOWED:
      return 'INVALID_CAPABILITY';
    case capabilityAccessReasonCodes.CAPABILITY_INACTIVE:
      return 'MALFORMED_CAPABILITY';
    case capabilityAccessReasonCodes.CONSENT_INVALID:
    case capabilityAccessReasonCodes.CONSENT_MISMATCH:
    case capabilityAccessReasonCodes.EXPIRATION_MISMATCH:
      return 'CONSENT_MISMATCH';
    case capabilityAccessReasonCodes.MARKET_MAKER_REQUIRED:
    case capabilityAccessReasonCodes.MARKET_MAKER_MISMATCH:
    case capabilityAccessReasonCodes.UNKNOWN_MARKET_MAKER:
    case capabilityAccessReasonCodes.MARKET_MAKER_DEPRECATED:
    case capabilityAccessReasonCodes.MARKET_MAKER_REVOKED:
    case capabilityAccessReasonCodes.MARKET_MAKER_TRUST_UNVERIFIABLE:
      return 'REQUEST_CONTEXT_MISMATCH';
    case capabilityAccessReasonCodes.POLICY_DENIED:
    case capabilityAccessReasonCodes.USAGE_DENIED:
    case capabilityAccessReasonCodes.PAYMENT_REQUIRED:
    case capabilityConsumptionReasonCodes.RATE_LIMITED:
      return 'RESOURCE_RESTRICTION_FAILED';
    default:
      return 'INTERNAL_DENY';
  }
}

function buildLegacyAccessRequest(
  input: EnforceCapabilityInput,
  type: string,
  ref: string
): CapabilityAccessRequest {
  const enforcedAction = input.action ?? 'read';

  return {
    capability: input.token,
    consent: input.consent,
    action: enforcedAction,
    resource: { type: type as 'field' | 'content' | 'pack', ref },
    marketMakerId:
      typeof input.request_context?.marketMakerId === 'string'
        ? input.request_context.marketMakerId
        : undefined,
    now: input.now,
    hooks: input.hooks,
    marketMakerRegistry: input.marketMakerRegistry,
    metadata: {
      resource_context: input.resource_context,
      request_context: input.request_context,
      consume: input.consume,
      legacyBridgeAction: enforcedAction
    }
  };
}

// Legacy bridge for current vault/resolver flows. It remains intentionally
// read-only: existing callers redeem capabilities only for protected resource
// retrieval, and non-read protocol actions stay in the canonical enforcement
// layer until a dedicated legacy bridge expansion is specified.
export function enforceCapability(
  input: EnforceCapabilityInput
): EnforceCapabilityDecision {
  const [type, ref, ...rest] = input.required_scope.split(':');
  if (!type || !ref || rest.length > 0) {
    return deny('INVALID_SCOPE', 'required_scope must be a "type:ref" string.');
  }

  const decision = consumeCapabilityAccess({
    ...buildLegacyAccessRequest(input, type, ref),
    registries: input.registries,
    rateLimit: input.rateLimit,
    consume: input.consume,
    requireReplayProtection: false
  });

  const mappedCode = decision.allowed
    ? 'OK'
    : decision.reasonCode === capabilityConsumptionReasonCodes.CAPABILITY_REVOKED
      ? 'REVOKED'
      : decision.reasonCode === capabilityConsumptionReasonCodes.CAPABILITY_REPLAYED
        ? 'REPLAY'
      : mapReasonCode(decision.reasonCode);

  return {
    allowed: decision.allowed,
    reasonCode: decision.reasonCode,
    code: mappedCode,
    reason: decision.reason,
    metadata: {
      ...decision.metadata,
      legacyBridgeAction: input.action ?? 'read',
      replayChecked: decision.replayChecked,
      revocationChecked: decision.revocationChecked,
      consumed: decision.consumed
    }
  };
}
