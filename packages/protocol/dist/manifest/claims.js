"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSovereignKeyPair = exports.DERIVATION_RELATION_KINDS = exports.DerivationRelationKind = exports.AuthorityClaimKind = void 0;
exports.buildOriginClaim = buildOriginClaim;
exports.buildAuthorityClaim = buildAuthorityClaim;
exports.validateOriginClaim = validateOriginClaim;
exports.isValidOriginClaim = isValidOriginClaim;
exports.validateAuthorityClaim = validateAuthorityClaim;
exports.isValidAuthorityClaim = isValidAuthorityClaim;
exports.validateDerivationClaim = validateDerivationClaim;
exports.isValidDerivationClaim = isValidDerivationClaim;
exports.buildDerivationClaim = buildDerivationClaim;
exports.signClaim = signClaim;
exports.verifySignedClaim = verifySignedClaim;
exports.contestClaim = contestClaim;
const node_crypto_1 = require("node:crypto");
const claim_enums_1 = require("../claims/claim-enums");
const timestamps_1 = require("../claims/timestamps");
const sovereign_asset_id_1 = require("../identity/sovereign-asset-id");
const canonical_1 = require("../canonical");
const proof_1 = require("./proof");
Object.defineProperty(exports, "generateSovereignKeyPair", { enumerable: true, get: function () { return proof_1.generateSovereignKeyPair; } });
/**
 * Sub-kind of an AuthorityClaim, carried in `metadata.kind` rather than as
 * a new top-level `ClaimType` per role — keeps the core `ClaimType`
 * vocabulary generic (per-domain rights taxonomies, e.g. music roles,
 * belong to future domain profiles, not core Protocol).
 */
exports.AuthorityClaimKind = {
    Authorship: 'Authorship',
    Rights: 'Rights',
    License: 'License',
    Custom: 'Custom',
};
function buildOriginClaim(input) {
    return {
        id: input.id,
        type: claim_enums_1.ClaimType.Origin,
        subject: input.sovereignAssetId,
        issuer: input.issuer,
        assertionRef: `${input.id}:assertion`,
        evidenceRefs: input.evidenceRefs ?? [],
        attestationRefs: [],
        issuedAt: input.assertedAt,
        metadata: { assertedOrigin: input.assertedOrigin },
    };
}
function buildAuthorityClaim(input) {
    return {
        id: input.id,
        type: claim_enums_1.ClaimType.Authorship,
        subject: input.sovereignAssetId,
        issuer: input.issuer,
        assertionRef: `${input.id}:assertion`,
        evidenceRefs: input.evidenceRefs ?? [],
        attestationRefs: [],
        issuedAt: input.issuedAt,
        metadata: { kind: input.kind, statement: input.statement },
    };
}
/**
 * How a child sovereign subject is asserted to relate to the sources it came
 * from. Carried in `metadata.relation` rather than as a per-relationship
 * `ClaimType`, for the same reason `AuthorityClaimKind` is: the core
 * `ClaimType` vocabulary stays generic, and per-domain derivation taxonomies
 * (a music stem, a model fine-tune, a legal redaction) belong to future
 * domain profiles rather than to core Protocol.
 *
 * Deliberately generic and deliberately non-judgmental. There is no
 * `PlagiarizedFrom`, `Infringes`, `AuthorizedDerivative` or `IllegalCopy`:
 * those are legal or factual conclusions, and Protocol records asserted
 * relationships rather than adjudicating them. A derivation relation says
 * nothing about whether the derivation was permitted.
 */
