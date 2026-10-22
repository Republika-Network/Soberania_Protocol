import { AuditRuntime } from "@aoc-runtime/audit-runtime";
import { CapabilityRuntime } from "@aoc-runtime/capability-runtime";
import { ConsentRuntime } from "@aoc-runtime/consent-runtime";
import { GovernanceRuntime } from "@aoc-runtime/governance-runtime";
import { ActorRef, AuthorizationDecisionEnvelope, AuthorizationFailedStage, GovernanceScope, NamespaceRef, GovernanceSignature, TrustBoundaryScope } from "@aoc-runtime/shared-types";
import { FederatedAuthorityClaims, FederatedAuthorityVerifier, VerifiedFederatedAuthority } from "@aoc-runtime/trust-registry-runtime";

export type PolicyValue = string | number | boolean | null | string[] | number[] | boolean[];

export type PolicyFieldPath =
  | `actor.${string}`
  | `namespace.${string}`
  | `workspace.${string}`
  | `machine.${string}`
  | `capability.${string}`
  | `runtime.${string}`
  | `temporal.${string}`
  | string;

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

export type PolicyCondition =
  | PolicyEqualsCondition
  | PolicyNotEqualsCondition
  | PolicyInCondition
  | PolicyNotInCondition
  | PolicyGreaterThanCondition
  | PolicyLessThanCondition
  | PolicyContainsCondition
  | PolicyExistsCondition
  | PolicyBeforeCondition
  | PolicyAfterCondition
  | PolicyExpiresInCondition
  | PolicyActiveWindowCondition
  | PolicyAndCondition
  | PolicyOrCondition
  | PolicyNotCondition;

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

const asArray = (value: PolicyOperand): unknown[] => Array.isArray(value) ? value : [];

const resolvePath = (obj: Record<string, unknown>, path: string): unknown => {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (current == null || typeof current !== "object") {
      return undefined;
    }
    return (current as Record<string, unknown>)[segment];
  }, obj);
};

const asNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const asDateMs = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

class PolicyConditionEngine {
  evaluate(policies: RuntimePolicy[], fragments: PolicyFragment[], context: PolicyRuntimeContext): PolicyEvaluationResult {
    if (!policies.length) {
      return {
        decision: "allow", obligations: [], traces: [], matchedConditions: [], failedConditions: [],
        inheritedPolicySources: [], triggeredObligations: []
      };
    }

    const fragmentMap = new Map(fragments.map((fragment) => [fragment.id, fragment]));
    const traces: PolicyTraceEntry[] = [];
    const matchedConditions: string[] = [];
    const failedConditions: string[] = [];
    const inheritedPolicySources = new Set<string>();
    const obligations: PolicyObligation[] = [];
    const triggeredObligations: string[] = [];

    for (const policy of policies) {
      const expandedCondition = this.expandPolicyCondition(policy.condition, policy.extends ?? [], fragmentMap, inheritedPolicySources);
      const passed = this.evalCondition(expandedCondition, context, traces, policy.source ?? policy.id);
      if (passed) {
        matchedConditions.push(policy.id);
        for (const obligation of policy.obligations ?? []) {
          obligations.push(obligation);
          triggeredObligations.push(obligation.code);
        }
        if (policy.effect === "deny") {
          return {
            decision: "deny", obligations, traces, matchedConditions, failedConditions,
            inheritedPolicySources: Array.from(inheritedPolicySources),
            triggeredObligations
          };
        }
      } else {
        failedConditions.push(policy.id);
      }
    }

    const anyAllowMatched = policies.some((policy) => policy.effect === "allow" && matchedConditions.includes(policy.id));
    const hasAllowPolicies = policies.some((policy) => policy.effect === "allow");
    const decision: "allow" | "deny" = hasAllowPolicies && !anyAllowMatched ? "deny" : "allow";

    return {
      decision,
      obligations,
      traces,
      matchedConditions,
      failedConditions,
      inheritedPolicySources: Array.from(inheritedPolicySources),
      triggeredObligations
    };
  }

  private expandPolicyCondition(base: PolicyCondition, extensionIds: string[], fragmentMap: Map<string, PolicyFragment>, inheritedPolicySources: Set<string>): PolicyCondition {
    if (!extensionIds.length) return base;
    const composed: PolicyCondition[] = [base];
    for (const extensionId of extensionIds) {
      const fragment = fragmentMap.get(extensionId);
      if (!fragment) continue;
      if (fragment.source) inheritedPolicySources.add(fragment.source);
      composed.push(fragment.condition);
    }
    return { op: "and", conditions: composed };
  }

