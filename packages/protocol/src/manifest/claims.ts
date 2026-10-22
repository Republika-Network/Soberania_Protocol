import { createHash } from 'node:crypto';

import { ClaimType, StandingStatus } from '../claims/claim-enums';
import type { CanonicalClaim } from '../claims/claim';
import type { CanonicalStanding } from '../claims/standing';
import type {
  CanonicalClaimId,
  CanonicalEvidenceId,
  CanonicalIssuer,
  CanonicalTimestamp,
} from '../claims/primitives';
import { isCanonicalTimestamp } from '../claims/timestamps';
import { isValidSovereignAssetId } from '../identity/sovereign-asset-id';
import type { SovereignAssetId } from '../identity/sovereign-asset-id';
import { canonicalizeJSON } from '../canonical';
import {
  digestCanonicalBytes,
  generateSovereignKeyPair,
  signSovereignPayload,
  snapshotSovereignProof,
  verifySovereignSignatureOverCanonical,
} from './proof';
import type { SovereignKeyPair, SovereignProof, SovereignSigningKey } from './proof';

/**
 * OriginClaim — a `CanonicalClaim` recording where/how a SovereignAssetId's
 * subject is asserted to have originated. This is reuse, not a parallel
 * rights system: it is a `CanonicalClaim` with `type: ClaimType.Origin`
 * whose `subject` is the SovereignAssetId. A valid signature over this
 * claim proves the issuer made the assertion — it does not prove the
 * asserted origin is historically or legally true.
 */
export interface OriginClaim extends CanonicalClaim {
  readonly type: typeof ClaimType.Origin;
  readonly metadata: Readonly<{ assertedOrigin: string } & Record<string, unknown>>;
}

/**
 * Sub-kind of an AuthorityClaim, carried in `metadata.kind` rather than as
 * a new top-level `ClaimType` per role — keeps the core `ClaimType`
 * vocabulary generic (per-domain rights taxonomies, e.g. music roles,
 * belong to future domain profiles, not core Protocol).
 */
export const AuthorityClaimKind = {
  Authorship: 'Authorship',
  Rights: 'Rights',
  License: 'License',
  Custom: 'Custom',
} as const;
export type AuthorityClaimKind = (typeof AuthorityClaimKind)[keyof typeof AuthorityClaimKind];

/**
 * AuthorityClaim — a `CanonicalClaim` with `type: ClaimType.Authorship`
 * recording a declared authority/authorship/rights assertion over a
 * SovereignAssetId. Registering an asset (`registrant`) is never the same
 * fact as an AuthorityClaim, and neither ever establishes legal ownership
 * on its own — see `docs/architecture/sovereign-asset-core.md`.
 */
export interface AuthorityClaim extends CanonicalClaim {
  readonly type: typeof ClaimType.Authorship;
  readonly metadata: Readonly<{ kind: AuthorityClaimKind; statement: string } & Record<string, unknown>>;
}

export interface BuildOriginClaimInput {
  readonly id: string;
  readonly sovereignAssetId: SovereignAssetId;
  readonly issuer: CanonicalIssuer;
  readonly assertedOrigin: string;
  readonly assertedAt: CanonicalTimestamp;
  readonly evidenceRefs?: readonly CanonicalEvidenceId[];
}

export function buildOriginClaim(input: BuildOriginClaimInput): OriginClaim {
  return {
    id: input.id,
    type: ClaimType.Origin,
    subject: input.sovereignAssetId,
    issuer: input.issuer,
    assertionRef: `${input.id}:assertion`,
    evidenceRefs: input.evidenceRefs ?? [],
    attestationRefs: [],
    issuedAt: input.assertedAt,
    metadata: { assertedOrigin: input.assertedOrigin },
  };
}

export interface BuildAuthorityClaimInput {
  readonly id: string;
  readonly sovereignAssetId: SovereignAssetId;
  readonly issuer: CanonicalIssuer;
  readonly kind: AuthorityClaimKind;
  readonly statement: string;
  readonly issuedAt: CanonicalTimestamp;
  readonly evidenceRefs?: readonly CanonicalEvidenceId[];
}

