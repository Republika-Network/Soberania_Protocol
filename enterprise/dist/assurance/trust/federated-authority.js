"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FederatedAuthorityVerifier = exports.InMemoryFederatedAuthorityReplayGuard = exports.FEDERATED_AUTHORITY_MIN_NONCE_LENGTH = exports.FEDERATED_AUTHORITY_PAYLOAD_TYPE = void 0;
exports.buildFederatedAuthorityPayload = buildFederatedAuthorityPayload;
exports.signFederatedAuthority = signFederatedAuthority;
const crypto_1 = require("@aoc-runtime/crypto");
const timestamps_1 = require("./timestamps");
exports.FEDERATED_AUTHORITY_PAYLOAD_TYPE = "aoc.federated-authority-request/v1";
/** Shortest accepted nonce, in characters. */
exports.FEDERATED_AUTHORITY_MIN_NONCE_LENGTH = 16;
/**
 * A replay guard for a single process. It is atomic only within this process
 * and remembers keys only for this process's lifetime: it provides no replay
 * protection across processes or replicas, or across restarts. Use a shared,
 * atomic store meeting the `FederatedAuthorityReplayGuard` contract there.
 */
class InMemoryFederatedAuthorityReplayGuard {
    constructor() {
        this.seen = new Map();
    }
    consume(replayKey, retainUntilMs, nowMs) {
        if (typeof replayKey !== "string" || !Number.isFinite(retainUntilMs) || !Number.isFinite(nowMs))
            return false;
        for (const [key, keyRetainUntil] of this.seen)
            if (keyRetainUntil < nowMs)
                this.seen.delete(key);
        if (this.seen.has(replayKey))
            return false;
        this.seen.set(replayKey, retainUntilMs);
        return true;
    }
}
exports.InMemoryFederatedAuthorityReplayGuard = InMemoryFederatedAuthorityReplayGuard;
/**
 * The exact value a federated authority signs: the request and the claims,
 * with optional fields omitted rather than emitted as `undefined`.
 */
