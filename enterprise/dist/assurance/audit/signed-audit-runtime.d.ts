import type { AuditEvent, GovernanceSignature, SignedAuditEvent } from '@aoc-runtime/shared-types';
import type { TrustedKeyResolver } from '@aoc-runtime/crypto';
import type { ActorRef, NamespaceRef } from '@aoc-runtime/shared-types';
export interface DecisionExplanation {
    decisionId: string;
    outcome: 'allow' | 'deny';
    evaluatedPolicies: string[];
    evaluatedCapabilities: string[];
    reason: string;
}
export interface FederatedProvenance {
    federationId?: string;
    trustPath?: string[];
    signerAncestry?: string[];
    revokedIntermediaries?: string[];
}
export interface GovernanceProvenance {
    scopeId: string;
    policyVersion: string;
    actor: ActorRef;
    namespace: NamespaceRef;
}
export interface Attribution {
    initiatingActor: ActorRef;
    effectiveActor: ActorRef;
}
export interface AuditContract {
    event: AuditEvent;
    attribution: Attribution;
    explanation?: DecisionExplanation;
    provenance?: GovernanceProvenance & FederatedProvenance;
}
export interface RuntimeDecisionEnvelope {
    decision: 'allow' | 'deny';
    allowed: boolean;
    failedStage?: 'policy' | 'governance' | 'capability' | 'consent';
    reasoningChain: string[];
    obligations: unknown[];
    provenance: Record<string, unknown>;
    explainability: Record<string, unknown>;
}
export declare class AuditRuntime {
    finalizeDecision<T extends RuntimeDecisionEnvelope>(decision: T): T;
    createSignedEvent(event: AuditEvent, chainId: string, signature: GovernanceSignature, previous?: SignedAuditEvent<AuditEvent>): SignedAuditEvent<AuditEvent>;
    /** Verifies chain linkage and every event signature against `trustedKeys` (configured independently of the chain). */
    verifyChain(events: SignedAuditEvent<AuditEvent>[], trustedKeys: TrustedKeyResolver): boolean;
}
export declare const signAuditEvent: (payload: {
    eventHash: string;
    event: AuditEvent;
}, privateKey: string, signer: GovernanceSignature["signer"], provenance: GovernanceSignature["provenance"]) => GovernanceSignature;
//# sourceMappingURL=signed-audit-runtime.d.ts.map