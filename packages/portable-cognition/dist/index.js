"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegrityVerificationRuntime = void 0;
exports.computePortableIntegrity = computePortableIntegrity;
exports.validatePortablePackage = validatePortablePackage;
const crypto_1 = require("@aoc-runtime/crypto");
function computePortableIntegrity(pkg) {
    const topologyHash = (0, crypto_1.stableHash)(pkg.topology);
    const governanceSnapshotHash = (0, crypto_1.stableHash)(pkg.governanceSnapshot);
    const auditContinuityHash = (0, crypto_1.stableHash)(pkg.auditContinuity);
    const packageHash = (0, crypto_1.stableHash)(pkg);
    const provenanceHash = (0, crypto_1.stableHash)({ packageId: pkg.packageId, sourceOrganizationId: pkg.sourceOrganizationId, exportedAt: pkg.exportedAt });
    const federationHash = pkg.federation ? (0, crypto_1.stableHash)(pkg.federation) : undefined;
    const authorityProfilesHash = pkg.authorityProfiles ? (0, crypto_1.stableHash)(pkg.authorityProfiles) : undefined;
    return { packageHash, governanceSnapshotHash, auditContinuityHash, topologyHash, provenanceHash, federationHash, authorityProfilesHash };
}
function validatePortablePackage(pkg) {
    const errors = [];
    if (!pkg.packageId)
        errors.push("missing_package_id");
    if (!pkg.sourceOrganizationId)
        errors.push("missing_source_organization_id");
    if (!pkg.topology.namespaces.length)
        errors.push("empty_topology");
    if (pkg.integrity) {
        const computed = computePortableIntegrity(pkg);
        if (computed.packageHash !== pkg.integrity.packageHash)
            errors.push("package_hash_mismatch");
        if (computed.governanceSnapshotHash !== pkg.integrity.governanceSnapshotHash)
            errors.push("governance_hash_mismatch");
        if (computed.auditContinuityHash !== pkg.integrity.auditContinuityHash)
            errors.push("audit_hash_mismatch");
        if (computed.topologyHash !== pkg.integrity.topologyHash)
            errors.push("topology_hash_mismatch");
        if ((computed.federationHash ?? "") !== (pkg.integrity.federationHash ?? ""))
            errors.push("federation_hash_mismatch");
        if ((computed.authorityProfilesHash ?? "") !== (pkg.integrity.authorityProfilesHash ?? ""))
            errors.push("authority_profiles_hash_mismatch");
    }
    return { valid: errors.length === 0, errors };
}
/** Verifies signatures only against `trustedKeys`, which must be configured independently of the verified objects. */
class IntegrityVerificationRuntime {
    constructor(trustedKeys) {
        this.trustedKeys = trustedKeys;
    }
    verifyAuthorizationDecision(decision) {
        return (0, crypto_1.verifyPayloadSignature)({ decisionHash: decision.decisionHash, evaluationHash: decision.evaluationHash, decision: decision.decision }, decision.signature, this.trustedKeys);
    }
    verifyConsentGrant(grant) {
        return (0, crypto_1.verifyPayloadSignature)({ grantHash: grant.grantHash, grant: grant.grant }, grant.issuerSignature, this.trustedKeys);
    }
    verifyAuditChain(events) {
        return events.every((event, index) => {
            const previous = index === 0 ? undefined : events[index - 1];
            const previousHash = previous?.eventHash;
            if (event.chainPosition !== index)
                return false;
            if (event.previousEventHash !== previousHash)
                return false;
            const computedHash = (0, crypto_1.stableHash)({ chainId: event.chainId, chainPosition: event.chainPosition, previousEventHash: event.previousEventHash, event: event.event });
            if (computedHash !== event.eventHash)
                return false;
            return (0, crypto_1.verifyPayloadSignature)({ eventHash: event.eventHash, event: event.event }, event.signature, this.trustedKeys);
        });
    }
    verifyExportIntegrity(pkg) {
        if (!pkg.integrity)
            return false;
        return validatePortablePackage(pkg).valid;
    }
}
exports.IntegrityVerificationRuntime = IntegrityVerificationRuntime;
