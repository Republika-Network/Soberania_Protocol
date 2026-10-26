import { consumeCapabilityAccess } from '../protocol/capabilities';
import { capabilityAccessReasonCodes, evaluateCapabilityAccess } from '../enforcement';
import type {
  AIInterpreterRequest,
  AIInterpreterResponse,
  InterpreterDependencies,
  InterpreterResolvedResource
} from './interpreterTypes';

const DETERMINISTIC_GUARDRAIL =
  'You are a deterministic interpreter. Only use provided data. Do not infer beyond given facts.';

type NormalizedResource = {
  type: 'field' | 'content' | 'pack';
  ref: string;
  key: string;
};

function normalizeUsageCount(response: AIInterpreterResponse['usage'] | undefined): number {
  return response?.usageCount ?? 0;
}

function denyResponse(
  code: string,
  message: string,
  usageCount = 0,
  payment?: AIInterpreterResponse['payment']
): AIInterpreterResponse {
  return {
    allowed: false,
    error: { code, message },
    usage: { usageCount },
    ...(payment ? { payment } : {})
  };
}

function normalizeResource(resource: string): NormalizedResource {
  const [type, ref, ...rest] = resource.trim().split(':');
  if (!type || !ref || rest.length > 0) {
    throw new Error('Interpreter resource must be a canonical "type:ref" string.');
  }

  if (type !== 'field' && type !== 'content' && type !== 'pack') {
    throw new Error('Interpreter resource type must be one of: field, content, pack.');
  }

  return {
    type,
    ref,
    key: `${type}:${ref}`
  };
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
    .join(',')}}`;
}

function resolveCapabilityData(
  request: AIInterpreterRequest,
  normalizedResource: NormalizedResource
): InterpreterResolvedResource {
  const context = request.input.context ?? {};
  const resourceMap =
    context.resources && typeof context.resources === 'object' && !Array.isArray(context.resources)
      ? (context.resources as Record<string, unknown>)
      : undefined;

  if (resourceMap && normalizedResource.key in resourceMap) {
    return {
      key: normalizedResource.key,
      data: resourceMap[normalizedResource.key]
    };
  }

  if (normalizedResource.key in context) {
    return {
      key: normalizedResource.key,
      data: context[normalizedResource.key]
    };
  }

  if (
    context.hrkeyReference &&
    typeof context.hrkeyReference === 'object' &&
    !Array.isArray(context.hrkeyReference)
  ) {
    const hrkeyReference = context.hrkeyReference as Record<string, unknown>;
    if (normalizedResource.key in hrkeyReference) {
      return {
        key: normalizedResource.key,
        data: hrkeyReference[normalizedResource.key]
      };
    }
  }

  throw new Error(`No capability-resolved data found for resource ${normalizedResource.key}.`);
}

export function runInterpreter(query: string, data: unknown): string {
  const normalizedQuery = query.trim();
  const serializedData = stableSerialize(data);

  return stableSerialize({
    instruction: DETERMINISTIC_GUARDRAIL,
    query: normalizedQuery,
    facts: data,
    conclusion: `Deterministic interpretation for "${normalizedQuery}" based only on provided data: ${serializedData}`
  });
}

export function interpretWithCapability(
  input: AIInterpreterRequest,
  dependencies: InterpreterDependencies = {}
): AIInterpreterResponse {
  try {
    const normalizedResource = normalizeResource(input.resource);

    const accessDecision = evaluateCapabilityAccess({
      capability: input.capability,
      consent: input.consent,
      action: input.action,
      resource: { type: normalizedResource.type, ref: normalizedResource.ref },
      now: input.now,
      marketMakerRegistry: dependencies.marketMakerRegistry,
      hooks: dependencies.hooks,
      registries: { revocationRegistry: dependencies.registries?.revocationRegistry }
    });

    if (!accessDecision.allowed) {
      return denyResponse(accessDecision.reasonCode, accessDecision.reason);
    }

    const paid = input.paymentContext?.paid === true;
    const payment = input.consent?.pricing
      ? {
          required: !paid,
          amount: input.consent.pricing.amount,
          currency: input.consent.pricing.currency
        }
      : undefined;

    if (payment?.required) {
      return denyResponse(
        capabilityAccessReasonCodes.PAYMENT_REQUIRED,
        'Payment is required before interpreter execution.',
        0,
        payment
      );
    }

    const consumeDecision = consumeCapabilityAccess({
      capability: input.capability,
      consent: input.consent,
      action: input.action,
      resource: { type: normalizedResource.type, ref: normalizedResource.ref },
      now: input.now,
      paymentContext: input.paymentContext,
      marketMakerRegistry: dependencies.marketMakerRegistry,
      hooks: dependencies.hooks,
      registries: {
        nonceRegistry: dependencies.registries?.nonceRegistry,
        revocationRegistry: dependencies.registries?.revocationRegistry
      },
      consume: false
    });

    if (!consumeDecision.allowed) {
      return denyResponse(
        consumeDecision.reasonCode,
        consumeDecision.reason,
        normalizeUsageCount(consumeDecision.usage),
        consumeDecision.payment
      );
    }

    const resolved = resolveCapabilityData(input, normalizedResource);
    const interpretation = runInterpreter(input.input.query, resolved.data);

    const usageState = dependencies.registries?.consentUsageRegistry?.record(
      input.capability.consent_ref,
      'allow',
      input.now ?? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
    );

    return {
      allowed: true,
      result: {
        interpretation,
        metadata: {
          resource: resolved.key,
          source:
            input.input.context?.hrkeyReference !== undefined ? 'hrkey-reference' : 'capability-context'
        }
      },
      usage: {
        usageCount: usageState?.usageCount ?? normalizeUsageCount(consumeDecision.usage)
      },
      ...(consumeDecision.payment ? { payment: consumeDecision.payment } : {})
    };
  } catch (error) {
    return denyResponse(
      capabilityAccessReasonCodes.INTERNAL_EVALUATION_ERROR,
      (error as Error).message || 'Interpreter execution failed.'
    );
  }
}
