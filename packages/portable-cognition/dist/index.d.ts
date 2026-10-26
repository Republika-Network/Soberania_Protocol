import { AuditContinuity, CognitionTopology, GovernanceSnapshot, PortableCognitionIntegrity, PortableCognitionPackage, SignedAuditEvent, SignedAuthorizationDecision, SignedConsentGrant } from "@aoc-runtime/shared-types";
import type { TrustedKeyResolver } from "@aoc-runtime/crypto";
export interface ImportValidationResult {
    valid: boolean;
    errors: string[];
}
export interface PortableCognitionPackageWithIntegrity extends PortableCognitionPackage {
    integrity?: PortableCognitionIntegrity;
}
export declare function computePortableIntegrity(pkg: PortableCognitionPackage): PortableCognitionIntegrity;
export declare function validatePortablePackage(pkg: PortableCognitionPackageWithIntegrity): ImportValidationResult;
/** Verifies signatures only against `trustedKeys`, which must be configured independently of the verified objects. */
export declare class IntegrityVerificationRuntime {
    private readonly trustedKeys;
    constructor(trustedKeys: TrustedKeyResolver);
    verifyAuthorizationDecision<T>(decision: SignedAuthorizationDecision<T>): boolean;
    verifyConsentGrant<T>(grant: SignedConsentGrant<T>): boolean;
    verifyAuditChain<T>(events: SignedAuditEvent<T>[]): boolean;
    verifyExportIntegrity(pkg: PortableCognitionPackageWithIntegrity): boolean;
}
export type ExportPackageModel = PortableCognitionPackage;
export type TopologyModel = CognitionTopology;
export type GovernanceSnapshotModel = GovernanceSnapshot;
export type AuditContinuityModel = AuditContinuity;
//# sourceMappingURL=index.d.ts.map