import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { canonicalizeJSON } from '@aoc/protocol/canonical';
import { verifyContentIdentity } from '@aoc/protocol/identity';
import { assessSovereigntyInteroperabilityCompatibility, tryBuildSovereigntyInteroperabilityDescriptorV1 } from '@aoc/protocol/interoperability';
import { SovereignLicenseTermsRuleEffect, validateLicenseTermsClaim } from '@aoc/protocol/licensing';
import type { LicenseTermsClaim } from '@aoc/protocol/licensing';
import { generateSovereignKeyPair, signClaim, verifySignedSovereignClaim, verifySovereignManifest } from '@aoc/protocol/manifest';
import type { SignedClaim, SignedSovereignManifest } from '@aoc/protocol/manifest';
import {
  parseSovereigntyPortabilityBundle,
  portableClaimOf,
  portableManifestOf,
  serializeSovereigntyPortabilityBundle,
  tryBuildSovereigntyPortabilityBundleV1,
} from '@aoc/protocol/portability';

import {
  DOCUMENT_USE_ACTIONS,
  DOCUMENT_USE_OBLIGATED_ACTIONS,
  DOCUMENT_USE_PROFILE_ID,
  DOCUMENT_USE_SEMANTIC_TERMS,
  FIXTURE_CASE_IDS,
  SYNTHETIC_FILEVERSE_PORTAL_ADDRESS,
  assertFileverseReference,
  buildDocumentUseConsumerSupport,
  buildFileverseExternalReference,
  generateFileverseDocumentUseFixtures,
  toPublicTestVectors,
  verificationKeyResolverFor,
} from '../../examples/fileverse-portable-asset/generate';
import type { FixtureCase } from '../../examples/fileverse-portable-asset/generate';

/**
 * FV-P1 — what published `@aoc/protocol@0.2.0-rc.3` verification establishes
 * for `soberania.document-use/1` fixtures, and what it does not.
 *
 * These tests verify; they never evaluate terms or decide anything. Each
 * block says what kind of evidence it is:
 * - SECURITY: a published API detects (or correctly accepts) the case.
 * - LIMITATION / GAP: a property rc.3 does not check, pinned so it stays
 *   visible as pending rather than being simulated here.
 * - INTEROPERABILITY: the consumer declaration a receiver needs.
 * - CONSISTENCY: the fixture agrees with itself. Not security evidence.
 */

const fixtures = generateFileverseDocumentUseFixtures();
const resolver = fixtures.verificationKeyResolver;
const REPO_ROOT = join(__dirname, '..', '..');
const VALID = fixtures.cases['valid-active'];

const verifyManifest = (testCase: FixtureCase) =>
  verifySovereignManifest(testCase.signedManifest, { contentBytes: testCase.contentBytes, verificationKeyResolver: resolver });
const verifyTerms = (signed: SignedClaim<LicenseTermsClaim>) => verifySignedSovereignClaim(signed, { verificationKeyResolver: resolver });

/** A deep, plain copy, so a mutation never reaches the shared fixture. */
const copy = <T>(value: T): T => JSON.parse(canonicalizeJSON(value)) as T;

describe('FV-P1 / SECURITY: rc.3 verification matches every case expectation', () => {
  it.each(FIXTURE_CASE_IDS)('%s: manifest verification', async (id) => {
    const testCase = fixtures.cases[id];
    const result = await verifyManifest(testCase);
    expect(result.valid).toBe(testCase.expected.manifest.valid);
    expect(result.reasons).toEqual(expect.arrayContaining([...testCase.expected.manifest.reasonsInclude]));
    if (testCase.expected.manifest.valid) expect(result.reasons).toEqual([]);
  });

  it.each(FIXTURE_CASE_IDS)('%s: signed terms verification', async (id) => {
    const testCase = fixtures.cases[id];
    const result = await verifyTerms(testCase.signedTerms);
    expect(result.valid).toBe(testCase.expected.terms.valid);
    expect(result.reasons).toEqual(expect.arrayContaining([...testCase.expected.terms.reasonsInclude]));
    if (testCase.expected.terms.valid) expect(result.reasons).toEqual([]);
  });
});

