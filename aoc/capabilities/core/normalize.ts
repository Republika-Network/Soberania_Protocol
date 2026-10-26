import { validateCapabilityToken } from '../../../capability';
import { validateConsentObject } from '../../../consent';
import { validateCapabilityAction } from '../../../shared/capabilityActions';
import type { ScopeEntry } from '../../../consent/types';
import {
  capabilityAccessReasonCodes,
  type CapabilityAccessReasonCode
} from './reasonCodes';
import {
  CapabilityAccessInputError,
  isCapabilityAccessInputError
} from './errors';
import type {
  CapabilityAccessRequest,
  CapabilityAccessDecision,
  CapabilityAccessMetadata,
  CapabilityAccessChecks,
  NormalizedCapability,
  NormalizedCapabilityAccessRequest
} from './types';

const ISO8601_UTC_PATTERN =
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/;

function baseChecks(): CapabilityAccessChecks {
  return {
    integrity: 'fail',
    temporal: 'not_applicable',
    action: 'fail',
    resource: 'fail',
    marketMaker: 'not_applicable',
    usage: 'not_applicable',
    policy: 'not_applicable'
  };
}

function baseMetadata(): CapabilityAccessMetadata {
  return { failureStage: 'integrity' };
}

export function denyDecision(
  evaluatedAt: string,
  reasonCode: CapabilityAccessReasonCode,
  reason: string,
  checks: CapabilityAccessChecks = baseChecks(),
  metadata: Partial<CapabilityAccessMetadata & Record<string, unknown>> = {}
): CapabilityAccessDecision {
  return {
    allowed: false,
    decision: 'deny',
    reasonCode,
    reason,
    evaluatedAt,
    checks,
    metadata: {
      ...baseMetadata(),
      ...metadata
    }
  };
}

export function allowDecision(
  evaluatedAt: string,
  reason: string,
  checks: CapabilityAccessChecks,
  metadata: Partial<CapabilityAccessMetadata & Record<string, unknown>> = {}
): CapabilityAccessDecision {
  return {
    allowed: true,
    decision: 'allow',
    reasonCode: capabilityAccessReasonCodes.ACCESS_ALLOWED,
    reason,
    evaluatedAt,
    checks,
    metadata: {
      failureStage: 'completed',
      ...metadata
    }
  };
}

export function normalizeEvaluationTime(now?: string | number | Date): string {
  if (now === undefined) {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  const date = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(date.getTime())) {
    throw new CapabilityAccessInputError(
      capabilityAccessReasonCodes.CAPABILITY_INVALID,
      'Evaluation timestamp must be a valid date.'
    );
  }

  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function isScopeEntry(value: unknown): value is ScopeEntry {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as ScopeEntry).type === 'string' &&
      typeof (value as ScopeEntry).ref === 'string'
  );
}

function normalizeResource(resource: CapabilityAccessRequest['resource']): ScopeEntry {
  if (typeof resource === 'string') {
    const [type, ref, ...rest] = resource.split(':');
    if (!type || !ref || rest.length > 0) {
      throw new CapabilityAccessInputError(
        capabilityAccessReasonCodes.RESOURCE_MISSING,
        'Requested resource must be a ScopeEntry or a "type:ref" string.'
      );
    }
    return { type: type as ScopeEntry['type'], ref };
  }

  if (!isScopeEntry(resource)) {
    throw new CapabilityAccessInputError(
      capabilityAccessReasonCodes.RESOURCE_MISSING,
      'Requested resource must include string type and ref fields.'
    );
  }

  return { type: resource.type as ScopeEntry['type'], ref: resource.ref };
}

