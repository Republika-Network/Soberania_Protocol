import { canonicalizeJSON } from '@aoc/protocol/canonical';
import { buildSovereignExternalReference, computeContentIdentity, mintSovereignAssetId, parseSovereignAssetId } from '@aoc/protocol/identity';
import type { SovereignAssetId, SovereignExternalReference } from '@aoc/protocol/identity';
import {
  AOC_SOVEREIGNTY_INTEROPERABILITY_PROFILE_ID,
  AOC_SOVEREIGNTY_INTEROPERABILITY_PROFILE_VERSION,
  AOC_SOVEREIGNTY_PORTABILITY_MEDIA_TYPE,
  buildSovereigntyInteroperabilityConsumerSupportV1,
} from '@aoc/protocol/interoperability';
import type { InteroperabilitySemanticRequirement, SovereigntyInteroperabilityConsumerSupportV1 } from '@aoc/protocol/interoperability';
import {
  AOC_LICENSING_ACTION_TERM_IDS,
  AOC_LICENSING_DECLARATION_TERM_IDS,
  AOC_LICENSING_SEMANTIC_NAMESPACE,
  SovereignLicenseTermsAudienceKind,
  SovereignLicenseTermsRuleEffect,
  buildLicenseTermsClaim,
} from '@aoc/protocol/licensing';
import type { LicenseTermsClaim, SovereignLicenseTermsRuleV1 } from '@aoc/protocol/licensing';
import { buildSovereignManifestV1, generateSovereignKeyPair, signClaim, signSovereignManifest } from '@aoc/protocol/manifest';
import type { SignedClaim, SignedSovereignManifest, SovereignKeyPair, SovereignSigningKey } from '@aoc/protocol/manifest';
import type { VerificationKeyResolver } from '@aoc/protocol/adapters';
import {
  SOVEREIGNTY_PORTABILITY_BUNDLE_SCHEMA_VERSION,
  buildSovereigntyPortabilityBundleV1,
  serializeSovereigntyPortabilityBundle,
} from '@aoc/protocol/portability';

/**
 * FV-P1 — synthetic fixtures for the `soberania.document-use/1` profile
 * (docs/protocol/profiles/DOCUMENT_USE_PROFILE.md).
 *
 * Builds a fully synthetic Markdown document, binds it to a portable sovereign
 * asset identity with a Fileverse-shaped external reference, and declares the
 * owner's usage terms as a signed `LicenseTermsClaim` — using only the
 * published `@aoc/protocol@0.2.0-rc.3` export keys. Nothing here evaluates the
 * terms, enforces anything, or contacts Fileverse: the fixtures exist so a
 * receiver (and the contract tests) can check what rc.3 verification does and
 * does not establish.
 *
 * Every key is generated in memory per call and only public halves leave this
 * module. No private key, credential, real document or real Fileverse
 * identifier is produced or persisted.
 */

export const DOCUMENT_USE_PROFILE_ID = 'soberania.document-use/1' as const;

/** The profile's action concepts, as `SovereignLicenseActionRef`s. */
export const DOCUMENT_USE_ACTIONS = Object.freeze({
  access: Object.freeze({ namespace: AOC_LICENSING_SEMANTIC_NAMESPACE, termRef: AOC_LICENSING_ACTION_TERM_IDS.access }),
  export: Object.freeze({ namespace: 'soberania.document', termRef: 'soberania.document:export' }),
  modifyProtectedTerms: Object.freeze({ namespace: 'soberania.document', termRef: 'soberania.document:modify-protected-terms' }),
});

/**
 * The profile's one obligated action: obtaining the owner's approval. Its link
 * to `modify-protected-terms` comes from the profile's table, never from
 * parsing this termRef.
 */
export const DOCUMENT_USE_OBLIGATED_ACTIONS = Object.freeze({
  ownerApprovalForModifyProtectedTerms: Object.freeze({
    namespace: 'soberania.document',
    termRef: 'soberania.document:owner-approval.modify-protected-terms',
  }),
});