describe('FV-P1 / SECURITY: valid active asset', () => {
  it('verifies every manifest dimension, with the issuer bound to the pinned registrant key', async () => {
    const result = await verifyManifest(VALID);
    expect(result.checks).toEqual({
      manifestStructure: 'valid',
      manifestDigest: 'valid',
      signature: 'valid',
      contentDigest: 'valid',
      issuerBinding: 'verified',
    });
    expect(VALID.signedManifest.proof.keyId).toBe(fixtures.registrantKey.keyId);
  });

  it('verifies the signed terms, issued by the registrant about the expected asset', async () => {
    const result = await verifyTerms(VALID.signedTerms);
    expect(result.checks).toEqual({ claimStructure: 'valid', claimDigest: 'valid', signature: 'valid', issuerBinding: 'verified' });
    expect(VALID.signedTerms.claim.issuer).toBe(VALID.signedManifest.manifest.registrant);
    expect(VALID.signedTerms.claim.subject).toBe(VALID.expectedSovereignAssetId);
  });

  it('carries terms that pass the published licensing validation', () => {
    expect(validateLicenseTermsClaim(VALID.signedTerms.claim)).toEqual({ valid: true, reasons: [] });
  });

  it('binds the asset to the exact bytes of the synthetic document', () => {
    const { contentIdentity } = VALID.signedManifest.manifest;
    expect(contentIdentity).toBeDefined();
    expect(verifyContentIdentity(Buffer.from(fixtures.documentMarkdown, 'utf8'), contentIdentity!)).toEqual({ valid: true });
  });
});

describe('FV-P1 / SECURITY: signed terms detect mutation', () => {
  it.each([
    ['a rule statement', (claim: LicenseTermsClaim) => ({ ...claim, metadata: { ...claim.metadata, terms: { ...claim.metadata.terms, rules: claim.metadata.terms.rules.map((rule, index) => (index === 0 ? { ...rule, statement: `${rule.statement} Changed.` } : rule)) } } })],
    ['the audience', (claim: LicenseTermsClaim) => ({ ...claim, metadata: { ...claim.metadata, terms: { ...claim.metadata.terms, audience: { kind: 'Public' } } } })],
    ['expiresAt', (claim: LicenseTermsClaim) => ({ ...claim, expiresAt: '2099-01-01T00:00:00.000Z' })],
    ['a dropped rule', (claim: LicenseTermsClaim) => ({ ...claim, metadata: { ...claim.metadata, terms: { ...claim.metadata.terms, rules: claim.metadata.terms.rules.slice(0, 1) } } })],
  ])('mutating %s after signing invalidates the digest and the signature', async (_label, mutate) => {
    const mutated = { ...VALID.signedTerms, claim: mutate(copy(VALID.signedTerms.claim)) as LicenseTermsClaim };
    const result = await verifyTerms(mutated);
    expect(result.valid).toBe(false);
    expect(result.checks.claimDigest).toBe('invalid');
    expect(result.checks.signature).toBe('invalid');
  });

  it('LIMITATION: a claim signed by a recognised issuer verifies even when its terms document is malformed', async () => {
    // verifySignedSovereignClaim checks the generic AuthorityClaim shape, not
    // the terms. Even with the signer's key pinned and the binding verified,
    // only validateLicenseTermsClaim catches the empty rule list — the
    // profile makes that second check mandatory.
    const malformed = copy(VALID.signedTerms.claim) as unknown as LicenseTermsClaim & { metadata: { terms: { rules: unknown[] } } };
    malformed.metadata.terms.rules = [];
    const key = generateSovereignKeyPair();
    const recognised = verificationKeyResolverFor([{ issuer: fixtures.registrant, keyId: key.signingKey.keyId }]);
    const signed = signClaim(malformed, key.privateKeyPem, key.signingKey);
    const result = await verifySignedSovereignClaim(signed, { verificationKeyResolver: recognised });
    expect(result.valid).toBe(true);
    expect(result.checks).toEqual({ claimStructure: 'valid', claimDigest: 'valid', signature: 'valid', issuerBinding: 'verified' });
    expect(validateLicenseTermsClaim(signed.claim).valid).toBe(false);
  });
});

