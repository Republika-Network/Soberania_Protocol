"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConsentRuntime = void 0;
exports.isGrantActive = isGrantActive;
exports.isDelegatedGrant = isDelegatedGrant;
exports.isMachineConsent = isMachineConsent;
const crypto_1 = require("@aoc-runtime/crypto");
const ISO_8601_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
/**
 * Reads a timestamp that must be an ISO-8601 date-time string and returns its instant in
 * epoch milliseconds. Anything else — a `Date` object, an epoch number, another string
 * format, an empty string, an unparseable date — is unusable and yields `undefined`.
 * Callers treat an unusable value in the fail-closed direction for its field.
 */
function parseIsoTimestamp(value) {
    if (typeof value !== "string" || !ISO_8601_DATE_TIME.test(value))
        return undefined;
    const instant = Date.parse(value);
    return Number.isFinite(instant) ? instant : undefined;
}
const isPresent = (value) => value !== undefined && value !== null;
/** A revocation marker that is present but unreadable counts as a revocation: it can only remove access. */
function isRevokedAt(grant, at) {
    if (!isPresent(grant.revokedAt))
        return false;
    const revokedAt = parseIsoTimestamp(grant.revokedAt);
    return revokedAt === undefined || revokedAt <= at;
}
/** An expiry that is present but unreadable counts as expired. */
function isExpiredAt(grant, at) {
    if (!isPresent(grant.expiresAt))
        return false;
    const expiresAt = parseIsoTimestamp(grant.expiresAt);
    return expiresAt === undefined || expiresAt <= at;
}
function isGrantActiveAt(grant, at) {
    if (isRevokedAt(grant, at) || isExpiredAt(grant, at))
        return false;
    const issuedAt = parseIsoTimestamp(grant.issuedAt);
    return issuedAt !== undefined && issuedAt <= at;
}
/**
 * True only when `grant` is active at `atIso`: issued no later than `atIso`, not expired and
 * not revoked. Every timestamp, including `atIso`, must be an ISO-8601 string; a `Date`,
 * a number or a malformed string makes the grant inactive (a non-string `revokedAt` or
 * `expiresAt` reads as revoked/expired, a non-string `issuedAt` or `atIso` as unusable).
 */
function isGrantActive(grant, atIso) {
    const at = parseIsoTimestamp(atIso);
    return at !== undefined && isGrantActiveAt(grant, at);
}
function isDelegatedGrant(grant) {
    return Boolean(grant.delegateActorId);
}
function isMachineConsent(grant) {
    return grant.subjectActorId.startsWith("machine:") || (grant.delegateActorId?.startsWith("machine:") ?? false);
}
function sameCapability(a, b) {
    return (a.capabilityId === b.capabilityId &&
        a.action === b.action &&
        a.resource === b.resource &&
        a.scope?.organizationId === b.scope?.organizationId &&
        a.scope?.path === b.scope?.path);
}
/**
 * Verifies `signature` over `payload` against `trustedKeys` and returns true only
 * if the configured key that signed it belongs to `expectedIssuerId`. The
 * envelope is read once, so the identity checked is the identity verified.
 */
function signedBy(payload, signature, trustedKeys, expectedIssuerId) {
    const envelope = (0, crypto_1.snapshotGovernanceSignature)(signature);
    if (!envelope)
        return false;
    if (envelope.signer.issuerId !== expectedIssuerId)
        return false;
    return (0, crypto_1.verifyPayloadSignature)(payload, envelope, trustedKeys);
}
/**
 * Decides consent from signed grants. A grant is used only if it is signed by
 * its subject's trusted key, delegated grants also carry the delegate's
 * signature, the grant is for exactly the requested capability, and the
 * requesting actor is the grant's delegate (or its subject when there is no
 * delegate). Unsigned or mis-signed grants never allow access.
 */
