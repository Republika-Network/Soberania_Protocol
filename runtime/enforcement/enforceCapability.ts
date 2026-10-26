import { randomUUID } from 'crypto';
import type { AuditEvent } from '../../protocol/audit';
import { authorizeWithCapability } from '../../protocol/consent/capability-authorize';
import type { CapabilityAuthorizationResult, CapabilityToken } from '../../protocol/consent/capability-types';

/**
 * The only enforcement mode. The former `soft` mode, which allowed a request that carried no
 * capability token through with `CAPABILITY_SOFT_ALLOW_MISSING`, was removed (SOBE-SEC-03J).
 */
export type EnforcementMode = 'strict';

export type CapabilityRequestContext = {
  endpoint: string;
  headers: Record<string, string | string[] | undefined>;
  payload: unknown;
  subject_id: string;
  requester_id: string;
  mode: EnforcementMode;
  capabilitySecret: string;
};

export type CapabilityEnforcementResult = {
  allowed: boolean;
  reason_code: string;
  status_code: number;
  token_present: boolean;
  authorization?: CapabilityAuthorizationResult;
  auditEvent?: AuditEvent;
};

function normalizeHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function maybeParseCapabilityHeader(value: string | undefined): unknown {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function getCapabilityFromPayload(payload: unknown): unknown {
  if (payload === null || typeof payload !== 'object') {
    return undefined;
  }

  const candidate = payload as { capability?: unknown; capability_token?: unknown; token?: unknown };
  if (candidate.capability !== undefined) {
    return candidate.capability;
  }
  if (candidate.capability_token !== undefined) {
    return candidate.capability_token;
  }
  if (candidate.token !== undefined) {
    return candidate.token;
  }

  return undefined;
}

function extractCapabilityToken(context: CapabilityRequestContext): unknown {
  const headerToken = maybeParseCapabilityHeader(normalizeHeaderValue(context.headers['x-aoc-capability']));
  if (headerToken !== undefined) {
    return headerToken;
  }

  return getCapabilityFromPayload(context.payload);
}

/**
 * The `CAPABILITY_DENIED` audit event, in the exact shape `protocol/audit/builders.ts`'s
 * `buildCapabilityDeniedEvent` emits (hosted `InMemoryAuditService` consumes it as a legacy
 * event). Built here rather than imported because that module carries pre-existing type errors
 * (baseline) which would stop this file's fail-closed contract test from running under ts-jest
 * with diagnostics on; the path is disabled, so only the denied variant is ever needed.
 */
function buildAudit(result: CapabilityAuthorizationResult, context: CapabilityRequestContext): AuditEvent {
  const event = {
    allowed: result.allowed,
    reason_code: result.reason_code,
    subject_id: context.subject_id,
    requester_id: context.requester_id,
    resource: context.endpoint,
    action: 'execute',
    capability_id: result.capability_id,
    metadata: {
      enforcement_mode: context.mode,
    },
    event_id: randomUUID(),
    event_type: 'CAPABILITY_DENIED',
    occurred_at: new Date().toISOString(),
  };

  return event as unknown as AuditEvent;
}

/**
 * HMAC capability enforcement is DISABLED (SOBE-SEC-03J): this function always denies.
 *
 * - No token: `CAPABILITY_MISSING` (403). There is no mode in which a missing token is allowed.
 * - A token: it is still evaluated by `authorizeWithCapability` so the audit event and
 *   `authorization.reason_code` say why (invalid, mismatched, or `CAPABILITY_PATH_DISABLED`
 *   for a token that would otherwise have matched), and the request is denied
 *   `CAPABILITY_DENIED` (403) regardless.
 *
 * Not exported from `runtime/enforcement/index.ts` or any stable surface;
 * `scripts/check-runtime-export-governance.mjs` enforces that. See
 * `protocol/consent/capability-authorize.ts` for what re-enabling would require.
 */
export function enforceCapabilityAccess(context: CapabilityRequestContext): CapabilityEnforcementResult {
  const token = extractCapabilityToken(context);
  const tokenPresent = token !== undefined;

  if (!tokenPresent) {
    const authorization: CapabilityAuthorizationResult = {
      allowed: false,
      reason_code: 'DENY_INVALID_CAPABILITY',
      evaluated_at: new Date().toISOString(),
      capability_id: null,
    };

    return {
      allowed: false,
      reason_code: 'CAPABILITY_MISSING',
      status_code: 403,
      token_present: false,
      authorization,
      auditEvent: buildAudit(authorization, context),
    };
  }

  const authorization = authorizeWithCapability(
    {
      subject_id: context.subject_id,
      requester_id: context.requester_id,
      resource: context.endpoint,
      action: 'execute',
    },
    token,
    context.capabilitySecret
  );

  // The path is disabled: deny even if the authorizer were ever to report an allow.
  return {
    allowed: false,
    reason_code: 'CAPABILITY_DENIED',
    status_code: 403,
    token_present: true,
    authorization: authorization.allowed ? { ...authorization, allowed: false, reason_code: 'CAPABILITY_PATH_DISABLED' } : authorization,
    auditEvent: buildAudit(authorization, context),
  };
}

export function asCapabilityToken(token: unknown): CapabilityToken | undefined {
  if (!token || typeof token !== 'object') {
    return undefined;
  }
  return token as CapabilityToken;
}