function normalizeCapability(
  capability: CapabilityAccessRequest['capability']
): NormalizedCapability {
  if (!capability) {
    throw new CapabilityAccessInputError(
      capabilityAccessReasonCodes.CAPABILITY_MISSING,
      'Capability is required for access evaluation.'
    );
  }

  try {
    validateCapabilityToken(capability as any);
  } catch (error) {
    const message = (error as Error).message || 'Capability could not be validated safely.';
    throw new CapabilityAccessInputError(
      capabilityAccessReasonCodes.CAPABILITY_INVALID,
      message
    );
  }

  const rawCapability = capability as Record<string, unknown>;
  const status =
    typeof rawCapability.status === 'string'
      ? rawCapability.status.toLowerCase()
      : null;
  const marketMakerId =
    typeof rawCapability.marketMakerId === 'string'
      ? rawCapability.marketMakerId
      : typeof rawCapability.market_maker_id === 'string'
        ? rawCapability.market_maker_id
        : null;

  return {
    raw: capability,
    permissions: Array.isArray((capability as any).permissions) ? [...((capability as any).permissions as string[])] : [],
    scope: Array.isArray((capability as any).scope) ? [...((capability as any).scope as ScopeEntry[])] : [],
    notBefore:
      typeof rawCapability.not_before === 'string'
        ? rawCapability.not_before
        : typeof rawCapability.startsAt === 'string'
          ? rawCapability.startsAt
          : null,
    expiresAt:
      typeof rawCapability.expires_at === 'string'
        ? rawCapability.expires_at
        : typeof rawCapability.expiresAt === 'string'
          ? rawCapability.expiresAt
          : '',
    status:
      status === 'active' ||
      status === 'inactive' ||
      status === 'revoked' ||
      status === 'suspended'
        ? status
        : null,
    marketMakerId,
    capabilityHash:
      typeof rawCapability.capability_hash === 'string'
        ? rawCapability.capability_hash
        : undefined,
    tokenId:
      typeof rawCapability.token_id === 'string'
        ? rawCapability.token_id
        : undefined,
    consentRef:
      typeof rawCapability.consent_ref === 'string'
        ? rawCapability.consent_ref
        : undefined
  };
}

function validateIsoTimestamp(value: string | null, fieldName: string): void {
  if (value === null) {
    return;
  }

  if (!ISO8601_UTC_PATTERN.test(value)) {
    throw new CapabilityAccessInputError(
      capabilityAccessReasonCodes.CAPABILITY_INVALID,
      `${fieldName} must be ISO 8601 UTC format.`
    );
  }
}

export function normalizeCapabilityAccessRequest(
  input: CapabilityAccessRequest,
  evaluatedAt: string
): NormalizedCapabilityAccessRequest {
  if (typeof input.action !== 'string' || input.action.trim() === '') {
    throw new CapabilityAccessInputError(
      capabilityAccessReasonCodes.ACTION_MISSING,
      'Requested action is required for access evaluation.'
    );
  }

  try {
    validateCapabilityAction(input.action.trim(), 'Requested action');
  } catch (error) {
    throw new CapabilityAccessInputError(
      capabilityAccessReasonCodes.CAPABILITY_INVALID,
      (error as Error).message || 'Requested action could not be validated safely.'
    );
  }

  const normalizedCapability = normalizeCapability(input.capability);
  validateIsoTimestamp(normalizedCapability.notBefore, 'Capability not_before');
  validateIsoTimestamp(normalizedCapability.expiresAt, 'Capability expires_at');

  // Decide on a private copy, so the consent that is verified is the one used.
  const consent = input.consent ? (JSON.parse(JSON.stringify(input.consent)) as typeof input.consent) : input.consent;
  if (consent) {
    try {
      validateConsentObject(consent);
    } catch (error) {
      throw new CapabilityAccessInputError(
        capabilityAccessReasonCodes.CONSENT_INVALID,
        (error as Error).message || 'Consent could not be validated safely.'
      );
    }
  }

  return {
    capability: normalizedCapability,
    consent,
    action: input.action.trim(),
    resource: normalizeResource(input.resource),
    marketMakerId: input.marketMakerId,
    evaluatedAt,
    usageContext: input.usageContext ? { ...input.usageContext } : undefined,
    policyContext: input.policyContext ? { ...input.policyContext } : undefined,
    metadata: input.metadata ? { ...input.metadata } : undefined,
    revocationRegistry: input.registries?.revocationRegistry
  };
}

export function classifyIntegrityError(error: unknown): {
  code: CapabilityAccessReasonCode;
  message: string;
} {
  if (isCapabilityAccessInputError(error)) {
    return {
      code: error.code,
      message: error.message
    };
  }

  const unexpectedError = error as Error;
  return {
    code: capabilityAccessReasonCodes.CAPABILITY_INVALID,
    message:
      unexpectedError?.message || 'Capability could not be validated safely.'
  };
}
