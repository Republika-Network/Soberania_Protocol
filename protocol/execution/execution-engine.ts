import { evaluateEnforcement } from '../enforcement/enforcement-engine';
import type { RevocationCheckPort } from '../revocation';
import { EXECUTION_REASON_CODES } from './execution-types';
import type { ExecutionAuthorizationResult, ExecutionRequest } from './execution-types';
import { parseExecutionRequest, normalizeExecutionRequest } from './execution-request';
import { buildExecutionContract } from './execution-contract';
import { buildAuthorizedExecutionResult, buildRejectedExecutionResult } from './execution-result';

function resolveExecutionTarget(input: unknown): { adapter: string; operation: string } {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { adapter: 'unknown', operation: 'unknown' };
  }

  const record = input as Record<string, unknown>;
  return {
    adapter: typeof record.adapter === 'string' && record.adapter.trim() !== '' ? record.adapter.trim() : 'unknown',
    operation:
      typeof record.operation === 'string' && record.operation.trim() !== '' ? record.operation.trim() : 'unknown',
  };
}

export function authorizeExecution(
  request: ExecutionRequest,
  checkRevocation: RevocationCheckPort
): ExecutionAuthorizationResult {
  const now = request.now ?? new Date();
  const fallbackTarget = resolveExecutionTarget((request as unknown as { execution_target?: unknown }).execution_target);

  let normalizedRequest;
  try {
    normalizedRequest = normalizeExecutionRequest(parseExecutionRequest(request));
  } catch (error) {
    return buildRejectedExecutionResult({
      reason_code: EXECUTION_REASON_CODES.EXECUTION_REQUEST_INVALID,
      reasons: [error instanceof Error ? error.message : 'Execution request parsing failed.'],
      now,
      execution_target: fallbackTarget,
    });
  }

  const enforcementDecision = evaluateEnforcement(
    {
      capability: normalizedRequest.capability,
      consent: normalizedRequest.consent,
      requested_scope: normalizedRequest.requested_scope,
      requested_permissions: normalizedRequest.requested_permissions,
      subject: normalizedRequest.subject,
      grantee: normalizedRequest.grantee,
      marketMakerId: normalizedRequest.marketMakerId,
      resource: normalizedRequest.resource,
      action_context: normalizedRequest.action_context,
      now: normalizedRequest.now ?? now,
    },
    checkRevocation
  );

  if (!enforcementDecision.allowed || enforcementDecision.normalized_capability === undefined) {
    return buildRejectedExecutionResult({
      reason_code: enforcementDecision.reason_code,
      reasons: enforcementDecision.reasons,
      now,
      execution_target: normalizedRequest.execution_target,
      normalized_request: normalizedRequest,
      enforcement_decision: enforcementDecision,
    });
  }

  const executionContract = buildExecutionContract({
    normalized_request: normalizedRequest,
    normalized_capability: enforcementDecision.normalized_capability,
    issued_at: now.toISOString(),
  });

  return buildAuthorizedExecutionResult({
    now,
    execution_target: normalizedRequest.execution_target,
    normalized_request: normalizedRequest,
    enforcement_decision: enforcementDecision,
    execution_contract: executionContract,
  });
}