/** The fixed instant every fixture is evaluated against, so expectations never depend on the wall clock. */
export const FV_P1_REFERENCE_TIME = '2026-10-28T12:00:00.000Z';

const REGISTRANT = 'principal:fv-p1-synthetic-registrant';
const RECEIVER = 'principal:fv-p1-synthetic-receiver';
/** A principal the receiver knows and trusts as itself, but who holds no authority over the asset. */
const THIRD_PARTY = 'principal:fv-p1-synthetic-third-party';

/**
 * Synthetic: a portal address chosen to be recognisably fake (zeros, ending
 * `f1e01`). It is not looked up, and nothing here claims or checks that no
 * contract exists at it.
 */
export const SYNTHETIC_FILEVERSE_PORTAL_ADDRESS = '0x00000000000000000000000000000000000f1e01';

const ISSUED_AT = '2026-10-28T09:00:00.000Z';
const TERMS_EXPIRE_AT = '2027-10-28T00:00:00.000Z';
const EXPIRED_ISSUED_AT = '2026-09-01T09:00:00.000Z';
const EXPIRED_AT = '2026-10-01T00:00:00.000Z';

export const FILEVERSE_REFERENCE_NAMESPACE = 'fileverse' as const;

/**
 * The only admitted Fileverse reference id: `gnosis:` + lowercase portal
 * address + `/` + decimal file id (at most 78 digits, the width of a uint256).
 * An allowlist: `%`, `#`, `?`, `&`, `=`, whitespace and any other character
 * cannot appear, so neither a share-link key nor an encoded one can.
 */
export const FILEVERSE_REFERENCE_ID_PATTERN = /^gnosis:0x[0-9a-f]{40}\/(0|[1-9][0-9]{0,77})$/;

export interface FileverseDocumentLocation {
  readonly chain: 'gnosis';
  /** The portal contract address, `0x` and 40 lowercase hex digits. */
  readonly portalAddress: string;
  /** The portal's on-chain file id, a decimal integer. */
  readonly fileId: string;
}

/**
 * Profile rule: a Fileverse reference is exactly `{ namespace: 'fileverse', id }`
 * with `id` matching `FILEVERSE_REFERENCE_ID_PATTERN`. No locator, no other
 * field, no other spelling. Anything else is refused, never sanitized.
 */
export function assertFileverseReference(reference: unknown): asserts reference is SovereignExternalReference {
  const keys = typeof reference === 'object' && reference !== null && !Array.isArray(reference) ? Object.keys(reference).sort() : [];
  const { namespace, id } = (reference ?? {}) as { namespace?: unknown; id?: unknown };
  if (
    keys.length !== 2
    || keys[0] !== 'id'
    || keys[1] !== 'namespace'
    || namespace !== FILEVERSE_REFERENCE_NAMESPACE
    || typeof id !== 'string'
    || !FILEVERSE_REFERENCE_ID_PATTERN.test(id)
  ) {
    throw new Error('Not an admitted soberania.document-use/1 Fileverse reference.');
  }
}

export function buildFileverseExternalReference(location: FileverseDocumentLocation): SovereignExternalReference {
  if (location.chain !== 'gnosis') throw new Error('Only the gnosis chain is defined by soberania.document-use/1.');
  const reference = buildSovereignExternalReference({
    namespace: FILEVERSE_REFERENCE_NAMESPACE,
    id: `${location.chain}:${location.portalAddress}/${location.fileId}`,
  });
  assertFileverseReference(reference);
  return reference;
}

/** A plainly synthetic contract. Fictional parties, no real terms. */
export function syntheticContractMarkdown(title: string): string {
  return [
    `# ${title}`,
    '',
    '> SYNTHETIC TEST DOCUMENT. Not a real agreement. Generated for FV-P1 fixtures.',
    '',
    '## Parties',
    '',
    '- Example Organisation A (synthetic)',
    '- Example Organisation B (synthetic)',
    '',
    '## Protected terms',
    '',
    '1. Fee: 0 synthetic units.',
    '2. Term: 12 months from the synthetic effective date.',
    '',
  ].join('\n');
}