describe('FV-P1 / SECURITY: manifest digests detect mutation', () => {
  it('a substituted manifestDigest is reported', async () => {
    const signed: SignedSovereignManifest = { ...VALID.signedManifest, manifestDigest: '0'.repeat(64) };
    const result = await verifySovereignManifest(signed, { contentBytes: VALID.contentBytes, verificationKeyResolver: resolver });
    expect(result.valid).toBe(false);
    expect(result.checks.manifestDigest).toBe('invalid');
    expect(result.reasons).toContain('MANIFEST_DIGEST_MISMATCH');
  });

  it('a rewritten contentIdentity breaks the signature', async () => {
    const manifest = copy(VALID.signedManifest.manifest);
    const signed = { ...VALID.signedManifest, manifest: { ...manifest, contentIdentity: { algorithm: 'sha256' as const, digest: 'f'.repeat(64) } } };
    const result = await verifySovereignManifest(signed, { verificationKeyResolver: resolver });
    expect(result.valid).toBe(false);
    expect(result.checks.signature).toBe('invalid');
  });

  it('bytes that differ from the declared content identity are reported', async () => {
    const altered = Buffer.from(fixtures.documentMarkdown.replace('Fee: 0', 'Fee: 9'), 'utf8');
    const result = await verifySovereignManifest(VALID.signedManifest, { contentBytes: altered, verificationKeyResolver: resolver });
    expect(result.valid).toBe(false);
    expect(result.checks.contentDigest).toBe('invalid');
    expect(result.reasons).toContain('CONTENT_DIGEST_MISMATCH');
  });

  it('LIMITATION: without content bytes the content check is not performed, and `valid` stays true', async () => {
    const result = await verifySovereignManifest(VALID.signedManifest, { verificationKeyResolver: resolver });
    expect(result.checks.contentDigest).toBe('not_performed');
    expect(result.valid).toBe(true);
  });
});

describe('FV-P1 / SECURITY: issuer identity', () => {
  it('a key the resolver does not vouch for cannot borrow the registrant identity', async () => {
    const testCase = fixtures.cases['foreign-issuer'];
    expect(testCase.signedManifest.manifest.registrant).toBe(fixtures.registrant);
    expect(testCase.signedManifest.proof.keyId).not.toBe(fixtures.registrantKey.keyId);
    const manifest = await verifyManifest(testCase);
    expect(manifest.checks.signature).toBe('valid');
    expect(manifest.checks.issuerBinding).toBe('unverified');
  });

  it('a forged keyId naming the registrant key over a foreign public key is refused', async () => {
    // The signature covers the payload, not the keyId, so it stays valid; the
    // binding recomputes the keyId from the proof's own public key.
    const testCase = fixtures.cases['foreign-issuer'];
    const forgedManifest = { ...testCase.signedManifest, proof: { ...testCase.signedManifest.proof, keyId: fixtures.registrantKey.keyId } };
    const manifest = await verifySovereignManifest(forgedManifest, { contentBytes: testCase.contentBytes, verificationKeyResolver: resolver });
    expect(manifest.checks.signature).toBe('valid');
    expect(manifest.checks.issuerBinding).toBe('unverified');
    expect(manifest.valid).toBe(false);
    expect(manifest.reasons).toContain('ISSUER_BINDING_KEY_ID_NOT_DERIVED');

    const forgedTerms = { ...testCase.signedTerms, proof: { ...testCase.signedTerms.proof, keyId: fixtures.registrantKey.keyId } };
    const terms = await verifyTerms(forgedTerms);
    expect(terms.checks.issuerBinding).toBe('unverified');
    expect(terms.valid).toBe(false);
    expect(terms.reasons).toContain('ISSUER_BINDING_KEY_ID_NOT_DERIVED');
  });

  it('an expected issuer other than the signed registrant is refused, never substituted', async () => {
    const result = await verifySovereignManifest(VALID.signedManifest, { verificationKeyResolver: resolver, issuer: 'principal:someone-else' });
    expect(result.valid).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining(['ISSUER_BINDING_UNVERIFIED', 'ISSUER_BINDING_ISSUER_MISMATCH']));
  });

  it('LIMITATION: without a resolver the binding is not performed, and `valid` stays true even for the foreign key', async () => {
    const result = await verifySovereignManifest(fixtures.cases['foreign-issuer'].signedManifest);
    expect(result.checks.issuerBinding).toBe('not_performed');
    expect(result.valid).toBe(true);
  });
});

