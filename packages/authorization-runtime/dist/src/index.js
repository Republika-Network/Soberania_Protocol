"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthorizationRuntime = void 0;
const asArray = (value) => Array.isArray(value) ? value : [];
const resolvePath = (obj, path) => {
    return path.split(".").reduce((current, segment) => {
        if (current == null || typeof current !== "object") {
            return undefined;
        }
        return current[segment];
    }, obj);
};
const asNumber = (value) => {
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (typeof value === "string") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
};
const asDateMs = (value) => {
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (typeof value === "string") {
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
};
class PolicyConditionEngine {
    evaluate(policies, fragments, context) {
        if (!policies.length) {
            return {
                decision: "allow", obligations: [], traces: [], matchedConditions: [], failedConditions: [],
                inheritedPolicySources: [], triggeredObligations: []
            };
        }
        const fragmentMap = new Map(fragments.map((fragment) => [fragment.id, fragment]));
        const traces = [];
        const matchedConditions = [];
        const failedConditions = [];
        const inheritedPolicySources = new Set();
        const obligations = [];
        const triggeredObligations = [];
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
            }
            else {
                failedConditions.push(policy.id);
            }
        }
        const anyAllowMatched = policies.some((policy) => policy.effect === "allow" && matchedConditions.includes(policy.id));
        const hasAllowPolicies = policies.some((policy) => policy.effect === "allow");
        const decision = hasAllowPolicies && !anyAllowMatched ? "deny" : "allow";
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
    expandPolicyCondition(base, extensionIds, fragmentMap, inheritedPolicySources) {
        if (!extensionIds.length)
            return base;
        const composed = [base];
        for (const extensionId of extensionIds) {
            const fragment = fragmentMap.get(extensionId);
            if (!fragment)
                continue;
            if (fragment.source)
                inheritedPolicySources.add(fragment.source);
            composed.push(fragment.condition);
        }
        return { op: "and", conditions: composed };
    }
    resolve(operand, context) {
        if (typeof operand === "object" && operand !== null && "path" in operand) {
            return resolvePath(context, operand.path);
        }
        return operand;
    }
    evalCondition(condition, context, traces, source) {
        const conditionId = condition.id ?? `${source}:${condition.op}:${traces.length}`;
        const record = (passed, detail) => {
            traces.push({ conditionId, op: condition.op, passed, source: condition.source ?? source, detail });
            return passed;
        };
        switch (condition.op) {
            case "equals": return record(this.resolve(condition.left, context) === this.resolve(condition.right, context), "equals check");
            case "not_equals": return record(this.resolve(condition.left, context) !== this.resolve(condition.right, context), "not_equals check");
            case "in": return record(asArray(this.resolve(condition.right, context)).includes(this.resolve(condition.left, context)), "in check");
            case "not_in": return record(!asArray(this.resolve(condition.right, context)).includes(this.resolve(condition.left, context)), "not_in check");
            case "contains": return record(asArray(this.resolve(condition.left, context)).includes(this.resolve(condition.right, context)), "contains check");
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
class AuthorizationRuntime {
    constructor(governance, capability, consent, audit, federatedAuthorityVerifier) {
        this.governance = governance;
        this.capability = capability;
        this.consent = consent;
        this.audit = audit;
        this.federatedAuthorityVerifier = federatedAuthorityVerifier;
        this.policyEngine = new PolicyConditionEngine();
    }
    async evaluate(input) {
        // A supplied federated authority is verified before anything reads it, and is
        // either accepted or the request is denied. Acceptance consumes its nonce,
        // which a later denial below does not restore.
        let verifiedAuthority;
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
            const trust = await this.federatedAuthorityVerifier.verify({
                actor: { actorId: input.actor.actorId, actorType: input.actor.actorType, organizationId: input.actor.organizationId },
                ...(input.machineActor === undefined ? {} : { machineActorId: input.machineActor.actorId }),
                action: input.action,
                resource: input.resource,
                scopeId: input.scope.scopeId,
                namespace: input.namespace,
                trustScope: federated.scope
            }, { claims: federated.claims, signature: federated.signature }, input.at === undefined ? {} : { requestedAt: input.at });
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
exports.AuthorizationRuntime = AuthorizationRuntime;
