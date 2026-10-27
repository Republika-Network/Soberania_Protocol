import { CapabilityRuntime } from "@aoc-runtime/capability-runtime";
import { ConsentRuntime } from "@aoc-runtime/consent-runtime";
import { GovernanceRuntime } from "@aoc-runtime/governance-runtime";
import type { TrustedSigningKey } from "@aoc-runtime/crypto";
import { ActorRef, ActorType, AuthorizationDecisionEnvelope, AuthorizationFailedStage, GovernanceScope, NamespaceRef, GovernanceSignature, TrustBoundaryScope } from "@aoc-runtime/shared-types";
/**
 * The decision shape handed to an audit finalizer. Structurally identical to
 * `RuntimeDecisionEnvelope` in `@aoc/enterprise/assurance/audit`, declared here
 * so this package's declarations depend only on the runtime packages it ships
 * with.
 */
export interface FinalizableDecision {
    decision: "allow" | "deny";
    allowed: boolean;
    failedStage?: AuthorizationFailedStage;
    reasoningChain: string[];
    obligations: unknown[];
    provenance: Record<string, unknown>;
    explainability: Record<string, unknown>;
}
/**
 * What `AuthorizationRuntime` requires of its audit dependency, and all it
 * calls: annotate an already-final decision and return it. `AuditRuntime` from
 * `@aoc/enterprise/assurance/audit` satisfies it.
 */
export interface AuthorizationDecisionFinalizer {
    finalizeDecision<T extends FinalizableDecision>(decision: T): T;
}
/** Signed alongside a federated request. Structurally identical to the type of the same name in `@aoc/enterprise/assurance/trust`. */
export interface FederatedAuthorityClaims {
    audience: string;
    issuedAt: string;
    expiresAt: string;
    nonce: string;
}
/** The request a federated authority signature is bound to. Structurally identical to the type of the same name in `@aoc/enterprise/assurance/trust`. */
export interface FederatedAuthorityRequest {
    actor: {
        actorId: string;
        actorType: ActorType;
        organizationId: string;
    };
    machineActorId?: string;
    action: string;
    resource: string;
    scopeId: string;
    namespace: NamespaceRef;
    trustScope: TrustBoundaryScope;
}
/** Only what a successful verification authenticated. Structurally identical to the type of the same name in `@aoc/enterprise/assurance/trust`. */
export interface VerifiedFederatedAuthority {
    verified: true;
    signer: TrustedSigningKey;
    claims: FederatedAuthorityClaims;
    trustScope: TrustBoundaryScope;
    trustedAuthorityPath: string[];
}
/** The fields of a verification result this runtime reads. `FederatedAuthorityVerification` in `@aoc/enterprise/assurance/trust` satisfies it. */
export interface FederatedAuthorityVerificationResult {
    trusted: boolean;
    rejectedAuthorityPath: string[];
    revokedIntermediaries: string[];
    authority?: VerifiedFederatedAuthority;
}
/**
 * What `AuthorizationRuntime` requires of a federated authority verifier, and
 * all it calls. `FederatedAuthorityVerifier` from `@aoc/enterprise/assurance/trust`
 * satisfies it.
 */
export interface FederatedAuthorityVerifierPort {
    verify(request: FederatedAuthorityRequest, assertion: {
        claims: FederatedAuthorityClaims;
        signature: GovernanceSignature;
    }, options?: {
        requestedAt?: string;
    }): Promise<FederatedAuthorityVerificationResult>;
}
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
    constructor(governance: GovernanceRuntime, capability: CapabilityRuntime, consent: ConsentRuntime, audit: AuthorizationDecisionFinalizer, federatedAuthorityVerifier?: FederatedAuthorityVerifierPort | undefined);
    evaluate(input: AuthorizationInput): Promise<AuthorizationDecision>;
}
export {};
//# sourceMappingURL=index.d.ts.map