describe('FV-P1 / GAP: a verified signer is not an authorised issuer', () => {
  const testCase = fixtures.cases['third-party-terms'];

  it('GAP: terms for the asset signed by a trusted non-registrant verify fully', async () => {
    const manifest = await verifyManifest(testCase);
    const terms = await verifyTerms(testCase.signedTerms);
    expect(manifest.valid).toBe(true);
    expect(manifest.checks.issuerBinding).toBe('verified');
    expect(terms.valid).toBe(true);
    expect(terms.checks.issuerBinding).toBe('verified');
    expect(validateLicenseTermsClaim(testCase.signedTerms.claim).valid).toBe(true);
    // Signature valid, key trusted, subject right — and the issuer is not the registrant.
    expect(testCase.signedTerms.claim.subject).toBe(testCase.signedManifest.manifest.sovereignAssetId);
    expect(testCase.signedTerms.claim.issuer).toBe(fixtures.thirdParty);
    expect(testCase.signedTerms.claim.issuer).not.toBe(testCase.signedManifest.manifest.registrant);
  });

  it('a receiver that names the registrant as the expected claim issuer gets a refusal from rc.3', async () => {
    // The check exists only as an opt-in `issuer` option. Nothing applies it by
    // default, and RSDK-01 does not pass it for claims.
    const result = await verifySignedSovereignClaim(testCase.signedTerms, { verificationKeyResolver: resolver, issuer: fixtures.registrant });
    expect(result.valid).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining(['ISSUER_BINDING_UNVERIFIED', 'ISSUER_BINDING_ISSUER_MISMATCH']));
  });
});

describe('FV-P1 / GAP: pending checks are pinned, not simulated', () => {
  it('GAP: expired terms still verify; rc.3 does not evaluate expiresAt', async () => {
    const testCase = fixtures.cases['expired-terms'];
    const result = await verifyTerms(testCase.signedTerms);
    expect(result.valid).toBe(true);
    expect(validateLicenseTermsClaim(testCase.signedTerms.claim).valid).toBe(true);
  });

  it('GAP: artifacts for another asset verify; rc.3 verifiers take no expected subject', async () => {
    const testCase = fixtures.cases['wrong-asset'];
    expect(testCase.signedManifest.manifest.sovereignAssetId).not.toBe(testCase.expectedSovereignAssetId);
    expect((await verifyManifest(testCase)).valid).toBe(true);
    expect((await verifyTerms(testCase.signedTerms)).valid).toBe(true);
  });

  it('the bundle builder refuses artifacts about a different subject', () => {
    const testCase = fixtures.cases['wrong-asset'];
    const result = tryBuildSovereigntyPortabilityBundleV1({
      subject: { sovereignAssetId: testCase.expectedSovereignAssetId },
      manifests: [{ kind: 'signed-manifest', signedManifest: testCase.signedManifest }],
      claims: [{ kind: 'signed-claim', signedClaim: testCase.signedTerms }],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reasons).toEqual(expect.arrayContaining(['PORTABILITY_MANIFEST_SUBJECT_MISMATCH', 'PORTABILITY_CLAIM_SUBJECT_MISMATCH']));
    }
  });

  it.each([
    ['claim', 'claims', { kind: 'signed-claim', signedClaim: fixtures.cases['wrong-asset'].signedTerms }, 'PORTABILITY_CLAIM_SUBJECT_MISMATCH'],
    ['manifest', 'manifests', { kind: 'signed-manifest', signedManifest: fixtures.cases['wrong-asset'].signedManifest }, 'PORTABILITY_MANIFEST_SUBJECT_MISMATCH'],
  ] as const)('the parser refuses received bundle text mixing in a %s about another subject', (_label, field, artifact, reason) => {
    const bundle = JSON.parse(VALID.bundleText) as Record<string, unknown>;
    bundle[field] = [copy(artifact)];
    const result = parseSovereigntyPortabilityBundle(canonicalizeJSON(bundle));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reasons).toContain(reason);
  });

  it('the wrong asset content does not match the expected asset bytes', () => {
    const expected = VALID.signedManifest.manifest.contentIdentity!;
    expect(verifyContentIdentity(fixtures.cases['wrong-asset'].contentBytes, expected)).toEqual({ valid: false, reason: 'CONTENT_DIGEST_MISMATCH' });
  });
});

