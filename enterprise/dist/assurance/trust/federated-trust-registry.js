"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrustRegistryRuntime = void 0;
const crypto_1 = require("@aoc-runtime/crypto");
const timestamps_1 = require("./timestamps");
const untrusted = (rejected, reasons, revoked = []) => ({
    trusted: false,
    trustedAuthorityPath: [],
    rejectedAuthorityPath: [...new Set(rejected)],
    revokedIntermediaries: [...new Set(revoked)],
    trustScopeReasoning: reasons,
    federationBoundaryReasoning: [],
});
/** An optional timestamp that is present but unparsable counts as already in effect (revoked, expired). */
const optionalInEffect = (value, atMs, inclusive) => {
    if (value === undefined)
        return false;
    const parsed = (0, timestamps_1.parseTrustTimestamp)(value);
    if (parsed === undefined)
        return true;
    return inclusive ? parsed <= atMs : parsed < atMs;
};
/** A required start timestamp that is unparsable means the item never becomes active. */
const startedBy = (value, atMs) => {
    const parsed = (0, timestamps_1.parseTrustTimestamp)(value);
    return parsed !== undefined && parsed <= atMs;
};
const validateFederation = (federation) => {
    for (const node of federation?.nodes ?? []) {
        (0, timestamps_1.requireTrustTimestamp)(node.activeFrom, `Federation node ${node.runtimeId} activeFrom`);
        if (node.activeUntil !== undefined)
            (0, timestamps_1.requireTrustTimestamp)(node.activeUntil, `Federation node ${node.runtimeId} activeUntil`);
        if (node.revokedAt !== undefined)
            (0, timestamps_1.requireTrustTimestamp)(node.revokedAt, `Federation node ${node.runtimeId} revokedAt`);
    }
    for (const edge of federation?.edges ?? []) {
        (0, timestamps_1.requireTrustTimestamp)(edge.issuedAt, `Federation edge ${edge.edgeId} issuedAt`);
        if (edge.expiresAt !== undefined)
            (0, timestamps_1.requireTrustTimestamp)(edge.expiresAt, `Federation edge ${edge.edgeId} expiresAt`);
        if (edge.revokedAt !== undefined)
            (0, timestamps_1.requireTrustTimestamp)(edge.revokedAt, `Federation edge ${edge.edgeId} revokedAt`);
    }
};
class TrustRegistryRuntime {
    /** Throws when trust roots are missing or a federation timestamp is malformed. */
    constructor(federation, options) {
        this.federation = federation;
        this.signers = new Map();
        const roots = options?.trustRoots;
        if (!Array.isArray(roots) || roots.length === 0 || roots.some((root) => typeof root !== "string" || root.trim() === "")) {
            throw new Error("TrustRegistryRuntime requires at least one configured trust root.");
        }
        if (options.now !== undefined && typeof options.now !== "function")
            throw new Error("TrustRegistryRuntime clock must be a function.");
        validateFederation(federation);
        this.trustRoots = Object.freeze([...roots]);
        this.clock = options.now ?? timestamps_1.systemTrustClock;
    }
    /** The registry clock's current instant in epoch milliseconds; `undefined` when the clock fails. */
    now() {
        try {
            const value = this.clock();
            return typeof value === "number" && Number.isFinite(value) ? value : undefined;
        }
        catch {
            return undefined;
        }
    }
    /** Throws when the record's key material, identity or timestamps are malformed or inconsistent. */
    registerSigner(record) {
        (0, crypto_1.assertTrustedSigningKey)({
            keyId: record.signerKeyId,
            publicKey: record.publicKey,
            authorityId: record.authorityId,
            issuerId: record.issuerId,
            runtimeId: record.runtimeId,
        });
        (0, timestamps_1.requireTrustTimestamp)(record.registeredAt, `Signer ${record.signerKeyId} registeredAt`);
        if (record.expiresAt !== undefined)
            (0, timestamps_1.requireTrustTimestamp)(record.expiresAt, `Signer ${record.signerKeyId} expiresAt`);
        if (record.revokedAt !== undefined)
            (0, timestamps_1.requireTrustTimestamp)(record.revokedAt, `Signer ${record.signerKeyId} revokedAt`);
        this.signers.set(record.signerKeyId, { ...record, scopes: [...record.scopes] });
    }
    /** Revokes from `revokedAt`, or from the registry clock's current instant. Throws on a malformed timestamp. */
    revokeSigner(signerKeyId, revokedAt) {
        let effective = revokedAt;
        if (effective === undefined) {
            const nowMs = this.now();
            if (nowMs === undefined)
                throw new Error("TrustRegistryRuntime clock is unavailable.");
            effective = new Date(nowMs).toISOString();
        }
        (0, timestamps_1.requireTrustTimestamp)(effective, `Signer ${signerKeyId} revokedAt`);
        const existing = this.signers.get(signerKeyId);
        if (existing)
            this.signers.set(signerKeyId, { ...existing, revokedAt: effective });
    }
    /** The registered key for `keyId` when that signer is registered, unrevoked and unexpired now, by the registry clock. */
    resolveTrustedKey(keyId) {
        const atMs = this.now();
        return atMs === undefined ? undefined : this.resolveTrustedKeyAt(keyId, atMs);
    }
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
    verifySignatureTrust(payload, signature, scope) {
        const atMs = this.now();
        if (atMs === undefined)
            return untrusted([], ["Registry clock is unavailable."]);
        // Every check below sees the same envelope: its fields are read exactly once.
        const envelope = (0, crypto_1.snapshotGovernanceSignature)(signature);
        if (!envelope)
            return untrusted([], ["Signature envelope is malformed."]);
        const signer = this.signers.get(envelope.keyId);
        if (!signer)
            return untrusted([envelope.keyId], ["Signer not registered."]);
        const statusReasons = this.signerStatusReasons(signer, atMs);
        if (statusReasons.length > 0) {
            const revoked = optionalInEffect(signer.revokedAt, atMs, true) ? [signer.signerKeyId] : [];
            return untrusted([signer.signerKeyId], statusReasons, revoked);
        }
        if (!scope || !this.scopeAllowed(signer.scopes, scope))
            return untrusted([signer.signerKeyId], ["Signer scope mismatch."]);
        if (!(0, crypto_1.verifyPayloadSignature)(payload, envelope, { resolveTrustedKey: (id) => this.resolveTrustedKeyAt(id, atMs) })) {
            return untrusted([signer.signerKeyId], ["Signature does not verify against the registered signer key."]);
        }
        const chain = this.resolveTrustChain(signer, scope, atMs);
        if (!chain.valid)
            return untrusted([signer.signerKeyId, ...chain.path], chain.reasons, chain.revokedIntermediaries);
        return {
            trusted: true,
            trustedAuthorityPath: chain.path,
            rejectedAuthorityPath: [],
            revokedIntermediaries: [],
            trustScopeReasoning: [],
            federationBoundaryReasoning: [`Federation ${this.federation.federationId} trust path accepted.`],
            signer: Object.freeze({ keyId: signer.signerKeyId, publicKey: signer.publicKey, authorityId: signer.authorityId, issuerId: signer.issuerId, runtimeId: signer.runtimeId }),
            evaluatedAt: atMs,
        };
    }
    resolveTrustedKeyAt(keyId, atMs) {
        const signer = this.signers.get(keyId);
        if (!signer || this.signerStatusReasons(signer, atMs).length > 0)
            return undefined;
        return { keyId: signer.signerKeyId, publicKey: signer.publicKey, authorityId: signer.authorityId, issuerId: signer.issuerId, runtimeId: signer.runtimeId };
    }
    signerStatusReasons(signer, atMs) {
        const reasons = [];
        if (!startedBy(signer.registeredAt, atMs))
            reasons.push("Signer not yet registered.");
        if (optionalInEffect(signer.revokedAt, atMs, true))
            reasons.push("Signer revoked.");
        if (optionalInEffect(signer.expiresAt, atMs, false))
            reasons.push("Signer expired.");
        return reasons;
    }
    resolveTrustChain(signer, scope, atMs) {
        const nodes = new Map(this.federation.nodes.map((node) => [node.runtimeId, node]));
        const target = nodes.get(signer.runtimeId);
        if (!target || !this.nodeActive(target, atMs))
            return { valid: false, path: [], revokedIntermediaries: [], reasons: ["Signer runtime is not an active federation node."] };
        if (target.organizationId !== signer.organizationId)
            return { valid: false, path: [], revokedIntermediaries: [], reasons: ["Signer organization does not match its runtime."] };
        if (!target.authorityKeyIds.includes(signer.signerKeyId))
            return { valid: false, path: [], revokedIntermediaries: [], reasons: ["Signer runtime does not list the signer key."] };
        if (!this.scopeAllowed(target.scopes, scope))
            return { valid: false, path: [], revokedIntermediaries: [], reasons: ["Signer runtime scope mismatch."] };
        const roots = this.trustRoots.filter((rootId) => { const node = nodes.get(rootId); return node !== undefined && this.nodeActive(node, atMs); });
        const queue = roots.map((runtimeId) => ({ runtimeId, path: [runtimeId] }));
        const visited = new Set();
        const revokedIntermediaries = [];
        while (queue.length) {
            const cur = queue.shift();
            if (cur.runtimeId === target.runtimeId)
                return { valid: true, path: cur.path, revokedIntermediaries: [], reasons: [] };
            if (visited.has(cur.runtimeId))
                continue;
            visited.add(cur.runtimeId);
            for (const edge of this.federation.edges.filter((e) => e.fromRuntimeId === cur.runtimeId)) {
                if (!this.edgeActive(edge, atMs)) {
                    if (edge.revokedAt !== undefined)
                        revokedIntermediaries.push(edge.edgeId);
                    continue;
                }
                const next = nodes.get(edge.toRuntimeId);
                if (!next || !this.nodeActive(next, atMs))
                    continue;
                if (!this.scopeAllowed(edge.scopes, scope))
                    continue;
                if (edge.toRuntimeId === target.runtimeId && edge.mode === "delegated-authority" && !(edge.delegatedKeyIds ?? []).includes(signer.signerKeyId))
                    continue;
                queue.push({ runtimeId: edge.toRuntimeId, path: [...cur.path, edge.toRuntimeId] });
            }
        }
        return { valid: false, path: [], revokedIntermediaries, reasons: ["No active federated trust path from a configured trust root to the signer runtime."] };
    }
    nodeActive(node, atMs) {
        if (optionalInEffect(node.revokedAt, atMs, true))
            return false;
        if (optionalInEffect(node.activeUntil, atMs, false))
            return false;
        return startedBy(node.activeFrom, atMs);
    }
    edgeActive(edge, atMs) {
        if (optionalInEffect(edge.revokedAt, atMs, true))
            return false;
        if (optionalInEffect(edge.expiresAt, atMs, false))
            return false;
        return startedBy(edge.issuedAt, atMs);
    }
    scopeAllowed(allowed, requested) {
        return allowed.some((scope) => scope.type === requested.type
            && (scope.organizationId === undefined || scope.organizationId === requested.organizationId)
            && (scope.workspaceId === undefined || scope.workspaceId === requested.workspaceId)
            && (scope.namespacePath === undefined || scope.namespacePath === requested.namespacePath)
            && (scope.machineId === undefined || scope.machineId === requested.machineId));
    }
}
exports.TrustRegistryRuntime = TrustRegistryRuntime;
