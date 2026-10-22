import { signPayload, snapshotGovernanceSignature } from "@aoc-runtime/crypto";
import type { RuntimeAuthorityIdentity, TrustedSigningKey } from "@aoc-runtime/crypto";
import { ActorType, GovernanceSignature, NamespaceRef, TrustBoundaryScope } from "@aoc-runtime/shared-types";

import type { FederatedTrustEvaluation, TrustRegistryRuntime } from "./federated-trust-registry";
import { parseTrustTimestamp } from "./timestamps";

export const FEDERATED_AUTHORITY_PAYLOAD_TYPE = "aoc.federated-authority-request/v1";

/** Shortest accepted nonce, in characters. */
export const FEDERATED_AUTHORITY_MIN_NONCE_LENGTH = 16;

/** The authorization request a federated authority signature is bound to. */
export interface FederatedAuthorityRequest {
  actor: { actorId: string; actorType: ActorType; organizationId: string };
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
export class InMemoryFederatedAuthorityReplayGuard implements FederatedAuthorityReplayGuard {
  private readonly seen = new Map<string, number>();

  consume(replayKey: string, retainUntilMs: number, nowMs: number): boolean {
    if (typeof replayKey !== "string" || !Number.isFinite(retainUntilMs) || !Number.isFinite(nowMs)) return false;
    for (const [key, keyRetainUntil] of this.seen) if (keyRetainUntil < nowMs) this.seen.delete(key);
    if (this.seen.has(replayKey)) return false;
    this.seen.set(replayKey, retainUntilMs);
    return true;
  }
}

/**
 * The exact value a federated authority signs: the request and the claims,
 * with optional fields omitted rather than emitted as `undefined`.
 */
export function buildFederatedAuthorityPayload(request: FederatedAuthorityRequest, claims: FederatedAuthorityClaims): Record<string, unknown> {
  const { namespace, trustScope } = request;
  return {
    type: FEDERATED_AUTHORITY_PAYLOAD_TYPE,
    actor: { actorId: request.actor.actorId, actorType: request.actor.actorType, organizationId: request.actor.organizationId },
    ...(request.machineActorId === undefined ? {} : { machineActorId: request.machineActorId }),
    action: request.action,
    resource: request.resource,
    scopeId: request.scopeId,
    namespace: {
      organizationId: namespace.organizationId,
      ...(namespace.workspaceId === undefined ? {} : { workspaceId: namespace.workspaceId }),
      ...(namespace.projectId === undefined ? {} : { projectId: namespace.projectId }),
      path: namespace.path,
    },
    trustScope: {
      type: trustScope.type,
      ...(trustScope.organizationId === undefined ? {} : { organizationId: trustScope.organizationId }),
      ...(trustScope.workspaceId === undefined ? {} : { workspaceId: trustScope.workspaceId }),
      ...(trustScope.namespacePath === undefined ? {} : { namespacePath: trustScope.namespacePath }),
      ...(trustScope.machineId === undefined ? {} : { machineId: trustScope.machineId }),
    },
    audience: claims.audience,
    issuedAt: claims.issuedAt,
    expiresAt: claims.expiresAt,
    nonce: claims.nonce,
  };
}

export function signFederatedAuthority(
  request: FederatedAuthorityRequest,
  claims: FederatedAuthorityClaims,
  privateKeyPem: string,
  signer: RuntimeAuthorityIdentity,
  provenance: GovernanceSignature["provenance"],
): FederatedAuthorityAssertion {
  return { claims: { ...claims }, signature: signPayload(buildFederatedAuthorityPayload(request, claims), privateKeyPem, signer, provenance) };
}

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

const isNonBlankString = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";

const rejected = (reason: string): FederatedAuthorityVerification => ({
  trusted: false,
  trustedAuthorityPath: [],
  rejectedAuthorityPath: [],
  revokedIntermediaries: [],
  trustScopeReasoning: [reason],
  federationBoundaryReasoning: [],
});

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
export class FederatedAuthorityVerifier {
  private readonly registry: TrustRegistryRuntime;
  private readonly audience: string;
  private readonly replayGuard: FederatedAuthorityReplayGuard;
  private readonly maxLifetimeMs: number;
  private readonly clockSkewMs: number;