describe('FV-P1 / SECURITY: canonical portable export', () => {
  it.each(FIXTURE_CASE_IDS)('%s: the bundle text is canonical and round-trips byte for byte', (id) => {
    const { bundleText } = fixtures.cases[id];
    const parsed = parseSovereigntyPortabilityBundle(bundleText);
    expect(parsed.valid).toBe(true);
    if (!parsed.valid) return;
    expect(serializeSovereigntyPortabilityBundle(parsed.bundle)).toBe(bundleText);
    expect(canonicalizeJSON(JSON.parse(bundleText))).toBe(bundleText);
  });

  it('a pretty-printed bundle is not the canonical text a receiver must require', () => {
    const pretty = JSON.stringify(JSON.parse(VALID.bundleText), null, 2);
    expect(pretty).not.toBe(VALID.bundleText);
    expect(canonicalizeJSON(JSON.parse(pretty))).toBe(VALID.bundleText);
  });

  it('signed artifacts survive transport and still verify after parsing', async () => {
    const parsed = parseSovereigntyPortabilityBundle(VALID.bundleText);
    if (!parsed.valid) throw new Error('fixture bundle did not parse');
    const manifestArtifact = parsed.bundle.manifests[0];
    const claimArtifact = parsed.bundle.claims[0];
    if (manifestArtifact.kind !== 'signed-manifest' || claimArtifact.kind !== 'signed-claim') throw new Error('expected signed artifacts');
    expect(portableManifestOf(manifestArtifact).sovereignAssetId).toBe(VALID.expectedSovereignAssetId);
    expect(portableClaimOf(claimArtifact).subject).toBe(VALID.expectedSovereignAssetId);

    const manifest = await verifySovereignManifest(manifestArtifact.signedManifest, { contentBytes: VALID.contentBytes, verificationKeyResolver: resolver });
    const terms = await verifySignedSovereignClaim(claimArtifact.signedClaim, { verificationKeyResolver: resolver });
    expect(manifest.valid).toBe(true);
    expect(manifest.checks.issuerBinding).toBe('verified');
    expect(terms.valid).toBe(true);
    expect(terms.checks.issuerBinding).toBe('verified');
  });

  it('LIMITATION: transport is not verification — a bundle carrying tampered terms still parses', () => {
    const parsed = parseSovereigntyPortabilityBundle(fixtures.cases['tampered-terms'].bundleText);
    expect(parsed.valid).toBe(true);
  });
});

