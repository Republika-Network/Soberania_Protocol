import type { TrustedKeyResolver } from "@aoc-runtime/crypto";
import { AuditProvider, CapabilityProvider, ConsentProvider, PolicyProvider, ResourceOwnershipProvider } from "@aoc-runtime/provider-interfaces";
import { ActorRef, AuditEvent, GovernanceScope, NamespaceRef } from "@aoc-runtime/shared-types";
export interface SupabaseProviderBundle {
    capabilities: CapabilityProvider;
    policies: PolicyProvider;
    consent: ConsentProvider;
    /** Keys of the subjects (and delegates) whose signed consent grants are honoured. */
    consentTrustedKeys: TrustedKeyResolver;
    /** Who owns each resource, from the deployment's records; grants by anyone else are ignored. */
    resourceOwnership: ResourceOwnershipProvider;
    audit: AuditProvider;
}
export declare class PMFreakAocAdapter {
    private readonly providers;
    private readonly authorization;
    constructor(providers: SupabaseProviderBundle);
    evaluateAction(input: {
        actor: ActorRef;
        namespace: NamespaceRef;
        scope: GovernanceScope;
        action: string;
        resource: string;
        machineActor?: ActorRef;
        at?: string;
    }): Promise<boolean>;
    writeAudit(event: AuditEvent): Promise<void>;
}
//# sourceMappingURL=index.d.ts.map