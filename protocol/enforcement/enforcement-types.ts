import type { ScopeEntry } from '../consent/consent-types';
import type { ProtocolCapability } from '../capability/capability-types';

export const ENFORCEMENT_REASON_CODES = {
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
  CONSENT_INVALID: 'CONSENT_INVALID',
  CONSENT_MISMATCH: 'CONSENT_MISMATCH',
  CONSENT_INACTIVE: 'CONSENT_INACTIVE',
  CONSENT_UNAUTHENTICATED: 'CONSENT_UNAUTHENTICATED',
  REQUEST_INVALID: 'REQUEST_INVALID',
  ENFORCEMENT_ALLOW: 'ENFORCEMENT_ALLOW',
} as const;

export type EnforcementReasonCode = (typeof ENFORCEMENT_REASON_CODES)[keyof typeof ENFORCEMENT_REASON_CODES];

export type EnforcementResource = {
  type: 'field' | 'content' | 'pack';
  ref: string;
};

/**
 * Wire-safe request shape. Deliberately has no revocation field: revocation status can never be
 * trusted from client-supplied JSON (a function cannot cross a JSON boundary, and a client-sent
 * status would be meaningless from a security standpoint). The trusted caller supplies a
 * `RevocationCheckPort` as a separate argument to `evaluateEnforcement`.
 */
export type EnforcementRequest = {
  capability: unknown;
  /**
   * Required: the parent consent the capability was minted from. The capability
   * is allowed only while this consent is active and only within its scope and
   * permissions. The consent's subject is not authenticated by this check.
   */
  consent: unknown;
  requested_scope: ScopeEntry[];
  requested_permissions: string[];
  subject?: string;
  grantee?: string;
  marketMakerId?: string;
  resource?: EnforcementResource | null;
  action_context?: Record<string, unknown>;
  now?: Date;
};

export type NormalizedEnforcementRequest = {
  capability: unknown;
  consent: unknown;
  requested_scope: ScopeEntry[];
  requested_permissions: string[];
  subject?: string;
  grantee?: string;
  marketMakerId?: string;
  resource?: EnforcementResource | null;
  action_context?: Record<string, unknown>;
  now?: Date;
};

export type EnforcementDecision = {
  allowed: boolean;
  decision: 'allow' | 'deny';
  reason_code: EnforcementReasonCode;
  reasons: string[];
  evaluated_at: string;
  normalized_request?: NormalizedEnforcementRequest;
  normalized_capability?: ProtocolCapability;
  matched_scope?: ScopeEntry[];
  matched_permissions?: string[];
};