function buildFederatedAuthorityPayload(request, claims) {
    const { namespace, trustScope } = request;
    return {
        type: exports.FEDERATED_AUTHORITY_PAYLOAD_TYPE,
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
function signFederatedAuthority(request, claims, privateKeyPem, signer, provenance) {
    return { claims: { ...claims }, signature: (0, crypto_1.signPayload)(buildFederatedAuthorityPayload(request, claims), privateKeyPem, signer, provenance) };
}
const isNonBlankString = (value) => typeof value === "string" && value.trim() !== "";
const rejected = (reason) => ({
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
class FederatedAuthorityVerifier {
    constructor(options) {
        if (!options?.registry || typeof options.registry.verifySignatureTrust !== "function")
            throw new Error("FederatedAuthorityVerifier requires a trust registry.");
        if (!isNonBlankString(options.audience))
            throw new Error("FederatedAuthorityVerifier requires an audience.");
        if (!options.replayGuard || typeof options.replayGuard.consume !== "function")
            throw new Error("FederatedAuthorityVerifier requires a replay guard.");
        const maxLifetimeSeconds = options.maxLifetimeSeconds ?? 300;
        const clockSkewSeconds = options.clockSkewSeconds ?? 30;
        if (!Number.isFinite(maxLifetimeSeconds) || maxLifetimeSeconds <= 0)
            throw new Error("maxLifetimeSeconds must be a positive number.");
        if (!Number.isFinite(clockSkewSeconds) || clockSkewSeconds < 0)
            throw new Error("clockSkewSeconds must be a non-negative number.");
        this.registry = options.registry;
        this.audience = options.audience;
        this.replayGuard = options.replayGuard;
        this.maxLifetimeMs = maxLifetimeSeconds * 1000;
        this.clockSkewMs = clockSkewSeconds * 1000;
    }
    async verify(request, assertion, options = {}) {
        try {
            const claims = assertion?.claims;
            if (!claims || !isNonBlankString(claims.audience) || !isNonBlankString(claims.issuedAt) || !isNonBlankString(claims.expiresAt) || !isNonBlankString(claims.nonce)) {
                return rejected("Federated authority claims are incomplete.");
            }
            // Fix the claims once; every later check and the signed payload use this copy.
            const fixed = { audience: claims.audience, issuedAt: claims.issuedAt, expiresAt: claims.expiresAt, nonce: claims.nonce };
            if (fixed.audience !== this.audience)
                return rejected("Federated authority is addressed to a different audience.");
            if (fixed.nonce.length < exports.FEDERATED_AUTHORITY_MIN_NONCE_LENGTH)
                return rejected("Federated authority nonce is too short.");
            const issuedAt = (0, timestamps_1.parseTrustTimestamp)(fixed.issuedAt);
            const expiresAt = (0, timestamps_1.parseTrustTimestamp)(fixed.expiresAt);
            if (issuedAt === undefined || expiresAt === undefined)
                return rejected("Federated authority timestamps are invalid.");
            if (expiresAt <= issuedAt)
                return rejected("Federated authority expires before it is issued.");
            if (expiresAt - issuedAt > this.maxLifetimeMs)
                return rejected("Federated authority lifetime exceeds the allowed maximum.");
            const scopeMismatch = this.trustScopeMismatch(request);
            if (scopeMismatch)
                return rejected(scopeMismatch);
            // Read the envelope once, so the key that is verified is the key the nonce is recorded under.
            const signature = (0, crypto_1.snapshotGovernanceSignature)(assertion.signature);
            if (!signature)
                return rejected("Federated authority signature is malformed.");
            const trust = this.registry.verifySignatureTrust(buildFederatedAuthorityPayload(request, fixed), signature, request.trustScope);
            if (!trust.trusted)
                return trust;
            const now = trust.evaluatedAt;
            if (typeof now !== "number" || !Number.isFinite(now) || !trust.signer)
                return rejected("Federated authority could not be verified.");
            if (now + this.clockSkewMs < issuedAt)
                return rejected("Federated authority is not yet valid.");
            if (now - this.clockSkewMs > expiresAt)
                return rejected("Federated authority has expired.");
            if (options.requestedAt !== undefined) {
                const requestedAt = (0, timestamps_1.parseTrustTimestamp)(options.requestedAt);
                if (requestedAt === undefined)
                    return rejected("Requested evaluation time is invalid.");
                if (Math.abs(requestedAt - now) > this.clockSkewMs)
                    return rejected("Requested evaluation time differs from the verifier clock.");
            }
            const replayKey = `${signature.keyId}:${fixed.nonce}`;
            if ((await this.replayGuard.consume(replayKey, expiresAt + this.clockSkewMs, now)) !== true)
                return rejected("Federated authority has already been used.");
            return {
                ...trust,
                authority: Object.freeze({
                    verified: true,
                    signer: trust.signer,
                    claims: Object.freeze(fixed),
                    trustScope: Object.freeze({ ...request.trustScope }),
                    trustedAuthorityPath: [...trust.trustedAuthorityPath],
                }),
            };
        }
        catch {
            return rejected("Federated authority could not be verified.");
        }
    }
    /** The trust scope must name the request's own organization and agree with every narrower field it sets. */
    trustScopeMismatch(request) {
        const { trustScope, namespace } = request;
        if (!trustScope || !isNonBlankString(trustScope.organizationId) || trustScope.organizationId !== namespace.organizationId) {
            return "Federated authority trust scope does not name the request organization.";
        }
        if (trustScope.workspaceId !== undefined && trustScope.workspaceId !== namespace.workspaceId)
            return "Federated authority trust scope names a different workspace.";
        if (trustScope.namespacePath !== undefined && trustScope.namespacePath !== namespace.path)
            return "Federated authority trust scope names a different namespace.";
        if (trustScope.machineId !== undefined && trustScope.machineId !== request.machineActorId)
            return "Federated authority trust scope names a different machine.";
        return undefined;
    }
}
exports.FederatedAuthorityVerifier = FederatedAuthorityVerifier;
