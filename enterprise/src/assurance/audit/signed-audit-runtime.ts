import type { AuditEvent, GovernanceSignature, SignedAuditEvent } from '@aoc-runtime/shared-types';
import { signPayload, stableHash, verifyPayloadSignature } from '@aoc-runtime/crypto';
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

export class AuditRuntime {
  finalizeDecision<T extends RuntimeDecisionEnvelope>(decision: T): T {
    return {
      ...decision,
      provenance: {
        runtimeAttribution: 'aoc-runtime',
        policySourceAttribution: (decision.provenance as { policySource?: unknown }).policySource,
        machineAttribution: (decision.explainability as { governance?: { effectiveActor?: ActorRef } }).governance?.effectiveActor?.actorType === 'machine',
        ...decision.provenance,
      },
    };
  }

  createSignedEvent(event: AuditEvent, chainId: string, signature: GovernanceSignature, previous?: SignedAuditEvent<AuditEvent>): SignedAuditEvent<AuditEvent> {
    const previousEventHash = previous?.eventHash;
    const chainPosition = previous ? previous.chainPosition + 1 : 0;
    const eventHash = stableHash({ chainId, chainPosition, previousEventHash, event });
    return { event, eventHash, previousEventHash, chainPosition, chainId, signature };
  }

  /** Verifies chain linkage and every event signature against `trustedKeys` (configured independently of the chain). */
  verifyChain(events: SignedAuditEvent<AuditEvent>[], trustedKeys: TrustedKeyResolver): boolean {
    for (let i = 0; i < events.length; i += 1) {
      const current = events[i];
      const expectedPrev = i === 0 ? undefined : events[i - 1].eventHash;
      if (current.previousEventHash !== expectedPrev || current.chainPosition !== i) return false;
      const hash = stableHash({ chainId: current.chainId, chainPosition: current.chainPosition, previousEventHash: current.previousEventHash, event: current.event });
      if (hash !== current.eventHash) return false;
      if (!verifyPayloadSignature({ eventHash: current.eventHash, event: current.event }, current.signature, trustedKeys)) return false;
    }
    return true;
  }
}

export const signAuditEvent = (
  payload: { eventHash: string; event: AuditEvent },
  privateKey: string,
  signer: GovernanceSignature['signer'],
  provenance: GovernanceSignature['provenance'],
): GovernanceSignature => signPayload(payload, privateKey, signer, provenance);
