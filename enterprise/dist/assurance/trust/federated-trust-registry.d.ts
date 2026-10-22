import type { TrustedKeyResolver, TrustedSigningKey } from "@aoc-runtime/crypto";
import { GovernanceSignature, RuntimeFederation, TrustBoundaryScope } from "@aoc-runtime/shared-types";
import type { TrustClock } from "./timestamps";
/**
 * A signer the registry trusts. `publicKey` is the key signatures are verified
 * with; `signerKeyId` must be derived from it and from `runtimeId` and
 * `issuerId` (see `deriveRuntimeAuthorityKeyId`). Timestamps are RFC 3339 with
 * an explicit zone.
 */
export interface TrustedSignerRecord {
    signerKeyId: string;
    publicKey: string;
    authorityId: string;
    issuerId: string;
    runtimeId: string;
    organizationId: string;
    scopes: TrustBoundaryScope[];
    delegatedFromKeyId?: string;
    registeredAt: string;
    expiresAt?: string;
    revokedAt?: string;
}
export interface TrustRegistryOptions {
    /** Runtime ids every trust path must start from. Configured by the operator, never taken from a signature. */
    trustRoots: readonly string[];
    /**
     * The registry's clock, in epoch milliseconds; defaults to the system clock.
     * Every trust decision is made at the instant this clock reports — callers
     * never supply the verification time. It must never move backwards, and
     * replicas must keep it synchronized within the verifier's clock skew; replay
     * protection depends on both (see `FederatedAuthorityReplayGuard`).
     */
    now?: TrustClock;
}
export interface FederatedTrustEvaluation {
    trusted: boolean;
    trustedAuthorityPath: string[];
    rejectedAuthorityPath: string[];
    revokedIntermediaries: string[];
    trustScopeReasoning: string[];
    federationBoundaryReasoning: string[];
    /** When trusted: the registered key that verified the signature. */
    signer?: TrustedSigningKey;
    /** When trusted: the registry clock instant (epoch ms) the decision was made at. */
    evaluatedAt?: number;
}
export declare class TrustRegistryRuntime implements TrustedKeyResolver {
    private readonly federation;
    private readonly signers;
    private readonly trustRoots;
    private readonly clock;
    /** Throws when trust roots are missing or a federation timestamp is malformed. */
    constructor(federation: RuntimeFederation, options: TrustRegistryOptions);
    /** The registry clock's current instant in epoch milliseconds; `undefined` when the clock fails. */
    now(): number | undefined;
    /** Throws when the record's key material, identity or timestamps are malformed or inconsistent. */
    registerSigner(record: TrustedSignerRecord): void;
    /** Revokes from `revokedAt`, or from the registry clock's current instant. Throws on a malformed timestamp. */
    revokeSigner(signerKeyId: string, revokedAt?: string): void;
    /** The registered key for `keyId` when that signer is registered, unrevoked and unexpired now, by the registry clock. */
    resolveTrustedKey(keyId: string): TrustedSigningKey | undefined;
    /**
     * Decides, at the registry clock's current instant, whether `signature` over
     * `payload` comes from a signer this registry trusts for `scope`. All of these
     * must hold:
     * - the signer is registered, unrevoked and unexpired, and its scopes allow `scope`;
     * - the signature verifies with the registered public key, and the envelope's
     *   signer identity equals the registered one;
     * - an active federation path leads from a configured trust root to the
     *   signer's registered runtime, and every edge on it allows `scope`;
     * - an edge entering the signer runtime in delegated-authority mode names the
     *   signer key (a direct-trust edge does not need to);
     * - the signer runtime is active, belongs to the signer's organization, lists
     *   the signer key, and its own scopes allow `scope`.
     * Anything else, including a failing clock or a malformed timestamp, is untrusted.
     *
     * The federation graph itself is trusted operator configuration, not
     * cryptographic delegation: its nodes and edges are not signed, and only the
     * final signer key is verified. Intermediate runtimes on the path are checked
     * for being active and for their edges' scopes, but no key, organization or
     * own scope of an intermediate runtime is verified. Configure the graph only
     * from a source as trusted as the trust roots.
     */
    verifySignatureTrust(payload: unknown, signature: GovernanceSignature, scope: TrustBoundaryScope): FederatedTrustEvaluation;
    private resolveTrustedKeyAt;
    private signerStatusReasons;
    private resolveTrustChain;
    private nodeActive;
    private edgeActive;
    private scopeAllowed;
}
//# sourceMappingURL=federated-trust-registry.d.ts.map