exports.DerivationRelationKind = {
    /** The child is asserted to come from the sources, unspecified how. */
    DerivedFrom: 'DerivedFrom',
    /** The child is asserted to be the result of transforming the sources. */
    TransformedFrom: 'TransformedFrom',
    /** The child is asserted to compose or merge several sources. */
    CombinedFrom: 'CombinedFrom',
    /** The child is asserted to be a part taken out of the sources. */
    ExtractedFrom: 'ExtractedFrom',
    /** The child is asserted to have been produced from the sources by some process. */
    GeneratedFrom: 'GeneratedFrom',
    /** An issuer-specific relation; `statement` carries what it means. */
    Custom: 'Custom',
};
/** Every canonical relation, in a stable order, for validation and discovery. */
exports.DERIVATION_RELATION_KINDS = Object.freeze(Object.values(exports.DerivationRelationKind));
function isNonBlankString(value) {
    return typeof value === 'string' && value.trim() !== '';
}
/**
 * Smallest validation that keeps a claim's `issuer` truthful and
 * canonicalizable. `CanonicalIssuer` is `string | CanonicalPrincipalRef`, so
 * a non-blank string, or an object carrying a non-blank `id` and `kind`, is
 * accepted.
 *
 * Deliberately NOT checked: that `kind` is a current member of
 * `PrincipalKind` (a future principal kind must stay expressible), nor
 * anything about `displayName`, `source` or `metadata`. Protocol still has no
 * fully canonical runtime validator for `CanonicalPrincipalRef` — SM-04 found
 * the same gap for `SovereignRegistrant` and SM-05 does not close it, because
 * redesigning the principal model is neither of their missions. This is the
 * structural floor that stops a malformed issuer from reaching a canonical
 * claim, and the gap above it is documented rather than pretended away.
 */
function isValidCanonicalIssuer(value) {
    if (isNonBlankString(value))
        return true;
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return false;
    const candidate = value;
    return isNonBlankString(candidate.id) && isNonBlankString(candidate.kind);
}
/**
 * Every element must be present and satisfy `predicate`.
 *
 * `Array.prototype.every` *skips holes*, so a sparse array like `new Array(1)`
 * satisfies any `every` check while still carrying nothing at index 0. An
 * untyped caller can produce one, and the hole survives into claim metadata
 * where it canonicalizes to nothing and reaches a lineage node as a missing
 * `sovereignAssetId`. Iterating a densified copy makes holes visible as
 * `undefined` and rejects them.
 */
function isDenseArrayOf(value, predicate) {
    return Array.isArray(value) && Array.from(value).every((entry) => predicate(entry));
}
function isValidEvidenceRefs(value) {
    return isDenseArrayOf(value, isNonBlankString);
}
function hasOwnProperty(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
}
/**
 * The structural checks every canonical claim in this module shares. Returns
 * accumulated reasons rather than a boolean so a caller can report *which*
 * part of an assertion was malformed.
 */
function commonClaimReasons(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return { claim: undefined, reasons: ['INVALID_CLAIM_STRUCTURE'] };
    }
    const candidate = value;
    const reasons = [];
    if (!isNonBlankString(candidate.id))
        reasons.push('INVALID_CLAIM_ID');
    if (!(0, sovereign_asset_id_1.isValidSovereignAssetId)(candidate.subject))
        reasons.push('INVALID_CLAIM_SUBJECT');
    if (!isValidCanonicalIssuer(candidate.issuer))
        reasons.push('INVALID_CLAIM_ISSUER');
    if (!(0, timestamps_1.isCanonicalTimestamp)(candidate.issuedAt))
        reasons.push('INVALID_CLAIM_ISSUED_AT');
    if (!isValidEvidenceRefs(candidate.evidenceRefs))
        reasons.push('INVALID_CLAIM_EVIDENCE_REFS');
    // `assertionRef` and `attestationRefs` are required by `CanonicalClaim` too.
    // A TypeScript caller cannot omit them, but these guards exist precisely for
    // the callers that are not TypeScript — without this, a claim missing them
    // passes the guard and is then returned as an `OriginClaim` /
    // `AuthorityClaim` / `DerivationClaim` that does not satisfy the contract it
    // is advertised under.
    if (!isNonBlankString(candidate.assertionRef))
        reasons.push('INVALID_CLAIM_ASSERTION_REF');
    if (!isDenseArrayOf(candidate.attestationRefs, isNonBlankString)) {
        reasons.push('INVALID_CLAIM_ATTESTATION_REFS');
    }
    return { claim: candidate, reasons };
}
/**
 * Structural validation for an `OriginClaim`.
 *
 * `assertedOrigin` is validated as a non-blank string and nothing more: it is
 * an *assertion value*, so a value that looks like a URL is never parsed,
 * resolved or dereferenced, and an origin nobody has a syntax for stays
 * expressible.
 */