  private resolve(operand: PolicyOperand, context: PolicyRuntimeContext): unknown {
    if (typeof operand === "object" && operand !== null && "path" in operand) {
      return resolvePath(context as unknown as Record<string, unknown>, operand.path);
    }
    return operand;
  }

  private evalCondition(condition: PolicyCondition, context: PolicyRuntimeContext, traces: PolicyTraceEntry[], source: string): boolean {
    const conditionId = condition.id ?? `${source}:${condition.op}:${traces.length}`;
    const record = (passed: boolean, detail: string): boolean => {
      traces.push({ conditionId, op: condition.op, passed, source: condition.source ?? source, detail });
      return passed;
    };

    switch (condition.op) {
      case "equals": return record(this.resolve(condition.left, context) === this.resolve(condition.right, context), "equals check");
      case "not_equals": return record(this.resolve(condition.left, context) !== this.resolve(condition.right, context), "not_equals check");
      case "in": return record(asArray(this.resolve(condition.right, context) as PolicyOperand).includes(this.resolve(condition.left, context)), "in check");
      case "not_in": return record(!asArray(this.resolve(condition.right, context) as PolicyOperand).includes(this.resolve(condition.left, context)), "not_in check");
      case "contains": return record(asArray(this.resolve(condition.left, context) as PolicyOperand).includes(this.resolve(condition.right, context)), "contains check");
      case "exists": return record(this.resolve(condition.field, context) !== undefined, "exists check");
      case "greater_than": {
        const l = asNumber(this.resolve(condition.left, context));
        const r = asNumber(this.resolve(condition.right, context));
        return record(l !== undefined && r !== undefined && l > r, "greater_than check");
      }
      case "less_than": {
        const l = asNumber(this.resolve(condition.left, context));
        const r = asNumber(this.resolve(condition.right, context));
        return record(l !== undefined && r !== undefined && l < r, "less_than check");
      }
      case "before": {
        const now = asDateMs(context.temporal?.now ?? context.at ?? new Date().toISOString());
        const at = asDateMs(this.resolve(condition.at, context));
        return record(now !== undefined && at !== undefined && now < at, "before check");
      }
      case "after": {
        const now = asDateMs(context.temporal?.now ?? context.at ?? new Date().toISOString());
        const at = asDateMs(this.resolve(condition.at, context));
        return record(now !== undefined && at !== undefined && now > at, "after check");
      }
      case "expires_in": {
        const now = asDateMs(context.temporal?.now ?? context.at ?? new Date().toISOString());
        const start = asDateMs(this.resolve(condition.start, context));
        const expiresAt = start !== undefined ? start + condition.durationSeconds * 1000 : undefined;
        return record(now !== undefined && expiresAt !== undefined && now <= expiresAt, "expires_in check");
      }
      case "active_window": {
        const now = asDateMs(context.temporal?.now ?? context.at ?? new Date().toISOString());
        const start = asDateMs(this.resolve(condition.start, context));
        const end = asDateMs(this.resolve(condition.end, context));
        return record(now !== undefined && start !== undefined && end !== undefined && now >= start && now <= end, "active_window check");
      }
      case "and": return record(condition.conditions.every((nested) => this.evalCondition(nested, context, traces, source)), "and composition");
      case "or": return record(condition.conditions.some((nested) => this.evalCondition(nested, context, traces, source)), "or composition");
      case "not": return record(!this.evalCondition(condition.condition, context, traces, source), "not composition");
    }
  }
}

export class AuthorizationRuntime {
  private readonly policyEngine = new PolicyConditionEngine();

  constructor(
    private readonly governance: GovernanceRuntime,
    private readonly capability: CapabilityRuntime,
    private readonly consent: ConsentRuntime,
    private readonly audit: AuditRuntime,
    private readonly federatedAuthorityVerifier?: FederatedAuthorityVerifier
  ) {}