export function buildAuthorityClaim(input: BuildAuthorityClaimInput): AuthorityClaim {
  return {
    id: input.id,
    type: ClaimType.Authorship,
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
export const DerivationRelationKind = {
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
} as const;
export type DerivationRelationKind = (typeof DerivationRelationKind)[keyof typeof DerivationRelationKind];

/** Every canonical relation, in a stable order, for validation and discovery. */
export const DERIVATION_RELATION_KINDS = Object.freeze(
  Object.values(DerivationRelationKind) as readonly DerivationRelationKind[],
);

/**
 * DerivationClaim — a `CanonicalClaim` with `type: ClaimType.Derivation`
 * recording that its subject is asserted to derive from one or more *other*
 * sovereign subjects.
 *
 *     metadata.sourceSovereignAssetIds        claim.subject
 *          A ──┐
 *              ├────────── relation ────────────► C
 *          B ──┘
 *
 * `subject` is the **child**; the parents/sources are in the metadata. That
 * direction is what lets a subject carry zero, one or many derivation
 * assertions — from one issuer, or from several who disagree — with none of
 * them being an identity field. `SovereignManifestV1` deliberately has no
 * `parentId`: a single manifest field would force a tree, make multi-parent
 * composition inexpressible, turn a contestable assertion into identity, and
 * conflate manifest evolution (the same subject at version 2) with asset
 * derivation (a different subject made from this one).
 *
 * ## Why the edges are SovereignAssetIds
 *
 * Sources are named by `SovereignAssetId` and never by an
 * `externalReference.id`, a locator, a URL, a CID, a `ContentIdentity`, a
 * `manifestDigest` or a provider id. Lineage has to survive provider
 * migration, locator changes and re-encoding: `A → C` must stay true after A
 * moves to another provider or its bytes change. Lineage identity is
 * therefore *subject* identity, never location or representation. A source
 * that has no `SovereignAssetId` yet is given one through AOC.IDENTITY
 * first — Protocol grows no second, weaker kind of ancestor.
 *
 * ## What it does not mean
 *
 * A derivation assertion is not historical truth, not legal authorization,
 * not a licence, and not proof the issuer had any right to derive. Nothing is
 * inherited along the edge: not licences, rights, obligations, authority,
 * authorship, governance policy or evidence. It also implies nothing about
 * bytes in either direction — a derived child normally has a *different*
 * `ContentIdentity`, and two subjects with the same `ContentIdentity` are not
 * thereby related. A valid signature over this claim would prove the issuer
 * asserted it, never that it happened.
 */
export interface DerivationClaim extends CanonicalClaim {
  readonly type: typeof ClaimType.Derivation;
  readonly metadata: Readonly<
    {
      /** The asserted parents/sources. At least one, no duplicates, never the child. */
      readonly sourceSovereignAssetIds: readonly SovereignAssetId[];
      readonly relation: DerivationRelationKind;
      /** Optional free-text characterization of the transformation. Data, never executed. */
      readonly statement?: string;
      /**
       * Optional: when the issuer asserts the derivation *itself* happened.
       * Distinct from `issuedAt`, which is when this claim was recorded — a
       * 2026 claim about a 2019 transformation is an ordinary case, and
       * collapsing the two would silently invent history. Still an asserted
       * value: Protocol does not establish that it is true.
       */
      readonly occurredAt?: CanonicalTimestamp;
    } & Record<string, unknown>
  >;
}

export interface BuildDerivationClaimInput {
  readonly id: CanonicalClaimId;
  /** The child — the subject asserted to derive from the sources. */
  readonly sovereignAssetId: SovereignAssetId;
  readonly issuer: CanonicalIssuer;
  readonly sourceSovereignAssetIds: readonly SovereignAssetId[];
  readonly relation: DerivationRelationKind;
  readonly statement?: string;
  readonly occurredAt?: CanonicalTimestamp;
  readonly issuedAt: CanonicalTimestamp;
  readonly evidenceRefs?: readonly CanonicalEvidenceId[];
}

export interface ClaimValidationResult {
  readonly valid: boolean;
  readonly reasons: readonly string[];
}

function isNonBlankString(value: unknown): value is string {
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
function isValidCanonicalIssuer(value: unknown): value is CanonicalIssuer {
  if (isNonBlankString(value)) return true;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as { id?: unknown; kind?: unknown };
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
function isDenseArrayOf<T>(value: unknown, predicate: (entry: unknown) => boolean): value is readonly T[] {
  return Array.isArray(value) && Array.from(value).every((entry) => predicate(entry));
}

function isValidEvidenceRefs(value: unknown): value is readonly CanonicalEvidenceId[] {
  return isDenseArrayOf<CanonicalEvidenceId>(value, isNonBlankString);
}

function hasOwnProperty(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/**
 * The structural checks every canonical claim in this module shares. Returns
 * accumulated reasons rather than a boolean so a caller can report *which*
 * part of an assertion was malformed.
 */
function commonClaimReasons(value: unknown): { readonly claim: CanonicalClaim | undefined; readonly reasons: string[] } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { claim: undefined, reasons: ['INVALID_CLAIM_STRUCTURE'] };
  }
  const candidate = value as CanonicalClaim;
  const reasons: string[] = [];

  if (!isNonBlankString(candidate.id)) reasons.push('INVALID_CLAIM_ID');
  if (!isValidSovereignAssetId(candidate.subject)) reasons.push('INVALID_CLAIM_SUBJECT');
  if (!isValidCanonicalIssuer(candidate.issuer)) reasons.push('INVALID_CLAIM_ISSUER');
  if (!isCanonicalTimestamp(candidate.issuedAt)) reasons.push('INVALID_CLAIM_ISSUED_AT');
  if (!isValidEvidenceRefs(candidate.evidenceRefs)) reasons.push('INVALID_CLAIM_EVIDENCE_REFS');
  // `assertionRef` and `attestationRefs` are required by `CanonicalClaim` too.
  // A TypeScript caller cannot omit them, but these guards exist precisely for
  // the callers that are not TypeScript — without this, a claim missing them
  // passes the guard and is then returned as an `OriginClaim` /
  // `AuthorityClaim` / `DerivationClaim` that does not satisfy the contract it
  // is advertised under.
  if (!isNonBlankString(candidate.assertionRef)) reasons.push('INVALID_CLAIM_ASSERTION_REF');
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
export function validateOriginClaim(value: unknown): ClaimValidationResult {
  const { claim, reasons } = commonClaimReasons(value);
  if (claim === undefined) return { valid: false, reasons };

  if (claim.type !== ClaimType.Origin) reasons.push('INVALID_CLAIM_TYPE');

  const metadata = claim.metadata as { assertedOrigin?: unknown } | undefined;
  if (typeof metadata !== 'object' || metadata === null || !isNonBlankString(metadata.assertedOrigin)) {
    reasons.push('INVALID_ASSERTED_ORIGIN');
  }

  return { valid: reasons.length === 0, reasons };
}

export function isValidOriginClaim(value: unknown): value is OriginClaim {
  return validateOriginClaim(value).valid;
}

/** Structural validation for an `AuthorityClaim`, including its `metadata.kind` sub-kind. */
export function validateAuthorityClaim(value: unknown): ClaimValidationResult {
  const { claim, reasons } = commonClaimReasons(value);
  if (claim === undefined) return { valid: false, reasons };

  if (claim.type !== ClaimType.Authorship) reasons.push('INVALID_CLAIM_TYPE');

  const metadata = claim.metadata as { kind?: unknown; statement?: unknown } | undefined;
  if (typeof metadata !== 'object' || metadata === null) {
    reasons.push('INVALID_AUTHORITY_METADATA');
    return { valid: false, reasons };
  }
  if (!Object.values(AuthorityClaimKind).includes(metadata.kind as AuthorityClaimKind)) {
    reasons.push('INVALID_AUTHORITY_CLAIM_KIND');
  }
  if (!isNonBlankString(metadata.statement)) {
    reasons.push('INVALID_AUTHORITY_STATEMENT');
  }

  return { valid: reasons.length === 0, reasons };
}

export function isValidAuthorityClaim(value: unknown): value is AuthorityClaim {
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
export function validateDerivationClaim(value: unknown): ClaimValidationResult {
  const { claim, reasons } = commonClaimReasons(value);
  if (claim === undefined) return { valid: false, reasons };

  if (claim.type !== ClaimType.Derivation) reasons.push('INVALID_CLAIM_TYPE');

  const metadata = claim.metadata as
    | { sourceSovereignAssetIds?: unknown; relation?: unknown; statement?: unknown; occurredAt?: unknown }
    | undefined;
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
    reasons.push('INVALID_DERIVATION_METADATA');
    return { valid: false, reasons };
  }

  const sources = metadata.sourceSovereignAssetIds;
  if (!Array.isArray(sources)) {
    reasons.push('INVALID_DERIVATION_SOURCES');
  } else if (sources.length === 0) {
    reasons.push('DERIVATION_SOURCES_REQUIRED');
  } else {
    if (!isDenseArrayOf(sources, isValidSovereignAssetId)) {
      reasons.push('INVALID_DERIVATION_SOURCE');
    }
    if (new Set(sources).size !== sources.length) {
      reasons.push('DUPLICATE_DERIVATION_SOURCE');
    }
    if (sources.includes(claim.subject)) {
      reasons.push('DERIVATION_SELF_REFERENCE');
    }
  }

  if (!DERIVATION_RELATION_KINDS.includes(metadata.relation as DerivationRelationKind)) {
    reasons.push('INVALID_DERIVATION_RELATION');
  }

  // A present-but-blank optional is a malformed assertion, not an absent one;
  // a present-but-`undefined` optional cannot be canonicalized at all.
  if (hasOwnProperty(metadata, 'statement') && !isNonBlankString(metadata.statement)) {
    reasons.push('INVALID_DERIVATION_STATEMENT');
  }
  if (hasOwnProperty(metadata, 'occurredAt') && !isCanonicalTimestamp(metadata.occurredAt)) {
    reasons.push('INVALID_DERIVATION_OCCURRED_AT');
  }

  return { valid: reasons.length === 0, reasons };
}

export function isValidDerivationClaim(value: unknown): value is DerivationClaim {
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
export function buildDerivationClaim(input: BuildDerivationClaimInput): DerivationClaim {
  const claim: DerivationClaim = {
    id: input.id,
    type: ClaimType.Derivation,
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

/**
 * A claim that matters to sovereignty must be cryptographically
 * attributable. `SignedClaim` wraps any `CanonicalClaim` (including
 * `OriginClaim`/`AuthorityClaim`) with a digest and an Ed25519 proof over
 * its `aoc-canonical-json/1` serialization — mutation after signing
 * invalidates verification.
 */
export interface SignedClaim<TClaim extends CanonicalClaim = CanonicalClaim> {
  readonly claim: TClaim;
  readonly digest: string;
  readonly proof: SovereignProof;
}

export function signClaim<TClaim extends CanonicalClaim>(
  claim: TClaim,
  privateKeyPem: string,
  signingKey: SovereignSigningKey,
  now?: Date,
): SignedClaim<TClaim> {
  const digest = createHash('sha256').update(canonicalizeJSON(claim)).digest('hex');
  const proof = signSovereignPayload(claim, privateKeyPem, signingKey, now);
  return { claim, digest, proof };
}

export interface SignedClaimVerificationResult {
  readonly valid: boolean;
  readonly reasons: readonly string[];
}

export function verifySignedClaim(signed: SignedClaim): SignedClaimVerificationResult {
  const reasons: string[] = [];

  // Each field is read once, and the claim is canonicalized once: the digest
  // and the signature are both checked against that one serialization.
  const { claim, digest, proof } = signed;
  const canonical = canonicalizeJSON(claim);

  if (digestCanonicalBytes(canonical) !== digest) {
    reasons.push('CLAIM_DIGEST_MISMATCH');
  }

  const proofSnapshot = snapshotSovereignProof(proof);
  if (!proofSnapshot || !verifySovereignSignatureOverCanonical(canonical, proofSnapshot)) {
    reasons.push('CLAIM_SIGNATURE_INVALID');
  }

  return { valid: reasons.length === 0, reasons };
}

/**
 * Marks a claim's standing as `Contested` without deleting or mutating the
 * claim itself. Both the original claim and this standing record remain
 * independently verifiable/resolvable — the Protocol records the dispute;
 * it does not adjudicate a winner.
 */
export interface ContestClaimInput {
  readonly id: string;
  readonly claimRef: string;
  readonly reason: string;
  readonly effectiveAt: CanonicalTimestamp;
}

export function contestClaim(input: ContestClaimInput): CanonicalStanding {
  return {
    id: input.id,
    claimRef: input.claimRef,
    status: StandingStatus.Contested,
    reason: input.reason,
    effectiveAt: input.effectiveAt,
  };
}

export type { SovereignKeyPair, SovereignSigningKey, SovereignProof };
export { generateSovereignKeyPair };