function validateOriginClaim(value) {
    const { claim, reasons } = commonClaimReasons(value);
    if (claim === undefined)
        return { valid: false, reasons };
    if (claim.type !== claim_enums_1.ClaimType.Origin)
        reasons.push('INVALID_CLAIM_TYPE');
    const metadata = claim.metadata;
    if (typeof metadata !== 'object' || metadata === null || !isNonBlankString(metadata.assertedOrigin)) {
        reasons.push('INVALID_ASSERTED_ORIGIN');
    }
    return { valid: reasons.length === 0, reasons };
}
function isValidOriginClaim(value) {
    return validateOriginClaim(value).valid;
}
/** Structural validation for an `AuthorityClaim`, including its `metadata.kind` sub-kind. */
function validateAuthorityClaim(value) {
    const { claim, reasons } = commonClaimReasons(value);
    if (claim === undefined)
        return { valid: false, reasons };
    if (claim.type !== claim_enums_1.ClaimType.Authorship)
        reasons.push('INVALID_CLAIM_TYPE');
    const metadata = claim.metadata;
    if (typeof metadata !== 'object' || metadata === null) {
        reasons.push('INVALID_AUTHORITY_METADATA');
        return { valid: false, reasons };
    }
    if (!Object.values(exports.AuthorityClaimKind).includes(metadata.kind)) {
        reasons.push('INVALID_AUTHORITY_CLAIM_KIND');
    }
    if (!isNonBlankString(metadata.statement)) {
        reasons.push('INVALID_AUTHORITY_STATEMENT');
    }
    return { valid: reasons.length === 0, reasons };
}
function isValidAuthorityClaim(value) {
    return validateAuthorityClaim(value).valid;
}
/**
 * Structural validation for a `DerivationClaim`.
 *
 * Every rule here is local and offline: no network, no provider, no registry,
 * no resolution of a source id to an actual registered subject. It confirms
 * that the *assertion* is well formed, never that it is true.
 *
 * The source list must be non-empty (an assertion of derivation from nothing
 * is not an assertion), free of duplicates by exact sovereign identity, and
 * must not contain the child. Duplicates are reported rather than silently
 * collapsed: a caller that sent `[A, A, B]` made a mistake worth surfacing,
 * and quietly rewriting a caller's assertion is not Protocol's job.
 *
 * Direct self-derivation (`A → A`) is rejected because no reading of it is
 * meaningful. That is the *only* cycle claim this function makes: a single
 * claim cannot establish that a wider lineage graph is acyclic, because the
 * rest of the graph is not in front of it. Cycles across several claims are a
 * finding of `traceSovereignLineage` over a supplied dataset, not something
 * this validator can or does rule out.
 */
