import { AuditRuntime } from "@aoc-runtime/audit-runtime";
import { CapabilityRuntime } from "@aoc-runtime/capability-runtime";
import { ConsentRuntime } from "@aoc-runtime/consent-runtime";
import { GovernanceRuntime } from "@aoc-runtime/governance-runtime";
import { ActorRef, AuthorizationDecisionEnvelope, AuthorizationFailedStage, GovernanceScope, NamespaceRef, GovernanceSignature, TrustBoundaryScope } from "@aoc-runtime/shared-types";
import { FederatedAuthorityClaims, FederatedAuthorityVerifier } from "@aoc-runtime/trust-registry-runtime";
export type PolicyValue = string | number | boolean | null | string[] | number[] | boolean[];
export type PolicyFieldPath = `actor.${string}` | `namespace.${string}` | `workspace.${string}` | `machine.${string}` | `capability.${string}` | `runtime.${string}` | `temporal.${string}` | string;
export interface PolicyFieldRef {
    path: PolicyFieldPath;
}
export type PolicyOperand = PolicyValue | PolicyFieldRef;
interface BaseCondition {
    id?: string;
    source?: string;
}
export interface PolicyEqualsCondition extends BaseCondition {
    op: "equals";
    left: PolicyOperand;
    right: PolicyOperand;
}
export interface PolicyNotEqualsCondition extends BaseCondition {
    op: "not_equals";
    left: PolicyOperand;
    right: PolicyOperand;
}
export interface PolicyInCondition extends BaseCondition {
    op: "in";
    left: PolicyOperand;
    right: PolicyOperand;
}
export interface PolicyNotInCondition extends BaseCondition {
    op: "not_in";
    left: PolicyOperand;
    right: PolicyOperand;
}
export interface PolicyGreaterThanCondition extends BaseCondition {
    op: "greater_than";
    left: PolicyOperand;
    right: PolicyOperand;
}
export interface PolicyLessThanCondition extends BaseCondition {
    op: "less_than";
    left: PolicyOperand;
    right: PolicyOperand;
}
export interface PolicyContainsCondition extends BaseCondition {
    op: "contains";
    left: PolicyOperand;
    right: PolicyOperand;
}
export interface PolicyExistsCondition extends BaseCondition {
    op: "exists";
    field: PolicyFieldRef;
}
export interface PolicyBeforeCondition extends BaseCondition {
    op: "before";
    at: PolicyOperand;
}
export interface PolicyAfterCondition extends BaseCondition {
    op: "after";
    at: PolicyOperand;
}
export interface PolicyExpiresInCondition extends BaseCondition {
    op: "expires_in";
    start: PolicyOperand;
    durationSeconds: number;
}
export interface PolicyActiveWindowCondition extends BaseCondition {
    op: "active_window";
    start: PolicyOperand;
    end: PolicyOperand;
}
export interface PolicyAndCondition extends BaseCondition {
    op: "and";
    conditions: PolicyCondition[];
}
export interface PolicyOrCondition extends BaseCondition {
    op: "or";
    conditions: PolicyCondition[];
}
export interface PolicyNotCondition extends BaseCondition {
    op: "not";
    condition: PolicyCondition;
}
export type PolicyCondition = PolicyEqualsCondition | PolicyNotEqualsCondition | PolicyInCondition | PolicyNotInCondition | PolicyGreaterThanCondition | PolicyLessThanCondition | PolicyContainsCondition | PolicyExistsCondition | PolicyBeforeCondition | PolicyAfterCondition | PolicyExpiresInCondition | PolicyActiveWindowCondition | PolicyAndCondition | PolicyOrCondition | PolicyNotCondition;
export interface PolicyObligation {
    code: string;
    reason?: string;
    metadata?: Record<string, unknown>;
}
export interface PolicyFragment {
    id: string;
    condition: PolicyCondition;
    source?: string;
}
export interface RuntimePolicy {
    id: string;
    source?: string;
    effect: "allow" | "deny";
    condition: PolicyCondition;
    obligations?: PolicyObligation[];
    extends?: string[];
}
export interface PolicyTraceEntry {
    conditionId: string;
    op: PolicyCondition["op"];
    passed: boolean;
    source?: string;
    detail: string;
}
export interface PolicyEvaluationResult {
    decision: "allow" | "deny";
    obligations: PolicyObligation[];
    traces: PolicyTraceEntry[];
    matchedConditions: string[];
    failedConditions: string[];
    inheritedPolicySources: string[];
    triggeredObligations: string[];
}
export interface PolicyRuntimeContext {
    actor: ActorRef;
    namespace: NamespaceRef;
    scope: GovernanceScope;
    action: string;
    resource: string;
    machineActor?: ActorRef;
    capability?: Record<string, unknown>;
    workspace?: Record<string, unknown>;
    runtime?: Record<string, unknown>;
    temporal?: {
        now?: string;
        [key: string]: unknown;
    };
    at?: string;
}
/**
 * A federated authority's signed assertion for this request. The signature
 * must cover the request's actor, action, resource, scope and namespace
 * together with `claims` (see `buildFederatedAuthorityPayload`).
 *
 * - Any value other than `undefined`, including `null`, counts as supplied and
 *   must verify; anything that does not is denied (fails closed).
 * - When it is supplied, `AuthorizationInput.at`, if set, must be within the
 *   verifier's clock skew of its clock, or the request is denied.
 * - Verification consumes the assertion's nonce before policy, governance,
 *   capability and consent are evaluated; a denial by any of them does not
 *   restore it (see `FederatedAuthorityVerifier`).
 */
export interface FederatedAuthorityInput {
    claims: FederatedAuthorityClaims;
    signature: GovernanceSignature;
    scope: TrustBoundaryScope;
    provenance?: Record<string, unknown>;
}
export interface AuthorizationInput extends PolicyRuntimeContext {
    at?: string;
    policies?: RuntimePolicy[];
    policyFragments?: PolicyFragment[];
    providerMetadata?: Record<string, unknown>;
    organizationTopology?: Record<string, unknown>;
    federatedAuthority?: FederatedAuthorityInput;
}
export interface AuthorizationDecision extends Omit<AuthorizationDecisionEnvelope, "obligations"> {
    failedStage?: AuthorizationFailedStage;
    obligations: PolicyObligation[];
}
export declare class AuthorizationRuntime {
    private readonly governance;
    private readonly capability;
    private readonly consent;
    private readonly audit;
    private readonly federatedAuthorityVerifier?;
    private readonly policyEngine;
    constructor(governance: GovernanceRuntime, capability: CapabilityRuntime, consent: ConsentRuntime, audit: AuditRuntime, federatedAuthorityVerifier?: FederatedAuthorityVerifier | undefined);
    evaluate(input: AuthorizationInput): Promise<AuthorizationDecision>;
}
export {};
//# sourceMappingURL=index.d.ts.map