  constructor(options: FederatedAuthorityVerifierOptions) {
    if (!options?.registry || typeof options.registry.verifySignatureTrust !== "function") throw new Error("FederatedAuthorityVerifier requires a trust registry.");
    if (!isNonBlankString(options.audience)) throw new Error("FederatedAuthorityVerifier requires an audience.");
    if (!options.replayGuard || typeof options.replayGuard.consume !== "function") throw new Error("FederatedAuthorityVerifier requires a replay guard.");
    const maxLifetimeSeconds = options.maxLifetimeSeconds ?? 300;
    const clockSkewSeconds = options.clockSkewSeconds ?? 30;
    if (!Number.isFinite(maxLifetimeSeconds) || maxLifetimeSeconds <= 0) throw new Error("maxLifetimeSeconds must be a positive number.");
    if (!Number.isFinite(clockSkewSeconds) || clockSkewSeconds < 0) throw new Error("clockSkewSeconds must be a non-negative number.");
    this.registry = options.registry;
    this.audience = options.audience;
    this.replayGuard = options.replayGuard;
    this.maxLifetimeMs = maxLifetimeSeconds * 1000;
    this.clockSkewMs = clockSkewSeconds * 1000;
  }

  async verify(request: FederatedAuthorityRequest, assertion: FederatedAuthorityAssertion, options: FederatedAuthorityVerifyOptions = {}): Promise<FederatedAuthorityVerification> {
    try {
      const claims = assertion?.claims;
      if (!claims || !isNonBlankString(claims.audience) || !isNonBlankString(claims.issuedAt) || !isNonBlankString(claims.expiresAt) || !isNonBlankString(claims.nonce)) {
        return rejected("Federated authority claims are incomplete.");
      }
      // Fix the claims once; every later check and the signed payload use this copy.
      const fixed: FederatedAuthorityClaims = { audience: claims.audience, issuedAt: claims.issuedAt, expiresAt: claims.expiresAt, nonce: claims.nonce };
      if (fixed.audience !== this.audience) return rejected("Federated authority is addressed to a different audience.");
      if (fixed.nonce.length < FEDERATED_AUTHORITY_MIN_NONCE_LENGTH) return rejected("Federated authority nonce is too short.");

      const issuedAt = parseTrustTimestamp(fixed.issuedAt);
      const expiresAt = parseTrustTimestamp(fixed.expiresAt);
      if (issuedAt === undefined || expiresAt === undefined) return rejected("Federated authority timestamps are invalid.");
      if (expiresAt <= issuedAt) return rejected("Federated authority expires before it is issued.");
      if (expiresAt - issuedAt > this.maxLifetimeMs) return rejected("Federated authority lifetime exceeds the allowed maximum.");

      const scopeMismatch = this.trustScopeMismatch(request);
      if (scopeMismatch) return rejected(scopeMismatch);

      // Read the envelope once, so the key that is verified is the key the nonce is recorded under.
      const signature = snapshotGovernanceSignature(assertion.signature);
      if (!signature) return rejected("Federated authority signature is malformed.");
      const trust = this.registry.verifySignatureTrust(buildFederatedAuthorityPayload(request, fixed), signature, request.trustScope);
      if (!trust.trusted) return trust;
      const now = trust.evaluatedAt;
      if (typeof now !== "number" || !Number.isFinite(now) || !trust.signer) return rejected("Federated authority could not be verified.");

      if (now + this.clockSkewMs < issuedAt) return rejected("Federated authority is not yet valid.");
      if (now - this.clockSkewMs > expiresAt) return rejected("Federated authority has expired.");
      if (options.requestedAt !== undefined) {
        const requestedAt = parseTrustTimestamp(options.requestedAt);
        if (requestedAt === undefined) return rejected("Requested evaluation time is invalid.");
        if (Math.abs(requestedAt - now) > this.clockSkewMs) return rejected("Requested evaluation time differs from the verifier clock.");
      }

      const replayKey = `${signature.keyId}:${fixed.nonce}`;
      if ((await this.replayGuard.consume(replayKey, expiresAt + this.clockSkewMs, now)) !== true) return rejected("Federated authority has already been used.");
      return {
        ...trust,
        authority: Object.freeze({
          verified: true as const,
          signer: trust.signer,
          claims: Object.freeze(fixed),
          trustScope: Object.freeze({ ...request.trustScope }),
          trustedAuthorityPath: [...trust.trustedAuthorityPath],
        }),
      };
    } catch {
      return rejected("Federated authority could not be verified.");
    }
  }

  /** The trust scope must name the request's own organization and agree with every narrower field it sets. */
  private trustScopeMismatch(request: FederatedAuthorityRequest): string | undefined {
    const { trustScope, namespace } = request;
    if (!trustScope || !isNonBlankString(trustScope.organizationId) || trustScope.organizationId !== namespace.organizationId) {
      return "Federated authority trust scope does not name the request organization.";
    }
    if (trustScope.workspaceId !== undefined && trustScope.workspaceId !== namespace.workspaceId) return "Federated authority trust scope names a different workspace.";
    if (trustScope.namespacePath !== undefined && trustScope.namespacePath !== namespace.path) return "Federated authority trust scope names a different namespace.";
    if (trustScope.machineId !== undefined && trustScope.machineId !== request.machineActorId) return "Federated authority trust scope names a different machine.";
    return undefined;
  }
}