function validateDerivationClaim(value) {
    const { claim, reasons } = commonClaimReasons(value);
    if (claim === undefined)
        return { valid: false, reasons };
    if (claim.type !== claim_enums_1.ClaimType.Derivation)
        reasons.push('INVALID_CLAIM_TYPE');
    const metadata = claim.metadata;
    if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
        reasons.push('INVALID_DERIVATION_METADATA');
        return { valid: false, reasons };
    }
    const sources = metadata.sourceSovereignAssetIds;
    if (!Array.isArray(sources)) {
        reasons.push('INVALID_DERIVATION_SOURCES');
    }
    else if (sources.length === 0) {
        reasons.push('DERIVATION_SOURCES_REQUIRED');
    }
    else {
        if (!isDenseArrayOf(sources, sovereign_asset_id_1.isValidSovereignAssetId)) {
            reasons.push('INVALID_DERIVATION_SOURCE');
        }
        if (new Set(sources).size !== sources.length) {
            reasons.push('DUPLICATE_DERIVATION_SOURCE');
        }
        if (sources.includes(claim.subject)) {
            reasons.push('DERIVATION_SELF_REFERENCE');
        }
    }
    if (!exports.DERIVATION_RELATION_KINDS.includes(metadata.relation)) {
        reasons.push('INVALID_DERIVATION_RELATION');
    }
    // A present-but-blank optional is a malformed assertion, not an absent one;
    // a present-but-`undefined` optional cannot be canonicalized at all.
    if (hasOwnProperty(metadata, 'statement') && !isNonBlankString(metadata.statement)) {
        reasons.push('INVALID_DERIVATION_STATEMENT');
    }
    if (hasOwnProperty(metadata, 'occurredAt') && !(0, timestamps_1.isCanonicalTimestamp)(metadata.occurredAt)) {
        reasons.push('INVALID_DERIVATION_OCCURRED_AT');
    }
    return { valid: reasons.length === 0, reasons };
}
function isValidDerivationClaim(value) {
    return validateDerivationClaim(value).valid;
}
/**
 * Builds a canonical `DerivationClaim`, reusing the same `CanonicalClaim`
 * shape as `buildOriginClaim`/`buildAuthorityClaim` rather than introducing a
 * parallel lineage object model.
 *
 * Throws on a malformed assertion rather than repairing it — a construction
 * helper, not a lenient parser, matching `buildSovereignExternalReference`.
 * The caller's `sourceSovereignAssetIds` array is copied, never sorted,
 * deduplicated or frozen in place: the assertion that reaches the claim is
 * exactly the one the issuer made, and the caller's own array is left alone.
 * Absent optionals are omitted structurally, never emitted as `undefined`,
 * so the claim stays canonicalizable under `aoc-canonical-json/1`.
 */
function buildDerivationClaim(input) {
    const claim = {
        id: input.id,
        type: claim_enums_1.ClaimType.Derivation,
        subject: input.sovereignAssetId,
        issuer: input.issuer,
        assertionRef: `${input.id}:assertion`,
        evidenceRefs: input.evidenceRefs ?? [],
        attestationRefs: [],
        issuedAt: input.issuedAt,
        metadata: {
            sourceSovereignAssetIds: [...input.sourceSovereignAssetIds],
            relation: input.relation,
            ...(input.statement === undefined ? {} : { statement: input.statement }),
            ...(input.occurredAt === undefined ? {} : { occurredAt: input.occurredAt }),
        },
    };
    const validation = validateDerivationClaim(claim);
    if (!validation.valid) {
        throw new Error(`Invalid DerivationClaim: ${validation.reasons.join(', ')}`);
    }
    return claim;
}
function signClaim(claim, privateKeyPem, signingKey, now) {
    const digest = (0, node_crypto_1.createHash)('sha256').update((0, canonical_1.canonicalizeJSON)(claim)).digest('hex');
    const proof = (0, proof_1.signSovereignPayload)(claim, privateKeyPem, signingKey, now);
    return { claim, digest, proof };
}
function verifySignedClaim(signed) {
    const reasons = [];
    // Each field is read once, and the claim is canonicalized once: the digest
    // and the signature are both checked against that one serialization.
    const { claim, digest, proof } = signed;
    const canonical = (0, canonical_1.canonicalizeJSON)(claim);
    if ((0, proof_1.digestCanonicalBytes)(canonical) !== digest) {
        reasons.push('CLAIM_DIGEST_MISMATCH');
    }
    const proofSnapshot = (0, proof_1.snapshotSovereignProof)(proof);
    if (!proofSnapshot || !(0, proof_1.verifySovereignSignatureOverCanonical)(canonical, proofSnapshot)) {
        reasons.push('CLAIM_SIGNATURE_INVALID');
    }
    return { valid: reasons.length === 0, reasons };
}
function contestClaim(input) {
    return {
        id: input.id,
        claimRef: input.claimRef,
        status: claim_enums_1.StandingStatus.Contested,
        reason: input.reason,
        effectiveAt: input.effectiveAt,
    };
}
