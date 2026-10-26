import { CapabilityRef, ConsentGrant, ConsentDecisionReason, ContractEvaluationEnvelope, GovernanceSignature, SignedConsentGrant } from "@aoc-runtime/shared-types";
import { ConsentProvider, ResourceOwnershipProvider } from "@aoc-runtime/provider-interfaces";
import type { TrustedKeyResolver } from "@aoc-runtime/crypto";
export interface ConsentQuery {
    actorId: string;
    capability: CapabilityRef;
    at?: string;
    machineActorId?: string;
}
export interface ConsentDecision extends ContractEvaluationEnvelope<ConsentDecisionReason> {
    grant?: ConsentGrant;
    reasons: string[];
}
/**
 * True only when `grant` is active at `atIso`: issued no later than `atIso`, not expired and
 * not revoked. Every timestamp, including `atIso`, must be an ISO-8601 string; a `Date`,
 * a number or a malformed string makes the grant inactive (a non-string `revokedAt` or
 * `expiresAt` reads as revoked/expired, a non-string `issuedAt` or `atIso` as unusable).
 */
export declare function isGrantActive(grant: ConsentGrant, atIso: string): boolean;
export declare function isDelegatedGrant(grant: ConsentGrant): boolean;
export declare function isMachineConsent(grant: ConsentGrant): boolean;
export interface ConsentRuntimeOptions {
    /**
     * Keys configured independently of any grant. A grant counts only if it is
     * signed by the trusted key whose `issuerId` is the grant's `subjectActorId`.
     */
    trustedKeys: TrustedKeyResolver;
    /**
     * Who owns the requested resource, from the deployment's own records. A grant
     * counts only if its subject is that owner: a correctly signed grant by anyone
     * else grants nothing, and unknown ownership denies.
     */
    resourceOwnership: ResourceOwnershipProvider;
}
/**
 * Decides consent from signed grants. A grant is used only if it is signed by
 * its subject's trusted key, delegated grants also carry the delegate's
 * signature, the grant is for exactly the requested capability, and the
 * requesting actor is the grant's delegate (or its subject when there is no
 * delegate). Unsigned or mis-signed grants never allow access.
 */
export declare class ConsentRuntime {
    private readonly provider;
    private readonly trustedKeys;
    private readonly resourceOwnership;
    constructor(provider: ConsentProvider, options: ConsentRuntimeOptions);
    evaluate(query: ConsentQuery): Promise<ConsentDecision>;
    signGrant(grant: ConsentGrant, privateKey: string, signer: GovernanceSignature["signer"], runtimeSource: string): SignedConsentGrant<ConsentGrant>;
    /** Adds the delegate's signature to a grant that names a `delegateActorId`. */
    signDelegation(signedGrant: SignedConsentGrant<ConsentGrant>, privateKey: string, signer: GovernanceSignature["signer"], runtimeSource: string): SignedConsentGrant<ConsentGrant>;
    /**
     * Verifies `signedGrant` against keys from `trustedKeys` (configured
     * independently of the grant):
     * - the issuer signature must come from the trusted key whose `issuerId` is
     *   the grant's `subjectActorId`;
     * - a grant with a `delegateActorId` must carry a delegated signature from the
     *   trusted key whose `issuerId` is that delegate;
     * - a revocation signature, if present, must come from the subject's key.
     */
    verifySignedGrant(signedGrant: SignedConsentGrant<ConsentGrant>, trustedKeys: TrustedKeyResolver): boolean;
}
//# sourceMappingURL=index.d.ts.map