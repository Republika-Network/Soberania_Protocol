import { ActorRef, CapabilityRef, NamespaceRef, CapabilityDecisionReason, ContractEvaluationEnvelope } from "@aoc-runtime/shared-types";
import { CapabilityProvider } from "@aoc-runtime/provider-interfaces";
export interface CapabilityEvaluationInput {
    actor: ActorRef;
    namespace: NamespaceRef;
    action: string;
    resource: string;
    now?: string;
}
export interface CapabilityDecision extends ContractEvaluationEnvelope<CapabilityDecisionReason> {
    matchedCapability?: CapabilityRef;
    inheritedFromNamespace?: string;
    reasons: string[];
}
/**
 * A namespace path is canonical when it is absolute, has no empty segments (so no
 * "//" and no trailing slash except the root) and no "." or ".." segments.
 * Returns undefined for anything else.
 */
export declare function canonicalNamespacePath(path: unknown): string | undefined;
export declare class CapabilityRuntime {
    private readonly provider;
    constructor(provider: CapabilityProvider);
    private namespacePathIncludes;
    evaluate(input: CapabilityEvaluationInput): Promise<CapabilityDecision>;
}
//# sourceMappingURL=index.d.ts.map