const toBytes = (text: string): Uint8Array => new Uint8Array(Buffer.from(text, 'utf8'));

const rule = (id: string, effect: SovereignLicenseTermsRuleV1['effect'], action: { namespace: string; termRef: string }, statement: string): SovereignLicenseTermsRuleV1 => ({
  id,
  effect,
  action: { namespace: action.namespace, termRef: action.termRef },
  statement,
});

/** The document-use/1 terms every fixture declares: read yes, export no, modify only with owner approval. */
export const DOCUMENT_USE_RULES: readonly SovereignLicenseTermsRuleV1[] = Object.freeze([
  rule('rule-access', SovereignLicenseTermsRuleEffect.Permission, DOCUMENT_USE_ACTIONS.access, 'The receiver may read the document.'),
  rule('rule-export', SovereignLicenseTermsRuleEffect.Restriction, DOCUMENT_USE_ACTIONS.export, 'The receiver may not export the document.'),
  rule('rule-modify', SovereignLicenseTermsRuleEffect.Permission, DOCUMENT_USE_ACTIONS.modifyProtectedTerms, 'The receiver may modify protected terms.'),
  rule(
    'rule-modify-approval',
    SovereignLicenseTermsRuleEffect.Obligation,
    DOCUMENT_USE_OBLIGATED_ACTIONS.ownerApprovalForModifyProtectedTerms,
    'The receiver must obtain the owner\'s approval before modifying protected terms.',
  ),
]);

/**
 * Every semantic concept a document-use/1 bundle carries, as a consumer must
 * declare it: the licensing declaration and rule-effect concepts Protocol
 * attaches to every terms claim, plus the profile's actions.
 */
export const DOCUMENT_USE_SEMANTIC_TERMS: readonly InteroperabilitySemanticRequirement[] = Object.freeze(
  [
    ...Object.values(AOC_LICENSING_DECLARATION_TERM_IDS).map((termRef) => ({ namespace: AOC_LICENSING_SEMANTIC_NAMESPACE, termRef })),
    ...[...Object.values(DOCUMENT_USE_ACTIONS), ...Object.values(DOCUMENT_USE_OBLIGATED_ACTIONS)].map(({ namespace, termRef }) => ({ namespace, termRef })),
  ].map((term) => Object.freeze(term)),
);

/**
 * The consumer support a receiver declares to RSDK-01 for document-use/1
 * bundles. A `LicenseTermsClaim` travels as an `Authorship` claim, and every
 * concept in `DOCUMENT_USE_SEMANTIC_TERMS` must be declared, the obligated
 * approval action included: a receiver that does not declare it is told the
 * bundle is only partially compatible.
 */
export function buildDocumentUseConsumerSupport(): SovereigntyInteroperabilityConsumerSupportV1 {
  return buildSovereigntyInteroperabilityConsumerSupportV1({
    profile: { id: AOC_SOVEREIGNTY_INTEROPERABILITY_PROFILE_ID, acceptedVersions: [AOC_SOVEREIGNTY_INTEROPERABILITY_PROFILE_VERSION] },
    mediaTypes: [AOC_SOVEREIGNTY_PORTABILITY_MEDIA_TYPE],
    representationSchemaVersions: [SOVEREIGNTY_PORTABILITY_BUNDLE_SCHEMA_VERSION],
    canonicalizationProfiles: ['aoc-canonical-json/1'],
    artifactKinds: ['signed-manifest', 'signed-claim'],
    claimTypes: ['Authorship'],
    standingStatuses: [],
    semanticTerms: DOCUMENT_USE_SEMANTIC_TERMS,
  });
}

export const FIXTURE_CASE_IDS = Object.freeze(['valid-active', 'tampered-terms', 'wrong-asset', 'foreign-issuer', 'third-party-terms', 'expired-terms'] as const);
export type FixtureCaseId = (typeof FIXTURE_CASE_IDS)[number];

