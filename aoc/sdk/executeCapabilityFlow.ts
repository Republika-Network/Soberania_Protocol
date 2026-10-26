import type { CapabilityTokenV1 } from '../../capability/types';
import type { ConsentObjectV1 } from '../../consent/types';
import type { AIInterpreterResponse } from '../../interpreter/interpreterTypes';
import type {
  CapabilityAccessDecision,
  CapabilityAccessRequest,
  CapabilityResource
} from '../capabilities/core';
import type {
  CapabilityConsumptionDecision,
  CapabilityConsumptionRequest
} from '../capabilities/runtime';
import type { MarketMakerRegistry } from '../capabilities/market/marketMakerRegistry';
import { evaluateCapabilityAccess } from '../capabilities/core/evaluateCapabilityAccess';
import { consumeCapabilityAccess } from '../capabilities/runtime/consumeCapabilityAccess';
import { interpretWithCapability } from '../capabilities/interpreter/interpretWithCapability';
import { capabilityAccessReasonCodes } from '../capabilities/core/reasonCodes';

const CAPABILITY_FLOW_ALLOWED_REASON =
  'Capability flow succeeded after evaluation and runtime consumption.';

export type ExecuteCapabilityFlowRequest = {
  capability: CapabilityTokenV1;
  consent?: ConsentObjectV1 | null;
  action: string;
  resource: CapabilityResource;
  marketMakerId?: string;
  marketMakerRegistry?: Pick<MarketMakerRegistry, 'exists' | 'getStatus'>;
  now?: string | number | Date;
  paymentContext?: {
    paid: boolean;
  };
  rateLimit?: CapabilityConsumptionRequest['rateLimit'];
  registries?: CapabilityConsumptionRequest['registries'];
  hooks?: CapabilityAccessRequest['hooks'];
  interpreter?: {
    enabled: boolean;
    query: string;
    context?: Record<string, unknown>;
  };
};

export type ExecuteCapabilityFlowResponse = {
  allowed: boolean;
  stage: 'evaluation' | 'consumption' | 'interpretation';
  evaluation: CapabilityAccessDecision;
  consumption?: CapabilityConsumptionDecision;
  interpretation?: AIInterpreterResponse;
  reasonCode: string;
  reason: string;
};

function normalizeResourceForInterpreter(resource: CapabilityResource): string {
  if (typeof resource === 'string') {
    return resource;
  }
  return `${resource.type}:${resource.ref}`;
}

export function executeCapabilityFlow(
  request: ExecuteCapabilityFlowRequest
): ExecuteCapabilityFlowResponse {
  const evaluation = evaluateCapabilityAccess({
    capability: request.capability,
    consent: request.consent,
    action: request.action,
    resource: request.resource,
    marketMakerId: request.marketMakerId,
    marketMakerRegistry: request.marketMakerRegistry,
    now: request.now,
    hooks: request.hooks,
    registries: { revocationRegistry: request.registries?.revocationRegistry }
  });

  if (!evaluation.allowed) {
    return {
      allowed: false,
      stage: 'evaluation',
      evaluation,
      reasonCode: evaluation.reasonCode,
      reason: evaluation.reason
    };
  }

  const consumption = consumeCapabilityAccess({
    capability: request.capability,
    consent: request.consent,
    action: request.action,
    resource: request.resource,
    marketMakerId: request.marketMakerId,
    marketMakerRegistry: request.marketMakerRegistry,
    now: request.now,
    paymentContext: request.paymentContext,
    rateLimit: request.rateLimit,
    hooks: request.hooks,
    registries: request.registries
  });

  if (!consumption.allowed) {
    return {
      allowed: false,
      stage: 'consumption',
      evaluation,
      consumption,
      reasonCode: consumption.reasonCode,
      reason: consumption.reason
    };
  }

  if (!request.interpreter?.enabled) {
    return {
      allowed: true,
      stage: 'consumption',
      evaluation,
      consumption,
      reasonCode: capabilityAccessReasonCodes.ACCESS_ALLOWED,
      reason: CAPABILITY_FLOW_ALLOWED_REASON
    };
  }

  const interpretation = interpretWithCapability({
    resource: normalizeResourceForInterpreter(request.resource),
    input: {
      query: request.interpreter.query,
      context: request.interpreter.context
    }
  });

  return {
    allowed: interpretation.allowed,
    stage: 'interpretation',
    evaluation,
    consumption,
    interpretation,
    reasonCode: interpretation.allowed
      ? capabilityAccessReasonCodes.ACCESS_ALLOWED
      : interpretation.error?.code ?? 'INTERPRETER_EXECUTION_FAILED',
    reason:
      interpretation.allowed
        ? CAPABILITY_FLOW_ALLOWED_REASON
        : interpretation.error?.message ?? 'Interpreter execution failed.'
  };
}