describe('FV-P1 / INTEROPERABILITY: the consumer declaration document-use/1 requires', () => {
  const assess = (bundleText: string, support = buildDocumentUseConsumerSupport()) => {
    const parsed = parseSovereigntyPortabilityBundle(bundleText);
    if (!parsed.valid) throw new Error('fixture bundle did not parse');
    const described = tryBuildSovereigntyInteroperabilityDescriptorV1(parsed.bundle);
    if (!described.valid) throw new Error('fixture bundle has no descriptor');
    return assessSovereigntyInteroperabilityCompatibility(described.descriptor, support);
  };

  it.each(FIXTURE_CASE_IDS)('%s: compatible with the documented consumer support', (id) => {
    expect(assess(fixtures.cases[id].bundleText).status).toBe('compatible');
  });

  it.each(DOCUMENT_USE_SEMANTIC_TERMS.map((term) => [term.termRef]))('omitting %s leaves the bundle only partially compatible', (termRef) => {
    const support = buildDocumentUseConsumerSupport();
    const narrowed = { ...support, semanticTerms: support.semanticTerms.filter((term) => term.termRef !== termRef) };
    const report = assess(VALID.bundleText, narrowed);
    expect(report.status).toBe('partially-compatible');
    expect(report.unsupportedSemanticTerms.map((term) => term.termRef)).toEqual([termRef]);
  });

  it('declaring Origin instead of Authorship is not compatible', () => {
    const support = { ...buildDocumentUseConsumerSupport(), claimTypes: ['Origin' as const] };
    const report = assess(VALID.bundleText, support);
    expect(report.status).not.toBe('compatible');
    expect(report.unsupportedClaimTypes).toEqual(['Authorship']);
  });
});