/**
 * What the published rc.3 verifiers are expected to report for a case, and
 * what the profile requires of a conforming receiver. The two are deliberately
 * separate: `profileRequirement` is normative text for a future evaluator,
 * not something any code in this repository performs today.
 */
export interface FixtureExpectation {
  readonly manifest: { readonly valid: boolean; readonly reasonsInclude: readonly string[] };
  readonly terms: { readonly valid: boolean; readonly reasonsInclude: readonly string[] };
  readonly profileRequirement: 'eligible-for-evaluation' | 'must-reject';
  /** Present when the case carries a defect: whether a published rc.3 API detects it, and the gap if not. */
  readonly defect?: { readonly detectedByRc3: boolean; readonly detectedBy?: string; readonly pendingGap?: string };
}

export interface FixtureCase {
  readonly id: FixtureCaseId;
  readonly description: string;
  /** The asset the receiver was asked to act on. */
  readonly expectedSovereignAssetId: SovereignAssetId;
  readonly signedManifest: SignedSovereignManifest;
  readonly signedTerms: SignedClaim<LicenseTermsClaim>;
  readonly contentBytes: Uint8Array;
  /** Canonical `aoc-canonical-json/1` bundle text. */
  readonly bundleText: string;
  readonly expected: FixtureExpectation;
}

/** A key the receiver pinned out of band: it binds `issuer` to `keyId`. Identity, not authority. */
export interface TrustedIssuerKey {
  readonly issuer: string;
  readonly keyId: string;
}

export interface FileverseDocumentUseFixtureSet {
  readonly profile: typeof DOCUMENT_USE_PROFILE_ID;
  /** Every document, principal, reference and key in this set is synthetic. */
  readonly synthetic: true;
  readonly referenceTime: string;
  readonly registrant: string;
  readonly receiver: string;
  readonly thirdParty: string;
  /** Public half only. The private key never leaves `generateFileverseDocumentUseFixtures`. */
  readonly registrantKey: SovereignSigningKey;
  /** The receiver's pinned keys: the registrant's and the third party's, each bound to its own identity. */
  readonly trustedIssuerKeys: readonly TrustedIssuerKey[];
  /** Vouches for exactly `trustedIssuerKeys`, as a receiver would after pinning them out of band. */
  readonly verificationKeyResolver: VerificationKeyResolver;
  readonly documentMarkdown: string;
  readonly cases: Readonly<Record<FixtureCaseId, FixtureCase>>;
}

export function verificationKeyResolverFor(trusted: readonly TrustedIssuerKey[]): VerificationKeyResolver {
  return {
    resolveVerificationKey: (issuer) => {
      const pinned = trusted.find((entry) => entry.issuer === issuer);
      return pinned === undefined ? undefined : { keyId: pinned.keyId, issuer: pinned.issuer, algorithm: 'ed25519' };
    },
  };
}

interface SignedAsset {
  readonly assetId: SovereignAssetId;
  readonly markdown: string;
  readonly contentBytes: Uint8Array;
  readonly signedManifest: SignedSovereignManifest;
  readonly signedTerms: SignedClaim<LicenseTermsClaim>;
}

function signTerms(options: {
  readonly key: SovereignKeyPair;
  readonly issuer: string;
  readonly assetId: SovereignAssetId;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly claimId: string;
}): SignedClaim<LicenseTermsClaim> {
  const terms = buildLicenseTermsClaim({
    id: options.claimId,
    sovereignAssetId: options.assetId,
    issuer: options.issuer,
    statement: 'Usage terms for a synthetic document.',
    audience: { kind: SovereignLicenseTermsAudienceKind.Principal, principal: RECEIVER },
    rules: DOCUMENT_USE_RULES,
    issuedAt: options.issuedAt,
    expiresAt: options.expiresAt,
  });
  return signClaim(terms, options.key.privateKeyPem, options.key.signingKey, new Date(options.issuedAt));
}