class ConsentRuntime {
    constructor(provider, options) {
        this.provider = provider;
        if (typeof options?.trustedKeys?.resolveTrustedKey !== "function") {
            throw new Error("ConsentRuntime requires trusted keys to verify consent grants.");
        }
        if (typeof options?.resourceOwnership?.ownerOf !== "function") {
            throw new Error("ConsentRuntime requires a resource ownership provider to bind grants to owners.");
        }
        this.trustedKeys = options.trustedKeys;
        this.resourceOwnership = options.resourceOwnership;
    }
    async evaluate(query) {
        // The evaluation time must be an ISO-8601 string; anything else denies rather than
        // silently reading as "now" or as "never".
        const at = parseIsoTimestamp(query.at ?? new Date().toISOString());
        if (at === undefined)
            return { allowed: false, reason: "denied", reasons: ["Evaluation time is not an ISO-8601 timestamp."] };
        const signedGrants = await this.provider.getActiveGrants(query.actorId, query.capability);
        const relevant = (signedGrants ?? []).filter((entry) => entry?.grant && sameCapability(entry.grant.capability, query.capability));
        if (relevant.length === 0)
            return { allowed: false, reason: "no_grant", reasons: ["No consent grants found."] };
        // A revocation or expiry on any matching grant denies, signed or not: these
        // markers can only remove access. A marker that is present but not an ISO-8601
        // string (a Date object, an epoch number) is unreadable and therefore denies too.
        const revoked = relevant.find((entry) => isRevokedAt(entry.grant, at));
        if (revoked)
            return { allowed: false, reason: "revoked", grant: revoked.grant, reasons: ["Consent was revoked."] };
        const expired = relevant.find((entry) => isExpiredAt(entry.grant, at));
        if (expired)
            return { allowed: false, reason: "expired", grant: expired.grant, reasons: ["Consent is expired."] };
        // Subject, signer, owner and delegate are four different questions. The owner comes from
        // the deployment's records, never from the grant; the signer is bound to the subject in
        // verifySignedGrant; the delegate is bound by its countersignature.
        let owner;
        try {
            owner = await this.resourceOwnership.ownerOf(query.capability);
        }
        catch {
            owner = undefined;
        }
        if (typeof owner !== "string" || owner === "") {
            return { allowed: false, reason: "denied", reasons: ["Ownership of the requested resource is not established."] };
        }
        const usable = relevant.filter((entry) => entry.grant.subjectActorId === owner &&
            (entry.grant.delegateActorId ?? entry.grant.subjectActorId) === query.actorId &&
            this.verifySignedGrant(entry, this.trustedKeys));
        if (usable.length === 0) {
            return { allowed: false, reason: "denied", reasons: ["No consent grant signed by the resource owner authorizes this actor."] };
        }
        const active = usable.find((entry) => isGrantActiveAt(entry.grant, at))?.grant;
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
    /** Adds the delegate's signature to a grant that names a `delegateActorId`. */
    signDelegation(signedGrant, privateKey, signer, runtimeSource) {
        const { grant, grantHash } = signedGrant;
        const delegatedSignature = (0, crypto_1.signPayload)({ grantHash, grant, delegated: true }, privateKey, signer, { runtimeSource, timestamp: new Date().toISOString() });
        return { ...signedGrant, delegatedSignature };
    }
    /**
     * Verifies `signedGrant` against keys from `trustedKeys` (configured
     * independently of the grant):
     * - the issuer signature must come from the trusted key whose `issuerId` is
     *   the grant's `subjectActorId`;
     * - a grant with a `delegateActorId` must carry a delegated signature from the
     *   trusted key whose `issuerId` is that delegate;
     * - a revocation signature, if present, must come from the subject's key.
     */
    verifySignedGrant(signedGrant, trustedKeys) {
        const grant = signedGrant?.grant;
        if (!grant || typeof grant.subjectActorId !== "string" || grant.subjectActorId === "")
            return false;
        if ((0, crypto_1.stableHash)(grant) !== signedGrant.grantHash)
            return false;
        const { grantHash } = signedGrant;
        if (!signedBy({ grantHash, grant }, signedGrant.issuerSignature, trustedKeys, grant.subjectActorId))
            return false;
        if (grant.delegateActorId !== undefined) {
            if (!signedBy({ grantHash, grant, delegated: true }, signedGrant.delegatedSignature, trustedKeys, grant.delegateActorId))
                return false;
        }
        else if (signedGrant.delegatedSignature !== undefined) {
            return false;
        }
        if (signedGrant.revocationSignature !== undefined && !signedBy({ grantHash, grant, revokedAt: grant.revokedAt }, signedGrant.revocationSignature, trustedKeys, grant.subjectActorId))
            return false;
        return true;
    }
}
exports.ConsentRuntime = ConsentRuntime;
