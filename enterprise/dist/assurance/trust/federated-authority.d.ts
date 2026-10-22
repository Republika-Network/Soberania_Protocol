import type { RuntimeAuthorityIdentity, TrustedSigningKey } from "@aoc-runtime/crypto";
import { ActorType, GovernanceSignature, NamespaceRef, TrustBoundaryScope } from "@aoc-runtime/shared-types";
import type { FederatedTrustEvaluation, TrustRegistryRuntime } from "./federated-trust-registry";
export declare const FEDERATED_AUTHORITY_PAYLOAD_TYPE = "aoc.federated-authority-request/v1";
/** Shortest accepted nonce, in characters. */
export declare const FEDERATED_AUTHORITY_MIN_NONCE_LENGTH = 16;
/** The authorization request a federated authority signature is bound to. */
export interface FederatedAuthorityRequest {
    actor: {
        actorId: string;
        actorType: ActorType;
        organizationId: string;
    };
    machineActorId?: string;
    action: string;
    resource: string;
    scopeId: string;
    namespace: NamespaceRef;
    trustScope: TrustBoundaryScope;
}
/**
 * Signed alongside the request: who it is for, when it is valid, and a
 * single-use identifier. Timestamps are RFC 3339 with an explicit zone.
 */
export interface FederatedAuthorityClaims {
    audience: string;
    issuedAt: string;
    expiresAt: string;
    nonce: string;
}
export interface FederatedAuthorityAssertion {
    claims: FederatedAuthorityClaims;
    signature: GovernanceSignature;
}
/** Only what a successful verification authenticated: the signed claims and scope, the registered signer and its trust path. */
export interface VerifiedFederatedAuthority {
    verified: true;
    signer: TrustedSigningKey;
    claims: FederatedAuthorityClaims;
    trustScope: TrustBoundaryScope;
    trustedAuthorityPath: string[];
}
export interface FederatedAuthorityVerification extends FederatedTrustEvaluation {
    /** Present only when `trusted`. */
    authority?: VerifiedFederatedAuthority;
}
/**
 * Records single-use identifiers.
 *
 * Contract every implementation must meet:
 * - `consume` is an atomic insert-if-absent: it returns `true` only for the
 *   first caller to present `replayKey`, even when callers race. A separate
 *   read followed by a write is not atomic.
 * - A consumed key is retained at least until `retainUntilMs` (the assertion's
 *   expiry plus the allowed clock skew), compared numerically in epoch
 *   milliseconds, and is never deleted early.
 * - Every replica that verifies assertions for the same audience must share
 *   one store; separate stores accept the same assertion once each.
 * - Any storage error, timeout or non-boolean answer must surface as a thrown
 *   error or a value other than `true`; the verifier then rejects the
 *   assertion (fails closed).
 *
 * Retention is measured against the verifier's clock, so replay protection
 * also depends on that clock: it must never move backwards (a clock stepped
 * back after a key was dropped would accept that assertion again), and every
 * replica sharing the store must stay synchronized within the configured
 * clock skew.
 */
export interface FederatedAuthorityReplayGuard {
    consume(replayKey: string, retainUntilMs: number, nowMs: number): boolean | Promise<boolean>;
}
/**
 * A replay guard for a single process. It is atomic only within this process
 * and remembers keys only for this process's lifetime: it provides no replay
 * protection across processes or replicas, or across restarts. Use a shared,
 * atomic store meeting the `FederatedAuthorityReplayGuard` contract there.
 */
export declare class InMemoryFederatedAuthorityReplayGuard implements FederatedAuthorityReplayGuard {
    private readonly seen;
    consume(replayKey: string, retainUntilMs: number, nowMs: number): boolean;
}
/**
 * The exact value a federated authority signs: the request and the claims,
 * with optional fields omitted rather than emitted as `undefined`.
 */
export declare function buildFederatedAuthorityPayload(request: FederatedAuthorityRequest, claims: FederatedAuthorityClaims): Record<string, unknown>;
export declare function signFederatedAuthority(request: FederatedAuthorityRequest, claims: FederatedAuthorityClaims, privateKeyPem: string, signer: RuntimeAuthorityIdentity, provenance: GovernanceSignature["provenance"]): FederatedAuthorityAssertion;
export interface FederatedAuthorityVerifierOptions {
    /** Decides signer trust; its clock is the single authoritative clock for every time check here. */
    registry: TrustRegistryRuntime;
    /** This runtime's audience identifier; assertions addressed to anything else are rejected. */
    audience: string;
    replayGuard: FederatedAuthorityReplayGuard;
    /** Longest accepted `expiresAt - issuedAt`. Default 300. */
    maxLifetimeSeconds?: number;
    /**
     * Tolerated clock difference. Default 30. Replicas verifying for the same
     * audience must keep their registry clocks synchronized within this skew.
     */
    clockSkewSeconds?: number;
}
export interface FederatedAuthorityVerifyOptions {
    /**
     * The time the caller claims the request is evaluated at, if it supplies
     * one. It never sets the verification time; it is only checked, and an
     * assertion is rejected when this time is malformed or differs from the
     * registry clock by more than the allowed skew.
     */
    requestedAt?: string;
}
/**
 * Verifies a federated authority assertion for one specific authorization
 * request. The signature must cover that request and these claims, come from a
 * signer the registry trusts for the request's trust scope, be addressed to
 * this runtime's audience, be within its validity window, and not have been
 * presented before. Every time check uses the registry clock's single
 * evaluation instant; the caller never chooses it.
 *
 * A successful verification consumes the assertion's nonce. Nothing restores
 * it: when a later stage (policy, governance, capability, consent) denies the
 * request, the assertion is still spent, and presenting it again is rejected
 * as already used. A caller retries with a newly issued assertion. Anyone who
 * holds a valid assertion can therefore spend it with a request that is then
 * denied; this denies service to the legitimate holder but grants no access,
 * so assertions should be delivered only over confidential channels.
 */
export declare class FederatedAuthorityVerifier {
    private readonly registry;
    private readonly audience;
    private readonly replayGuard;
    private readonly maxLifetimeMs;
    private readonly clockSkewMs;
    constructor(options: FederatedAuthorityVerifierOptions);
    verify(request: FederatedAuthorityRequest, assertion: FederatedAuthorityAssertion, options?: FederatedAuthorityVerifyOptions): Promise<FederatedAuthorityVerification>;
    /** The trust scope must name the request's own organization and agree with every narrower field it sets. */
    private trustScopeMismatch;
}
//# sourceMappingURL=federated-authority.d.ts.map