function signAsset(options: {
  readonly key: SovereignKeyPair;
  readonly registrant: string;
  readonly title: string;
  readonly fileId: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly claimId: string;
}): SignedAsset {
  const assetId = parseSovereignAssetId(mintSovereignAssetId());
  const markdown = syntheticContractMarkdown(options.title);
  const contentBytes = toBytes(markdown);

  const manifest = buildSovereignManifestV1({
    sovereignAssetId: assetId,
    externalReference: buildFileverseExternalReference({ chain: 'gnosis', portalAddress: SYNTHETIC_FILEVERSE_PORTAL_ADDRESS, fileId: options.fileId }),
    contentIdentity: computeContentIdentity(contentBytes),
    registrant: options.registrant,
    createdAt: options.issuedAt,
  });
  const signedManifest = signSovereignManifest(manifest, options.key.privateKeyPem, options.key.signingKey, new Date(options.issuedAt));
  const signedTerms = signTerms({
    key: options.key,
    issuer: options.registrant,
    assetId,
    issuedAt: options.issuedAt,
    expiresAt: options.expiresAt,
    claimId: options.claimId,
  });

  return { assetId, markdown, contentBytes, signedManifest, signedTerms };
}

function bundleTextFor(asset: Pick<SignedAsset, 'signedManifest' | 'signedTerms'>, subjectAssetId: SovereignAssetId): string {
  const { externalReference } = asset.signedManifest.manifest;
  return serializeSovereigntyPortabilityBundle(
    buildSovereigntyPortabilityBundleV1({
      subject: { sovereignAssetId: subjectAssetId, ...(externalReference === undefined ? {} : { externalReference }) },
      manifests: [{ kind: 'signed-manifest', signedManifest: asset.signedManifest }],
      claims: [{ kind: 'signed-claim', signedClaim: asset.signedTerms }],
    }),
  );
}

/** Rebuilds a signed claim with one rule's effect flipped, keeping the original digest and proof. */
function tamperTerms(signed: SignedClaim<LicenseTermsClaim>): SignedClaim<LicenseTermsClaim> {
  const original = JSON.parse(canonicalizeJSON(signed.claim)) as LicenseTermsClaim;
  const rules = original.metadata.terms.rules.map((candidate) =>
    candidate.id === 'rule-export' ? { ...candidate, effect: SovereignLicenseTermsRuleEffect.Permission } : candidate,
  );
  const claim = { ...original, metadata: { ...original.metadata, terms: { ...original.metadata.terms, rules } } } as LicenseTermsClaim;
  return { claim, digest: signed.digest, proof: signed.proof };
}

/**
 * Generates the FV-P1 fixture set. Every call mints fresh keys and asset ids,
 * so callers compare against `expected`, never against stored signatures.
 */
