"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConsentRuntime = void 0;
exports.isGrantActive = isGrantActive;
exports.isDelegatedGrant = isDelegatedGrant;
exports.isMachineConsent = isMachineConsent;
const crypto_1 = require("@aoc-runtime/crypto");
function isGrantActive(grant, atIso) {
    if (grant.revokedAt && grant.revokedAt <= atIso)
        return false;
    if (grant.expiresAt && grant.expiresAt <= atIso)
        return false;
    return grant.issuedAt <= atIso;
}
function isDelegatedGrant(grant) {
    return Boolean(grant.delegateActorId);
}
function isMachineConsent(grant) {
    return grant.subjectActorId.startsWith("machine:") || (grant.delegateActorId?.startsWith("machine:") ?? false);
}
class ConsentRuntime {
    constructor(provider) {
        this.provider = provider;
    }
    async evaluate(query) {
        const at = query.at ?? new Date().toISOString();
        const grants = await this.provider.getActiveGrants(query.actorId, query.capability);
        if (grants.length === 0)
            return { allowed: false, reason: "no_grant", reasons: ["No consent grants found."] };
        const revoked = grants.find((grant) => grant.revokedAt && grant.revokedAt <= at);
        if (revoked)
            return { allowed: false, reason: "revoked", grant: revoked, reasons: ["Consent was revoked."] };
        const expired = grants.find((grant) => grant.expiresAt && grant.expiresAt <= at);
        if (expired)
            return { allowed: false, reason: "expired", grant: expired, reasons: ["Consent is expired."] };
        const active = grants.find((grant) => isGrantActive(grant, at));
        if (!active)
            return { allowed: false, reason: "denied", reasons: ["No active consent grant at evaluation time."] };
        if (query.machineActorId && !(active.subjectActorId === query.machineActorId || active.delegateActorId === query.machineActorId)) {
            return { allowed: false, reason: "denied", grant: active, reasons: ["Machine consent binding mismatch."] };
        }
        return { allowed: true, reason: "allowed", grant: active, reasons: ["Active consent grant validated."] };
    }
    signGrant(grant, privateKey, signer, runtimeSource) {
        const grantHash = (0, crypto_1.stableHash)(grant);
        const issuerSignature = (0, crypto_1.signPayload)({ grantHash, grant }, privateKey, signer, { runtimeSource, timestamp: new Date().toISOString() });
        return { grant, grantHash, issuerSignature };
    }
    /**
     * Verifies every signature on `signedGrant` against keys from `trustedKeys`
     * (configured independently of the grant). A signer whose key is not in
     * `trustedKeys`, or whose claimed identity differs from the configured one,
     * fails verification.
     */
    verifySignedGrant(signedGrant, trustedKeys) {
        if ((0, crypto_1.stableHash)(signedGrant.grant) !== signedGrant.grantHash)
            return false;
        if (!(0, crypto_1.verifyPayloadSignature)({ grantHash: signedGrant.grantHash, grant: signedGrant.grant }, signedGrant.issuerSignature, trustedKeys))
            return false;
        if (signedGrant.delegatedSignature && !(0, crypto_1.verifyPayloadSignature)({ grantHash: signedGrant.grantHash, grant: signedGrant.grant, delegated: true }, signedGrant.delegatedSignature, trustedKeys))
            return false;
        if (signedGrant.revocationSignature && !(0, crypto_1.verifyPayloadSignature)({ grantHash: signedGrant.grantHash, grant: signedGrant.grant, revokedAt: signedGrant.grant.revokedAt }, signedGrant.revocationSignature, trustedKeys))
            return false;
        return true;
    }
}
exports.ConsentRuntime = ConsentRuntime;