describe('FV-P1 / SECURITY: references are synthetic and carry no secrets', () => {
  it('every fixture names exactly a synthetic Fileverse-shaped origin, with no locator', () => {
    for (const id of FIXTURE_CASE_IDS) {
      const { externalReference } = fixtures.cases[id].signedManifest.manifest;
      expect(Object.keys(externalReference ?? {}).sort()).toEqual(['id', 'namespace']);
      expect(externalReference?.namespace).toBe('fileverse');
      expect(externalReference?.id.startsWith(`gnosis:${SYNTHETIC_FILEVERSE_PORTAL_ADDRESS}/`)).toBe(true);
      expect(() => assertFileverseReference(externalReference)).not.toThrow();
    }
    expect(fixtures.synthetic).toBe(true);
  });

  it('no serialized artifact contains a share-link key or private key material', () => {
    for (const id of FIXTURE_CASE_IDS) {
      const text = fixtures.cases[id].bundleText;
      // Base64 PEM padding can end in `…key=` by chance, so only URL-style key parameters are matched.
      expect(text).not.toMatch(/#|%23|[?&]key=/i);
      expect(text).not.toContain('PRIVATE KEY');
    }
    const publicSurface = canonicalizeJSON({ registrantKey: fixtures.registrantKey, trustedIssuerKeys: fixtures.trustedIssuerKeys });
    expect(publicSurface).not.toContain('PRIVATE KEY');
  });

  const portal = SYNTHETIC_FILEVERSE_PORTAL_ADDRESS;
  it.each([
    ['a #key= fragment in the id', { namespace: 'fileverse', id: `gnosis:${portal}/1#key=abc` }],
    ['a percent-encoded fragment key (%23key%3D)', { namespace: 'fileverse', id: `gnosis:${portal}/1%23key%3Dabc` }],
    ['a percent-encoded query key (%3Fkey%3D)', { namespace: 'fileverse', id: `gnosis:${portal}/1%3Fkey%3Dabc` }],
    ['a query string', { namespace: 'fileverse', id: `gnosis:${portal}/1?key=abc` }],
    ['an unexpected parameter', { namespace: 'fileverse', id: `gnosis:${portal}/1&k=abc` }],
    ['trailing whitespace', { namespace: 'fileverse', id: `gnosis:${portal}/1 ` }],
    ['an uppercase portal address', { namespace: 'fileverse', id: `gnosis:${portal.toUpperCase().replace('0X', '0x')}/1` }],
    ['a leading-zero file id', { namespace: 'fileverse', id: `gnosis:${portal}/01` }],
    ['another chain', { namespace: 'fileverse', id: `ethereum:${portal}/1` }],
    ['another namespace', { namespace: 'fileverse-x', id: `gnosis:${portal}/1` }],
    ['any locator, even a clean one', { namespace: 'fileverse', id: `gnosis:${portal}/1`, locator: `https://docs.fileverse.io/${portal}/1` }],
    ['a locator carrying a share-link key', { namespace: 'fileverse', id: `gnosis:${portal}/1`, locator: `https://docs.fileverse.io/${portal}/1#key=abc` }],
    ['an extra field', { namespace: 'fileverse', id: `gnosis:${portal}/1`, key: 'abc' }],
    ['a non-object', `gnosis:${portal}/1`],
    ['null', null],
  ])('a reference with %s is refused', (_label, reference) => {
    expect(() => assertFileverseReference(reference)).toThrow();
  });

  it('the canonical form is admitted', () => {
    expect(() => assertFileverseReference({ namespace: 'fileverse', id: `gnosis:${portal}/1` })).not.toThrow();
  });

  it.each([
    ['a malformed portal address', { chain: 'gnosis' as const, portalAddress: '0x123', fileId: '1' }],
    ['an uppercase portal address', { chain: 'gnosis' as const, portalAddress: portal.toUpperCase().replace('0X', '0x'), fileId: '1' }],
    ['a fragment in the file id', { chain: 'gnosis' as const, portalAddress: portal, fileId: '1#key=abc' }],
    ['a percent-encoded fragment in the file id', { chain: 'gnosis' as const, portalAddress: portal, fileId: '1%23key%3Dabc' }],
  ])('building a reference from %s throws', (_label, location) => {
    expect(() => buildFileverseExternalReference(location)).toThrow();
  });
});

describe('FV-P1 / SECURITY: public test vectors re-verify without any private material', () => {
  const vectors = toPublicTestVectors(fixtures);
  const serialized = canonicalizeJSON(vectors);

  it('the vectors are plain canonical data with no private key', () => {
    expect(JSON.parse(serialized)).toEqual(vectors);
    expect(serialized).not.toContain('PRIVATE KEY');
    expect(serialized).not.toContain('privateKey');
  });

  it.each(FIXTURE_CASE_IDS)('%s: re-verified from the serialized vectors alone, the expectation holds', async (id) => {
    const shipped = JSON.parse(serialized) as typeof vectors;
    const vector = shipped.cases.find((entry) => entry.id === id)!;
    const pinned = verificationKeyResolverFor(shipped.trustedIssuerKeys);
    const parsed = parseSovereigntyPortabilityBundle(vector.bundleText);
    if (!parsed.valid) throw new Error('vector bundle did not parse');
    const [manifestArtifact] = parsed.bundle.manifests;
    const [claimArtifact] = parsed.bundle.claims;
    if (manifestArtifact.kind !== 'signed-manifest' || claimArtifact.kind !== 'signed-claim') throw new Error('expected signed artifacts');
    const contentBytes = new Uint8Array(Buffer.from(vector.contentBase64, 'base64'));
    const manifest = await verifySovereignManifest(manifestArtifact.signedManifest, { contentBytes, verificationKeyResolver: pinned });
    const terms = await verifySignedSovereignClaim(claimArtifact.signedClaim, { verificationKeyResolver: pinned });
    expect(manifest.valid).toBe(vector.expected.manifest.valid);
    expect(terms.valid).toBe(vector.expected.terms.valid);
  });
});

describe('FV-P1 / CONSISTENCY: the fixture agrees with itself (not security evidence)', () => {
  it('defines exactly the six cases', () => {
    expect(Object.keys(fixtures.cases).sort()).toEqual([...FIXTURE_CASE_IDS].sort());
    expect(FIXTURE_CASE_IDS).toHaveLength(6);
  });

  it('every defective case states whether rc.3 detects it, and names the gap when it does not', () => {
    for (const id of FIXTURE_CASE_IDS) {
      const { expected } = fixtures.cases[id];
      if (expected.profileRequirement === 'eligible-for-evaluation') {
        expect(expected.defect).toBeUndefined();
        continue;
      }
      expect(expected.defect).toBeDefined();
      if (expected.defect?.detectedByRc3) expect(expected.defect.detectedBy).toEqual(expect.any(String));
      else expect(expected.defect?.pendingGap).toEqual(expect.any(String));
    }
  });

  it('the tampered fixture flips only the export rule', () => {
    const effects = (signed: SignedClaim<LicenseTermsClaim>) => signed.claim.metadata.terms.rules.map((rule) => [rule.id, rule.effect]);
    const original = effects(VALID.signedTerms);
    const tampered = effects(fixtures.cases['tampered-terms'].signedTerms);
    expect(tampered).toEqual(original.map(([id, effect]) => [id, id === 'rule-export' ? SovereignLicenseTermsRuleEffect.Permission : effect]));
  });

  it('declares the profile rules in order: access, export restricted, modify, obligated approval', () => {
    const rules = VALID.signedTerms.claim.metadata.terms.rules.map((rule) => [rule.effect, rule.action.termRef]);
    expect(rules).toEqual([
      [SovereignLicenseTermsRuleEffect.Permission, DOCUMENT_USE_ACTIONS.access.termRef],
      [SovereignLicenseTermsRuleEffect.Restriction, DOCUMENT_USE_ACTIONS.export.termRef],
      [SovereignLicenseTermsRuleEffect.Permission, DOCUMENT_USE_ACTIONS.modifyProtectedTerms.termRef],
      [SovereignLicenseTermsRuleEffect.Obligation, DOCUMENT_USE_OBLIGATED_ACTIONS.ownerApprovalForModifyProtectedTerms.termRef],
    ]);
  });

  it('the expired case really is expired at the fixed reference time', () => {
    expect(Date.parse(fixtures.cases['expired-terms'].signedTerms.claim.expiresAt!)).toBeLessThan(Date.parse(fixtures.referenceTime));
    expect(Date.parse(VALID.signedTerms.claim.expiresAt!)).toBeGreaterThan(Date.parse(fixtures.referenceTime));
  });

  it('the profile id is not carried in any signed field', () => {
    // Profile identification is out of band in v1 (profile §6).
    for (const id of FIXTURE_CASE_IDS) expect(fixtures.cases[id].bundleText).not.toContain(DOCUMENT_USE_PROFILE_ID);
  });
});

describe('FV-P1 / CONSISTENCY: rc.3 public API surface', () => {
  const PROTOCOL_PACKAGE = JSON.parse(readFileSync(join(REPO_ROOT, 'packages/protocol/package.json'), 'utf8')) as { version: string; exports: Record<string, unknown> };
  const importedSpecifiers = (path: string) =>
    [...readFileSync(join(REPO_ROOT, path), 'utf8').matchAll(/from '(@aoc\/[^']+)'/g)].map((match) => match[1]);

  it('targets @aoc/protocol 0.2.0-rc.3', () => {
    expect(PROTOCOL_PACKAGE.version).toBe('0.2.0-rc.3');
  });

  it.each(['examples/fileverse-portable-asset/generate.ts', 'tests/contracts/fv-document-use-fixture.test.ts'])(
    '%s imports Protocol only through published export keys',
    (path) => {
      const specifiers = importedSpecifiers(path);
      expect(specifiers.length).toBeGreaterThan(0);
      for (const specifier of specifiers) {
        expect(specifier.startsWith('@aoc/protocol')).toBe(true);
        expect(Object.keys(PROTOCOL_PACKAGE.exports)).toContain(`.${specifier.slice('@aoc/protocol'.length)}`);
      }
    },
  );

  it('names the profile it implements', () => {
    expect(fixtures.profile).toBe(DOCUMENT_USE_PROFILE_ID);
    expect(DOCUMENT_USE_PROFILE_ID).toBe('soberania.document-use/1');
  });
});