export function generateFileverseDocumentUseFixtures(): FileverseDocumentUseFixtureSet {
  const registrantKey = generateSovereignKeyPair();
  const foreignKey = generateSovereignKeyPair();
  const thirdPartyKey = generateSovereignKeyPair();

  const active = signAsset({
    key: registrantKey,
    registrant: REGISTRANT,
    title: 'Synthetic Confidential Services Agreement',
    fileId: '1',
    issuedAt: ISSUED_AT,
    expiresAt: TERMS_EXPIRE_AT,
    claimId: 'claim:fv-p1:terms:valid-active',
  });
  const other = signAsset({
    key: registrantKey,
    registrant: REGISTRANT,
    title: 'Synthetic Unrelated Agreement',
    fileId: '2',
    issuedAt: ISSUED_AT,
    expiresAt: TERMS_EXPIRE_AT,
    claimId: 'claim:fv-p1:terms:wrong-asset',
  });
  const impersonated = signAsset({
    // An untrusted key naming the trusted registrant: impersonation, not a second issuer.
    key: foreignKey,
    registrant: REGISTRANT,
    title: 'Synthetic Confidential Services Agreement',
    fileId: '3',
    issuedAt: ISSUED_AT,
    expiresAt: TERMS_EXPIRE_AT,
    claimId: 'claim:fv-p1:terms:foreign-issuer',
  });
  const expired = signAsset({
    key: registrantKey,
    registrant: REGISTRANT,
    title: 'Synthetic Expired Agreement',
    fileId: '4',
    issuedAt: EXPIRED_ISSUED_AT,
    expiresAt: EXPIRED_AT,
    claimId: 'claim:fv-p1:terms:expired-terms',
  });
  const tamperedTerms = tamperTerms(active.signedTerms);
  // A trusted third party signs, under its own identity, terms about the registrant's asset.
  const thirdPartyTerms = signTerms({
    key: thirdPartyKey,
    issuer: THIRD_PARTY,
    assetId: active.assetId,
    issuedAt: ISSUED_AT,
    expiresAt: TERMS_EXPIRE_AT,
    claimId: 'claim:fv-p1:terms:third-party-terms',
  });

  const cases: Record<FixtureCaseId, FixtureCase> = {
    'valid-active': {
      id: 'valid-active',
      description: 'Registrant-signed manifest and terms for the expected asset, unexpired at the reference time.',
      expectedSovereignAssetId: active.assetId,
      signedManifest: active.signedManifest,
      signedTerms: active.signedTerms,
      contentBytes: active.contentBytes,
      bundleText: bundleTextFor(active, active.assetId),
      expected: {
        manifest: { valid: true, reasonsInclude: [] },
        terms: { valid: true, reasonsInclude: [] },
        profileRequirement: 'eligible-for-evaluation',
      },
    },
    'tampered-terms': {
      id: 'tampered-terms',
      description: 'The export Restriction was flipped to a Permission after signing.',
      expectedSovereignAssetId: active.assetId,
      signedManifest: active.signedManifest,
      signedTerms: tamperedTerms,
      contentBytes: active.contentBytes,
      bundleText: bundleTextFor({ signedManifest: active.signedManifest, signedTerms: tamperedTerms }, active.assetId),
      expected: {
        manifest: { valid: true, reasonsInclude: [] },
        terms: { valid: false, reasonsInclude: ['CLAIM_DIGEST_MISMATCH', 'CLAIM_SIGNATURE_INVALID'] },
        profileRequirement: 'must-reject',
        defect: { detectedByRc3: true, detectedBy: 'verifySignedSovereignClaim' },
      },
    },
    'wrong-asset': {
      id: 'wrong-asset',
      description: 'Correctly signed artifacts for a different asset, presented for the expected one.',
      expectedSovereignAssetId: active.assetId,
      signedManifest: other.signedManifest,
      signedTerms: other.signedTerms,
      contentBytes: other.contentBytes,
      bundleText: bundleTextFor(other, other.assetId),
      expected: {
        manifest: { valid: true, reasonsInclude: [] },
        terms: { valid: true, reasonsInclude: [] },
        profileRequirement: 'must-reject',
        defect: {
          detectedByRc3: false,
          pendingGap:
            'rc.3 verifiers take no expected subject. The bundle builder and parser only refuse artifacts about a subject other than '
            + 'the bundle\'s own; RSDK-01 (Frontera) refuses a bundle for another asset only when the caller supplies '
            + 'expectedSovereignAssetId, which the profile makes mandatory.',
        },
      },
    },
    'foreign-issuer': {
      id: 'foreign-issuer',
      description: 'A key the receiver does not trust signs manifest and terms naming the trusted registrant (impersonation).',
      expectedSovereignAssetId: impersonated.assetId,
      signedManifest: impersonated.signedManifest,
      signedTerms: impersonated.signedTerms,
      contentBytes: impersonated.contentBytes,
      bundleText: bundleTextFor(impersonated, impersonated.assetId),
      expected: {
        manifest: { valid: false, reasonsInclude: ['ISSUER_BINDING_UNVERIFIED', 'ISSUER_BINDING_KEY_ID_MISMATCH'] },
        terms: { valid: false, reasonsInclude: ['ISSUER_BINDING_UNVERIFIED', 'ISSUER_BINDING_KEY_ID_MISMATCH'] },
        profileRequirement: 'must-reject',
        defect: { detectedByRc3: true, detectedBy: 'verifySovereignManifest / verifySignedSovereignClaim with a pinned VerificationKeyResolver' },
      },
    },
    'third-party-terms': {
      id: 'third-party-terms',
      description: 'The registrant\'s manifest, with terms for the same asset signed by a trusted principal who is not the registrant.',
      expectedSovereignAssetId: active.assetId,
      signedManifest: active.signedManifest,
      signedTerms: thirdPartyTerms,
      contentBytes: active.contentBytes,
      bundleText: bundleTextFor({ signedManifest: active.signedManifest, signedTerms: thirdPartyTerms }, active.assetId),
      expected: {
        manifest: { valid: true, reasonsInclude: [] },
        terms: { valid: true, reasonsInclude: [] },
        profileRequirement: 'must-reject',
        defect: {
          detectedByRc3: false,
          pendingGap:
            'A valid signature bound to a trusted key proves who signed, not that the signer holds authority over the asset. '
            + 'rc.3 compares a claim issuer with an expected one only when the caller passes the opt-in `issuer` option, and '
            + 'RSDK-01 does not pass it for claims; a receiver-side evaluator must require issuer = registrant.',
        },
      },
    },
    'expired-terms': {
      id: 'expired-terms',
      description: 'Registrant-signed terms whose expiresAt is before the reference time.',
      expectedSovereignAssetId: expired.assetId,
      signedManifest: expired.signedManifest,
      signedTerms: expired.signedTerms,
      contentBytes: expired.contentBytes,
      bundleText: bundleTextFor(expired, expired.assetId),
      expected: {
        manifest: { valid: true, reasonsInclude: [] },
        terms: { valid: true, reasonsInclude: [] },
        profileRequirement: 'must-reject',
        defect: {
          detectedByRc3: false,
          pendingGap: 'rc.3 never evaluates expiresAt (by design, licensing/validation.ts), nor does RSDK-01. A receiver-side evaluator must refuse expired terms.',
        },
      },
    },
  };

  const trustedIssuerKeys: readonly TrustedIssuerKey[] = Object.freeze([
    Object.freeze({ issuer: REGISTRANT, keyId: registrantKey.signingKey.keyId }),
    Object.freeze({ issuer: THIRD_PARTY, keyId: thirdPartyKey.signingKey.keyId }),
  ]);

  return {
    profile: DOCUMENT_USE_PROFILE_ID,
    synthetic: true,
    referenceTime: FV_P1_REFERENCE_TIME,
    registrant: REGISTRANT,
    receiver: RECEIVER,
    thirdParty: THIRD_PARTY,
    registrantKey: registrantKey.signingKey,
    trustedIssuerKeys,
    verificationKeyResolver: verificationKeyResolverFor(trustedIssuerKeys),
    documentMarkdown: active.markdown,
    cases,
  };
}

/**
 * Plain, serializable test vectors: canonical bundle texts, content bytes,
 * pinned public key ids and expectations. Nothing secret is included, so a
 * set exported once can be shared with another repository (e.g. Frontera)
 * and re-verified there with `verificationKeyResolverFor(trustedIssuerKeys)`.
 * This module writes no file: persisting vectors is a caller's decision.
 */
export function toPublicTestVectors(set: FileverseDocumentUseFixtureSet) {
  return {
    profile: set.profile,
    synthetic: set.synthetic,
    referenceTime: set.referenceTime,
    registrant: set.registrant,
    receiver: set.receiver,
    trustedIssuerKeys: set.trustedIssuerKeys.map(({ issuer, keyId }) => ({ issuer, keyId })),
    cases: FIXTURE_CASE_IDS.map((id) => {
      const testCase = set.cases[id];
      return {
        id,
        expectedSovereignAssetId: testCase.expectedSovereignAssetId,
        bundleText: testCase.bundleText,
        contentBase64: Buffer.from(testCase.contentBytes).toString('base64'),
        expected: testCase.expected,
      };
    }),
  };
}