  async evaluate(input: AuthorizationInput): Promise<AuthorizationDecision> {
    // A supplied federated authority is verified before anything reads it, and is
    // either accepted or the request is denied. Acceptance consumes its nonce,
    // which a later denial below does not restore.
    let verifiedAuthority: VerifiedFederatedAuthority | undefined;
    if (input.federatedAuthority !== undefined) {
      if (!this.federatedAuthorityVerifier) {
        return this.audit.finalizeDecision({
          decision: "deny", allowed: false, failedStage: "governance", obligations: [],
          reasoningChain: ["Federated authority supplied but no federated authority verifier is configured."],
          provenance: {},
          explainability: {}
        });
      }
      const federated = input.federatedAuthority;
      const trust = await this.federatedAuthorityVerifier.verify(
        {
          actor: { actorId: input.actor.actorId, actorType: input.actor.actorType, organizationId: input.actor.organizationId },
          ...(input.machineActor === undefined ? {} : { machineActorId: input.machineActor.actorId }),
          action: input.action,
          resource: input.resource,
          scopeId: input.scope.scopeId,
          namespace: input.namespace,
          trustScope: federated.scope
        },
        { claims: federated.claims, signature: federated.signature },
        input.at === undefined ? {} : { requestedAt: input.at }
      );
      if (!trust.trusted || !trust.authority) {
        return this.audit.finalizeDecision({
          decision: "deny", allowed: false, failedStage: "governance", obligations: [],
          reasoningChain: ["Federated trust registry denied authority provenance."],
          provenance: { rejectedAuthorityPath: trust.rejectedAuthorityPath, revokedIntermediaries: trust.revokedIntermediaries },
          explainability: { trust }
        });
      }
      verifiedAuthority = trust.authority;
    }

    // Policies see only the authenticated view of a federated authority, never the
    // caller's unsigned envelope fields (provenance, signedAt and the like).
    const policyContext = input.federatedAuthority === undefined ? input : { ...input, federatedAuthority: verifiedAuthority };
    const policy = this.policyEngine.evaluate(input.policies ?? [], input.policyFragments ?? [], policyContext);
    if (policy.decision === "deny") {
      return this.audit.finalizeDecision({
        decision: "deny", allowed: false, failedStage: "policy", obligations: policy.obligations,
        reasoningChain: ["Policy condition engine denied request."],
        provenance: { policySource: policy.matchedConditions, inheritedPolicySources: policy.inheritedPolicySources },
        explainability: { policy }
      });
    }

    const governance = await this.governance.evaluate(input, `action:${input.action}`);
    if (!governance.allowed) {
      return this.audit.finalizeDecision({
        decision: "deny", allowed: false, failedStage: "governance", obligations: policy.obligations, reasoningChain: governance.reasons,
        provenance: { policySource: governance.policySourceIds, inheritedScopeChain: governance.inheritedScopeChain, inheritedPolicySources: policy.inheritedPolicySources },
        explainability: { policy, governance }
      });
    }

    const capability = await this.capability.evaluate(input);
    if (!capability.allowed || !capability.matchedCapability) {
      return this.audit.finalizeDecision({
        decision: "deny", allowed: false, failedStage: "capability", obligations: policy.obligations, reasoningChain: capability.reasons,
        provenance: { capabilitySource: capability.matchedCapability?.capabilityId, inheritedCapabilitySource: capability.inheritedFromNamespace },
        explainability: { policy, governance, capability }
      });
    }

    const consent = await this.consent.evaluate({
      actorId: input.actor.actorId,
      capability: capability.matchedCapability,
      at: input.at,
      machineActorId: input.machineActor?.actorId
    });

    if (!consent.allowed) {
      return this.audit.finalizeDecision({
        decision: "deny", allowed: false, failedStage: "consent", obligations: policy.obligations, reasoningChain: consent.reasons,
        provenance: { consentSource: consent.grant?.grantId },
        explainability: { policy, governance, capability, consent }
      });
    }

    return this.audit.finalizeDecision({
      decision: "allow", allowed: true, obligations: policy.obligations,
      reasoningChain: [...governance.reasons, ...capability.reasons, ...consent.reasons],
      provenance: {
        policySource: governance.policySourceIds,
        capabilitySource: capability.matchedCapability.capabilityId,
        consentSource: consent.grant?.grantId,
        inheritedScopeChain: governance.inheritedScopeChain,
        inheritedCapabilitySource: capability.inheritedFromNamespace,
        inheritedPolicySources: policy.inheritedPolicySources,
        triggeredObligations: policy.triggeredObligations
      },
      explainability: { policy, governance, capability, consent }
    });
  }
}
