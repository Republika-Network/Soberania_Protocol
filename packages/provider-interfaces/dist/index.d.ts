import { ActorRef, AuditEvent, CapabilityRef, ConsentGrant, GovernancePolicy, NamespaceRef, PortableCognitionPackage, SignedConsentGrant } from "@aoc-runtime/shared-types";
export interface MemoryProvider {
    read(namespace: NamespaceRef, key: string): Promise<unknown>;
    write(namespace: NamespaceRef, key: string, value: unknown): Promise<void>;
}
export interface VaultProvider {
    resolve(namespace: NamespaceRef): Promise<{
        vaultId: string;
        path: string;
    }>;
}
export interface PolicyProvider {
    getPolicies(scopeId: string): Promise<GovernancePolicy[]>;
    getParentScopeId?(scopeId: string): Promise<string | null>;
}
export interface ConsentProvider {
    /** Signed grants for `actorId` and `capability`; ConsentRuntime verifies each signature before use. */
    getActiveGrants(actorId: string, capability: CapabilityRef): Promise<SignedConsentGrant<ConsentGrant>[]>;
}
export interface CapabilityProvider {
    resolve(actor: ActorRef, namespace: NamespaceRef): Promise<CapabilityRef[]>;
}
/**
 * Who owns the resource a capability refers to, established independently of any
 * grant (the deployment's own records). A consent grant is honoured only when its
 * subject is that owner; a valid signature by anyone else grants nothing.
 */
export interface ResourceOwnershipProvider {
    /** The owner's actor id, or undefined when ownership is not established. */
    ownerOf(capability: CapabilityRef): Promise<string | undefined>;
}
export interface AuditProvider {
    append(event: AuditEvent): Promise<void>;
}
export interface PortableMemoryProvider {
    export(namespace: NamespaceRef): Promise<PortableCognitionPackage>;
    import(pkg: PortableCognitionPackage): Promise<void>;
}
//# sourceMappingURL=index.d.ts.map