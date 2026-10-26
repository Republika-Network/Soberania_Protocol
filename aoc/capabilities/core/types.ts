import type { MarketMakerRegistry, MarketMakerStatus } from '../../../shared/marketMakerRegistry';
import type { CapabilityTokenV1 } from '../../../capability';
import type { RevocationRegistry } from '../../../capability/registries/RevocationRegistry';
import type { ConsentObjectV1, ScopeEntry } from '../../../consent/types';
import type { CapabilityAccessReasonCode } from './reasonCodes';

export type CapabilityStatus = 'active' | 'inactive' | 'revoked' | 'suspended';

export type CapabilityResource = string | ScopeEntry | {
  type: string;
  ref: string;
};

export type CapabilityCheckState = 'pass' | 'fail' | 'not_applicable';

export type CapabilityAccessChecks = {
  integrity: CapabilityCheckState;
  temporal: CapabilityCheckState;
  action: CapabilityCheckState;
  resource: CapabilityCheckState;
  marketMaker: CapabilityCheckState;
  usage: CapabilityCheckState;
  policy: CapabilityCheckState;
};

export type CapabilityAccessMetadata = {
  capabilityHash?: string;
  tokenId?: string;
  consentRef?: string;
  matchedResource?: string;
  matchedAction?: string;
  marketMakerId?: string;
  boundMarketMakerId?: string;
  marketMakerStatus?: MarketMakerStatus;
  failureStage:
    | 'integrity'
    | 'revocation'
    | 'temporal'
    | 'action'
    | 'resource'
    | 'marketMaker'
    | 'usage'
    | 'policy'
    | 'completed';
};

export type CapabilityAccessHookResult = {
  allowed: boolean;
  reasonCode?: CapabilityAccessReasonCode;
  reason?: string;
  metadata?: Record<string, unknown>;
};

export type CapabilityPolicyHook = (input: NormalizedCapabilityAccessRequest) => CapabilityAccessHookResult;
export type CapabilityUsageHook = (input: NormalizedCapabilityAccessRequest) => CapabilityAccessHookResult;

export type CapabilityAccessRequest = {
  capability: CapabilityTokenV1 | (Record<string, unknown> & {
    permissions?: unknown;
    scope?: unknown;
    status?: unknown;
    marketMakerId?: unknown;
    market_maker_id?: unknown;
    not_before?: unknown;
    startsAt?: unknown;
    expires_at?: unknown;
    expiresAt?: unknown;
    capability_hash?: unknown;
    token_id?: unknown;
    consent_ref?: unknown;
  }) | null | undefined;
  consent?: ConsentObjectV1 | null;
  action: string;
  resource: CapabilityResource;
  marketMakerId?: string;
  now?: string | number | Date;
  usageContext?: Record<string, unknown>;
  policyContext?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  marketMakerRegistry?: Pick<MarketMakerRegistry, 'exists' | 'getStatus'>;
  hooks?: {
    usage?: CapabilityUsageHook;
    policy?: CapabilityPolicyHook;
  };
  /**
   * The revocation registry the decision is made against. Required: without it
   * the decision is REVOCATION_UNAVAILABLE (deny); there is no implicit default.
   */
  registries?: {
    revocationRegistry?: RevocationRegistry;
  };
};

export type NormalizedCapability = {
  raw: CapabilityAccessRequest['capability'];
  permissions: readonly string[];
  scope: readonly ScopeEntry[];
  notBefore: string | null;
  expiresAt: string;
  status: CapabilityStatus | null;
  marketMakerId: string | null;
  capabilityHash?: string;
  tokenId?: string;
  consentRef?: string;
};

export type NormalizedCapabilityAccessRequest = {
  capability: NormalizedCapability;
  consent?: ConsentObjectV1 | null;
  action: string;
  resource: ScopeEntry;
  marketMakerId?: string;
  evaluatedAt: string;
  usageContext?: Record<string, unknown>;
  policyContext?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  revocationRegistry?: RevocationRegistry;
};

export type CapabilityAccessDecision = {
  allowed: boolean;
  decision: 'allow' | 'deny';
  reasonCode: CapabilityAccessReasonCode;
  reason: string;
  evaluatedAt: string;
  checks: CapabilityAccessChecks;
  metadata: CapabilityAccessMetadata & Record<string, unknown>;
};
