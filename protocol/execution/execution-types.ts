import type { ScopeEntry } from '../consent/consent-types';
import type { EnforcementDecision, EnforcementReasonCode } from '../enforcement/enforcement-types';

export const EXECUTION_REASON_CODES = {
  ...{
    CAPABILITY_INVALID: 'CAPABILITY_INVALID',
    CAPABILITY_EXPIRED: 'CAPABILITY_EXPIRED',
    CAPABILITY_REVOKED: 'CAPABILITY_REVOKED',
    CAPABILITY_REVOCATION_UNKNOWN: 'CAPABILITY_REVOCATION_UNKNOWN',
    CAPABILITY_NOT_YET_ACTIVE: 'CAPABILITY_NOT_YET_ACTIVE',
    SCOPE_NOT_ALLOWED: 'SCOPE_NOT_ALLOWED',
    PERMISSION_NOT_ALLOWED: 'PERMISSION_NOT_ALLOWED',
    SUBJECT_MISMATCH: 'SUBJECT_MISMATCH',
    GRANTEE_MISMATCH: 'GRANTEE_MISMATCH',
    MARKET_MAKER_MISMATCH: 'MARKET_MAKER_MISMATCH',
    REQUEST_INVALID: 'REQUEST_INVALID',
  },
  EXECUTION_REQUEST_INVALID: 'EXECUTION_REQUEST_INVALID',
  EXECUTION_AUTHORIZED: 'EXECUTION_AUTHORIZED',
} as const;

export type ExecutionReasonCode =
  | EnforcementReasonCode
  | (typeof EXECUTION_REASON_CODES)['EXECUTION_REQUEST_INVALID']
  | (typeof EXECUTION_REASON_CODES)['EXECUTION_AUTHORIZED'];

export type ExecutionResource = {
  type: 'field' | 'content' | 'pack';
  ref: string;
};

export type ExecutionTarget = {
  adapter: string;
  operation: string;
};

export type ExecutionRequest = {
  capability: unknown;
  consent: unknown;
  requested_scope: ScopeEntry[];
  requested_permissions: string[];
  subject?: string;
  grantee?: string;
  marketMakerId?: string;
  resource?: ExecutionResource | null;
  execution_target: ExecutionTarget;
  action_context?: Record<string, unknown>;
  payload?: Record<string, unknown> | null;
  now?: Date;
};

export type NormalizedExecutionRequest = {
  capability: unknown;
  consent: unknown;
  requested_scope: ScopeEntry[];
  requested_permissions: string[];
  subject?: string;
  grantee?: string;
  marketMakerId?: string;
  resource?: ExecutionResource | null;
  execution_target: ExecutionTarget;
  action_context?: Record<string, unknown>;
  payload?: Record<string, unknown> | null;
  now?: Date;
};

export type ExecutionContract = {
  adapter: string;
  operation: string;
  subject: string;
  grantee: string;
  allowed_scope: ScopeEntry[];
  allowed_permissions: string[];
  capability_hash: string;
  parent_consent_hash: string;
  marketMakerId?: string;
  resource?: ExecutionResource | null;
  action_context?: Record<string, unknown>;
  issued_at: string;
};

export type ExecutionAuthorizationResult = {
  authorized: boolean;
  decision: 'authorized' | 'rejected';
  reason_code: ExecutionReasonCode;
  reasons: string[];
  evaluated_at: string;
  execution_target: ExecutionTarget;
  normalized_request?: NormalizedExecutionRequest;
  enforcement_decision?: EnforcementDecision;
  execution_contract?: ExecutionContract;
  authorization_token?: string | null;
};
