import { ClaimType, StandingStatus } from '@aoc/protocol/claims';
import type { VerificationKeyDescriptor, VerificationKeyResolver } from '@aoc/protocol/adapters';
import { canonicalizeJSON } from '@aoc/protocol/canonical';
import {
  buildSovereignExternalReference,
  computeContentIdentity,
  mintSovereignAssetId,
  parseSovereignAssetId,
} from '@aoc/protocol/identity';
import type { SovereignAssetId, SovereignSubjectRef } from '@aoc/protocol/identity';
import {
  AuthorityClaimKind,
  DerivationRelationKind,
  buildAuthorityClaim,
  buildDerivationClaim,
  buildOriginClaim,
  buildSovereignManifestV1,
  generateSovereignKeyPair,
  signClaim,
  signSovereignManifest,
  signSovereignPayload,
} from '@aoc/protocol/manifest';
import type {
  SignedClaim,
  SignedSovereignManifest,
  SovereignKeyPair,
  SovereignManifestV1,
  VerifiableSovereignClaim,
} from '@aoc/protocol/manifest';
import {
  VERIFIABILITY_SOVEREIGNTY_CAPABILITY_OPERATIONS,
  VERIFIABILITY_SOVEREIGNTY_CAPABILITY_REASON_CODES,
  SOVEREIGNTY_CAPABILITY_IDS,
  buildSovereigntyCapabilityInvocation,
  createVerifiabilitySovereigntyCapabilityImplementation,
  getSovereigntyCapabilityRefByKey,
  invokeSovereigntyCapability,
  isValidSovereigntyCapabilityInvocationEvidence,
  isValidVerifiabilitySovereigntyCapabilityInput,
  validateVerifiabilitySovereigntyCapabilityInput,
} from '@aoc/protocol/sovereignty-capabilities';
import type {
  SovereigntyCapabilityRef,
  SovereigntyCapabilityResult,
  VerifiabilitySovereigntyCapabilityInput,
  VerifiabilitySovereigntyCapabilityOutput,
} from '@aoc/protocol/sovereignty-capabilities';

/**
 * SM-08 — the production AOC.VERIFIABILITY capsule.
 *
 * Every key pair generated in this file is **TEST ONLY** fixture material,
 * created so there is something signed to verify. No private key is committed,
 * logged, exported or handed to the capsule: the production capsule verifies
 * and never signs, and the signing below uses the pre-existing public
 * low-level primitives directly, exactly as a real issuer with its own key
 * management would.
 */

const CODES = VERIFIABILITY_SOVEREIGNTY_CAPABILITY_REASON_CODES;
const VERIFIABILITY_REF = getSovereigntyCapabilityRefByKey('verifiability') as SovereigntyCapabilityRef;
const ISSUER = 'principal:sm08-issuer';
const AT = '2026-04-01T09:00:00.000Z';
const SIGNED_AT = new Date(AT);

/** TEST ONLY signing material. Never production key management. */
const testKeyPair = (): SovereignKeyPair => generateSovereignKeyPair();

const KEY_PAIR = testKeyPair();
const OTHER_KEY_PAIR = testKeyPair();

const verifiability = createVerifiabilitySovereigntyCapabilityImplementation();

const boundResolver = (keyId: string, calls?: string[]): VerificationKeyResolver => ({
  resolveVerificationKey(issuer): VerificationKeyDescriptor {
    calls?.push(issuer);
    return { keyId, issuer };
  },
});

const emptyResolver = (calls?: string[]): VerificationKeyResolver => ({
  resolveVerificationKey(issuer): undefined {
    calls?.push(issuer);
    return undefined;
  },
});

const throwingResolver = (calls?: string[]): VerificationKeyResolver => ({
  resolveVerificationKey(issuer): never {
    calls?.push(issuer);
    throw new Error(`super-secret-kms-token=abc123 could not reach vault for ${issuer}`);
  },
});

const run = async (
  input: VerifiabilitySovereigntyCapabilityInput,
  options: {
    subject?: SovereignSubjectRef;
    correlationId?: string;
    resolver?: VerificationKeyResolver;
  } = {},
): Promise<SovereigntyCapabilityResult<VerifiabilitySovereigntyCapabilityOutput>> =>
  invokeSovereigntyCapability(
    buildSovereigntyCapabilityInvocation({
      capability: VERIFIABILITY_REF,
      input,
      ...(options.subject === undefined ? {} : { subject: options.subject }),
      ...(options.correlationId === undefined ? {} : { correlationId: options.correlationId }),
    }),
    options.resolver === undefined
      ? verifiability
      : createVerifiabilitySovereigntyCapabilityImplementation({ verificationKeyResolver: options.resolver }),
  );

const externalReference = buildSovereignExternalReference({
  namespace: 'alien-system-v47',
  id: 'alien-resource-92817',
  locator: 'future://provider-p1/object/92817',
});

const buildManifest = (id: SovereignAssetId): SovereignManifestV1 =>
  buildSovereignManifestV1({
    sovereignAssetId: id,
    externalReference,
    contentIdentity: computeContentIdentity(new TextEncoder().encode('hello sovereign world')),
    registrant: ISSUER,
    createdAt: AT,
  });

const signedManifestFixture = (
  keyPair: SovereignKeyPair = KEY_PAIR,
): { signed: SignedSovereignManifest; id: SovereignAssetId; subject: SovereignSubjectRef } => {
  const id = parseSovereignAssetId(mintSovereignAssetId());
  const manifest = buildManifest(id);
  return {
    signed: signSovereignManifest(manifest, keyPair.privateKeyPem, keyPair.signingKey, SIGNED_AT),
    id,
    subject: { sovereignAssetId: id, externalReference },
  };
};

const signedClaimFixture = <TClaim extends VerifiableSovereignClaim>(
  claim: TClaim,
  keyPair: SovereignKeyPair = KEY_PAIR,
): SignedClaim<TClaim> => signClaim(claim, keyPair.privateKeyPem, keyPair.signingKey, SIGNED_AT);

const derivationClaim = (subject: SovereignAssetId) =>
  buildDerivationClaim({
    id: 'claim:sm08-derivation',
    sovereignAssetId: subject,
    issuer: ISSUER,
    sourceSovereignAssetIds: [parseSovereignAssetId(mintSovereignAssetId())],
    relation: DerivationRelationKind.TransformedFrom,
    statement: 'asserted, never established',
    issuedAt: AT,
  });

const originClaim = (subject: SovereignAssetId) =>
  buildOriginClaim({
    id: 'claim:sm08-origin',
    sovereignAssetId: subject,
    issuer: ISSUER,
    assertedOrigin: 'captured on a device nobody can now inspect',
    assertedAt: AT,
  });

const authorityClaim = (subject: SovereignAssetId) =>
  buildAuthorityClaim({
    id: 'claim:sm08-authority',
    sovereignAssetId: subject,
    issuer: ISSUER,
    kind: AuthorityClaimKind.Authorship,
    statement: 'asserted authorship, not legal ownership',
    issuedAt: AT,
  });

const manifestVerification = (result: SovereigntyCapabilityResult<VerifiabilitySovereigntyCapabilityOutput>) => {
  if (result.status !== 'succeeded') throw new Error(`expected success, got ${result.reasonCodes.join(', ')}`);
  if (result.output.operation !== 'verify-signed-manifest') throw new Error('wrong operation');
  return result.output.verification;
};

const claimVerification = (result: SovereigntyCapabilityResult<VerifiabilitySovereigntyCapabilityOutput>) => {
  if (result.status !== 'succeeded') throw new Error(`expected success, got ${result.reasonCodes.join(', ')}`);
  if (result.output.operation !== 'verify-signed-claim') throw new Error('wrong operation');
  return result.output.verification;
};

const proofVerification = (result: SovereigntyCapabilityResult<VerifiabilitySovereigntyCapabilityOutput>) => {
  if (result.status !== 'succeeded') throw new Error(`expected success, got ${result.reasonCodes.join(', ')}`);
  if (result.output.operation !== 'verify-sovereign-proof') throw new Error('wrong operation');
  return result.output.verification;
};

describe('SM-08 / AOC.VERIFIABILITY signed manifest verification (MANIFEST TESTS 1-24)', () => {
  it('MANIFEST TEST 1 — the capsule advertises the canonical AOC.VERIFIABILITY ref and version', async () => {
    expect(verifiability.capability.id).toBe(SOVEREIGNTY_CAPABILITY_IDS.verifiability);
    expect(verifiability.capability.id).toBe('aoc:sovereignty-capability:verifiability');
    expect(verifiability.capability.version).toBe('1.0.0');
    expect(verifiability.capability).toEqual(VERIFIABILITY_REF);

    const { signed } = signedManifestFixture();
    const result = await run({ operation: 'verify-signed-manifest', signedManifest: signed });
    expect(result.capability).toEqual(VERIFIABILITY_REF);
    expect(result.evidence.capability).toEqual(VERIFIABILITY_REF);
  });

  it('MANIFEST TEST 2 — a valid signed manifest verifies', async () => {
    const { signed } = signedManifestFixture();
    const verification = manifestVerification(await run({ operation: 'verify-signed-manifest', signedManifest: signed }));
    expect(verification.valid).toBe(true);
    expect(verification.reasons).toEqual([]);
  });

  it('MANIFEST TEST 3 — verification works with NO invocation subject', async () => {
    const { signed } = signedManifestFixture();
    const result = await run({ operation: 'verify-signed-manifest', signedManifest: signed });
    expect(result.status).toBe('succeeded');
    expect(manifestVerification(result).valid).toBe(true);
  });

  it('MANIFEST TEST 4 — the result subject is the artifact subject, not a minted one', async () => {
    const { signed, subject } = signedManifestFixture();
    const result = await run({ operation: 'verify-signed-manifest', signedManifest: signed });
    expect(result.subject).toEqual(subject);
    expect(result.subject?.sovereignAssetId).toBe(signed.manifest.sovereignAssetId);
  });

  it('MANIFEST TEST 5 — the evidence subject is the artifact subject', async () => {
    const { signed, subject } = signedManifestFixture();
    const result = await run({ operation: 'verify-signed-manifest', signedManifest: signed });
    expect(result.evidence.subject).toEqual(subject);
  });

  it('MANIFEST TEST 6 — an explicitly matching subject succeeds', async () => {
    const { signed, subject } = signedManifestFixture();
    const result = await run({ operation: 'verify-signed-manifest', signedManifest: signed }, { subject });
    expect(result.status).toBe('succeeded');
    expect(manifestVerification(result).valid).toBe(true);
  });

  it('MANIFEST TEST 7 — an explicitly mismatching subject fails the execution', async () => {
    const { signed } = signedManifestFixture();
    const other: SovereignSubjectRef = { sovereignAssetId: parseSovereignAssetId(mintSovereignAssetId()) };
    const result = await run({ operation: 'verify-signed-manifest', signedManifest: signed }, { subject: other });
    expect(result.status).toBe('failed');
    if (result.status !== 'failed') throw new Error('unreachable');
    expect(result.reasonCodes).toEqual([CODES.subjectMismatch]);
    expect(result.evidence.outcome).toBe('failed');
  });

  it('MANIFEST TEST 7b — a subject naming the same id under a different external reference also mismatches', async () => {
    const { signed, id } = signedManifestFixture();
    const result = await run(
      { operation: 'verify-signed-manifest', signedManifest: signed },
      {
        subject: {
          sovereignAssetId: id,
          externalReference: buildSovereignExternalReference({ namespace: 'other-system', id: 'x', locator: 'x://y' }),
        },
      },
    );
    expect(result.status).toBe('failed');
  });

  it('MANIFEST TESTS 8-10 — structure, digest and signature checks are individually exposed', async () => {
    const { signed } = signedManifestFixture();
    const { checks } = manifestVerification(await run({ operation: 'verify-signed-manifest', signedManifest: signed }));
    expect(checks.manifestStructure).toBe('valid');
    expect(checks.manifestDigest).toBe('valid');
    expect(checks.signature).toBe('valid');
  });

  it('MANIFEST TEST 11 — contentDigest is honestly not_performed, never valid', async () => {
    const { signed } = signedManifestFixture();
    // The manifest genuinely carries a ContentIdentity, so this is not a
    // "nothing to check" case: the capsule deliberately declines to check it.
    expect(signed.manifest.contentIdentity).toBeDefined();
    const { checks } = manifestVerification(await run({ operation: 'verify-signed-manifest', signedManifest: signed }));
    expect(checks.contentDigest).toBe('not_performed');
    expect(checks.contentDigest).not.toBe('valid');
  });

  it('MANIFEST TEST 12 — the operation contract accepts no raw content bytes in any spelling', () => {
    const { signed } = signedManifestFixture();
    const bytes = new TextEncoder().encode('hello sovereign world');
    const smuggled = {
      operation: 'verify-signed-manifest',
      signedManifest: signed,
      contentBytes: bytes,
      bytes,
      content: bytes,
    } as unknown as VerifiabilitySovereigntyCapabilityInput;
    // An unknown extra key is not a *malformed* invocation, but nothing reads
    // it: the check below proves the content check still did not happen.
    expect(isValidVerifiabilitySovereigntyCapabilityInput(smuggled)).toBe(true);
    return run(smuggled).then((result) => {
      expect(manifestVerification(result).checks.contentDigest).toBe('not_performed');
    });
  });

  it('MANIFEST TEST 13 — with no resolver, issuerBinding is not_performed and overall validity is unaffected', async () => {
    const { signed } = signedManifestFixture();
    const verification = manifestVerification(await run({ operation: 'verify-signed-manifest', signedManifest: signed }));
    expect(verification.checks.issuerBinding).toBe('not_performed');
    expect(verification.checks.issuerBinding).not.toBe('verified');
    expect(verification.checks.issuerBinding).not.toBe('unverified');
    expect(verification.valid).toBe(true);
  });

  it('MANIFEST TEST 14 — a matching resolver reports issuerBinding verified', async () => {
    const { signed } = signedManifestFixture();
    const calls: string[] = [];
    const verification = manifestVerification(
      await run(
        { operation: 'verify-signed-manifest', signedManifest: signed },
        { resolver: boundResolver(KEY_PAIR.signingKey.keyId, calls) },
      ),
    );
    expect(verification.checks.issuerBinding).toBe('verified');
    expect(verification.valid).toBe(true);
    expect(calls).toEqual([ISSUER]);
  });

  it('MANIFEST TEST 15 — a wrong resolver key makes the binding unverified and the verification invalid', async () => {
    const { signed } = signedManifestFixture();
    const result = await run(
      { operation: 'verify-signed-manifest', signedManifest: signed },
      { resolver: boundResolver(OTHER_KEY_PAIR.signingKey.keyId) },
    );
    const verification = manifestVerification(result);
    expect(verification.checks.signature).toBe('valid');
    expect(verification.checks.issuerBinding).toBe('unverified');
    expect(verification.valid).toBe(false);
    expect(verification.reasons).toContain('ISSUER_BINDING_UNVERIFIED');
    // Still a successful *execution*: the question was answered.
    expect(result.status).toBe('succeeded');
    expect(result.evidence.outcome).toBe('succeeded');
  });

  it('MANIFEST TEST 16 — a tampered manifest invalidates the digest and the signature', async () => {
    const { signed } = signedManifestFixture();
    const tampered: SignedSovereignManifest = {
      ...signed,
      manifest: {
        ...signed.manifest,
        externalReference: buildSovereignExternalReference({
          namespace: 'alien-system-v47',
          id: 'alien-resource-92817',
          locator: 'future://attacker/object/92817',
        }),
      },
    };
    const result = await run({ operation: 'verify-signed-manifest', signedManifest: tampered });
    const verification = manifestVerification(result);
    expect(verification.valid).toBe(false);
    expect(verification.checks.manifestDigest).toBe('invalid');
    expect(verification.checks.signature).toBe('invalid');
    expect(verification.reasons).toContain('MANIFEST_DIGEST_MISMATCH');
    expect(verification.reasons).toContain('SIGNATURE_INVALID');
    expect(result.status).toBe('succeeded');
  });

  it('MANIFEST TEST 16b — a tampered registrant is detected the same way', async () => {
    const { signed } = signedManifestFixture();
    const tampered: SignedSovereignManifest = {
      ...signed,
      manifest: { ...signed.manifest, registrant: 'principal:someone-else-entirely' },
    };
    const verification = manifestVerification(await run({ operation: 'verify-signed-manifest', signedManifest: tampered }));
    expect(verification.valid).toBe(false);
    expect(verification.checks.manifestDigest).toBe('invalid');
    expect(verification.checks.signature).toBe('invalid');
  });

  it('MANIFEST TEST 17 — a tampered declared manifestDigest is detected', async () => {
    const { signed } = signedManifestFixture();
    const tampered: SignedSovereignManifest = { ...signed, manifestDigest: 'f'.repeat(64) };
    const verification = manifestVerification(await run({ operation: 'verify-signed-manifest', signedManifest: tampered }));
    expect(verification.valid).toBe(false);
    expect(verification.checks.manifestDigest).toBe('invalid');
    // The proof still signs the manifest payload, so the signature itself holds.
    expect(verification.checks.signature).toBe('valid');
    expect(verification.reasons).toContain('MANIFEST_DIGEST_MISMATCH');
    expect(verification.reasons).toContain('PROOF_PAYLOAD_HASH_MISMATCH');
  });

  it('MANIFEST TEST 18 — a tampered signature is detected while the digest stays valid', async () => {
    const { signed } = signedManifestFixture();
    const flipped = Buffer.from(signed.proof.signature, 'base64url');
    flipped[0] ^= 0xff;
    const tampered: SignedSovereignManifest = {
      ...signed,
      proof: { ...signed.proof, signature: flipped.toString('base64url') },
    };
    const verification = manifestVerification(await run({ operation: 'verify-signed-manifest', signedManifest: tampered }));
    expect(verification.checks.manifestDigest).toBe('valid');
    expect(verification.checks.signature).toBe('invalid');
    expect(verification.valid).toBe(false);
  });

  it('MANIFEST TEST 19 — an unsupported proof algorithm is invalid, not a crash', async () => {
    const { signed } = signedManifestFixture();
    const tampered = {
      ...signed,
      proof: { ...signed.proof, algorithm: 'secp256k1' },
    } as unknown as SignedSovereignManifest;
    const result = await run({ operation: 'verify-signed-manifest', signedManifest: tampered });
    expect(result.status).toBe('succeeded');
    expect(manifestVerification(result).checks.signature).toBe('invalid');
  });

  it('MANIFEST TEST 20 — an unsupported canonicalization profile is invalid, not a crash', async () => {
    const { signed } = signedManifestFixture();
    const tampered = {
      ...signed,
      proof: { ...signed.proof, canonicalizationProfile: 'some-other-canonical-json/9' },
    } as unknown as SignedSovereignManifest;
    const result = await run({ operation: 'verify-signed-manifest', signedManifest: tampered });
    expect(result.status).toBe('succeeded');
    expect(manifestVerification(result).checks.signature).toBe('invalid');
  });

  it('MANIFEST TEST 21 — malformed key/signature material fails closed', async () => {
    const { signed } = signedManifestFixture();
    for (const proof of [
      { ...signed.proof, signature: '!!!not-base64url!!!' },
      { ...signed.proof, publicKey: 'NOT A PEM' },
      { ...signed.proof, publicKey: '' },
    ]) {
      const result = await run({
        operation: 'verify-signed-manifest',
        signedManifest: { ...signed, proof } as unknown as SignedSovereignManifest,
      });
      expect(result.status).toBe('succeeded');
      expect(manifestVerification(result).checks.signature).toBe('invalid');
    }
  });

  it('MANIFEST TEST 21b — a manifest that cannot be canonicalized fails closed rather than throwing', async () => {
    const { signed, subject } = signedManifestFixture();
    const uncanonicalizable = {
      ...signed,
      manifest: { ...signed.manifest, manifestVersion: Number.NaN },
    } as unknown as SignedSovereignManifest;
    const result = await run({ operation: 'verify-signed-manifest', signedManifest: uncanonicalizable });
    expect(result.status).toBe('succeeded');
    const verification = manifestVerification(result);
    expect(verification.valid).toBe(false);
    expect(verification.checks.manifestDigest).toBe('invalid');
    expect(verification.checks.signature).toBe('invalid');
    expect(verification.reasons).toEqual([CODES.payloadNotCanonicalizable]);
    // Attribution survives.
    expect(result.subject).toEqual(subject);
    for (const reason of verification.reasons) {
      expect(reason).not.toMatch(/Error|at Object|node:internal|\.ts:/);
    }
  });

  it('MANIFEST TEST 22 — a negative verification is still a succeeded execution with succeeded evidence', async () => {
    const { signed } = signedManifestFixture();
    const tampered: SignedSovereignManifest = { ...signed, manifestDigest: '0'.repeat(64) };
    const result = await run({ operation: 'verify-signed-manifest', signedManifest: tampered });
    expect(result.status).toBe('succeeded');
    expect(result.evidence.outcome).toBe('succeeded');
    expect(result.evidence.reasonCodes).toBeUndefined();
    expect(manifestVerification(result).valid).toBe(false);
  });

  it('MANIFEST TEST 23 — nothing is mutated, repaired or re-signed', async () => {
    const { signed } = signedManifestFixture();
    const before = canonicalizeJSON(signed);
    await run({ operation: 'verify-signed-manifest', signedManifest: signed });
    expect(canonicalizeJSON(signed)).toBe(before);

    const tampered: SignedSovereignManifest = { ...signed, manifestDigest: '0'.repeat(64) };
    const tamperedBefore = canonicalizeJSON(tampered);
    await run({ operation: 'verify-signed-manifest', signedManifest: tampered });
    // A broken proof stays broken: no repair, no renormalization, no resign.
    expect(canonicalizeJSON(tampered)).toBe(tamperedBefore);
    expect(tampered.manifestDigest).toBe('0'.repeat(64));
  });

  it('MANIFEST TEST 24 — no hidden content-integrity execution: corrupting the bytes changes nothing', async () => {
    // A manifest whose ContentIdentity commits to bytes that were never
    // supplied still verifies, because Verifiability never looked for them.
    const id = parseSovereignAssetId(mintSovereignAssetId());
    const manifest = buildSovereignManifestV1({
      sovereignAssetId: id,
      registrant: ISSUER,
      contentIdentity: computeContentIdentity(new TextEncoder().encode('the original bytes')),
      createdAt: AT,
    });
    const signed = signSovereignManifest(manifest, KEY_PAIR.privateKeyPem, KEY_PAIR.signingKey, SIGNED_AT);
    const verification = manifestVerification(await run({ operation: 'verify-signed-manifest', signedManifest: signed }));
    expect(verification.valid).toBe(true);
    expect(verification.checks.contentDigest).toBe('not_performed');
    expect(verification.reasons).not.toContain('CONTENT_DIGEST_MISMATCH');
  });
});

describe('SM-08 / AOC.VERIFIABILITY signed claim verification (CLAIM TESTS 1-24)', () => {
  const subjectId = (): SovereignAssetId => parseSovereignAssetId(mintSovereignAssetId());

  it('CLAIM TEST 1 — a valid signed OriginClaim verifies', async () => {
    const id = subjectId();
    const signedClaim = signedClaimFixture(originClaim(id));
    const verification = claimVerification(await run({ operation: 'verify-signed-claim', signedClaim }));
    expect(verification.valid).toBe(true);
    expect(verification.reasons).toEqual([]);
  });

  it('CLAIM TEST 2 — a valid signed Authorship/AuthorityClaim verifies', async () => {
    const signedClaim = signedClaimFixture(authorityClaim(subjectId()));
    expect(claimVerification(await run({ operation: 'verify-signed-claim', signedClaim })).valid).toBe(true);
  });

  it('CLAIM TEST 3 — a valid signed DerivationClaim verifies', async () => {
    const signedClaim = signedClaimFixture(derivationClaim(subjectId()));
    expect(claimVerification(await run({ operation: 'verify-signed-claim', signedClaim })).valid).toBe(true);
  });

  it('CLAIM TESTS 4-6 — structure, digest and signature checks are individually exposed', async () => {
    const signedClaim = signedClaimFixture(derivationClaim(subjectId()));
    const { checks } = claimVerification(await run({ operation: 'verify-signed-claim', signedClaim }));
    expect(checks.claimStructure).toBe('valid');
    expect(checks.claimDigest).toBe('valid');
    expect(checks.signature).toBe('valid');
    // claimStructure is always attempted — the claim is the target.
    expect(checks.claimStructure).not.toBe('not_performed');
  });

  it('CLAIM TEST 7 — with no resolver, the binding is not_performed', async () => {
    const signedClaim = signedClaimFixture(originClaim(subjectId()));
    const { checks } = claimVerification(await run({ operation: 'verify-signed-claim', signedClaim }));
    expect(checks.issuerBinding).toBe('not_performed');
  });

  it('CLAIM TEST 8 — a matching resolver reports the binding verified', async () => {
    const signedClaim = signedClaimFixture(originClaim(subjectId()));
    const calls: string[] = [];
    const verification = claimVerification(
      await run({ operation: 'verify-signed-claim', signedClaim }, { resolver: boundResolver(KEY_PAIR.signingKey.keyId, calls) }),
    );
    expect(verification.checks.issuerBinding).toBe('verified');
    expect(verification.valid).toBe(true);
    expect(calls).toEqual([ISSUER]);
  });

  it('CLAIM TESTS 9-10 — a wrong key binding leaves the signature valid but makes the verification invalid', async () => {
    const signedClaim = signedClaimFixture(derivationClaim(subjectId()));
    const result = await run(
      { operation: 'verify-signed-claim', signedClaim },
      { resolver: boundResolver(OTHER_KEY_PAIR.signingKey.keyId) },
    );
    const verification = claimVerification(result);
    expect(verification.checks.signature).toBe('valid');
    expect(verification.checks.issuerBinding).toBe('unverified');
    expect(verification.valid).toBe(false);
    expect(result.status).toBe('succeeded');
  });

  it('CLAIM TEST 11 — tampered claim content invalidates digest and signature', async () => {
    const signedClaim = signedClaimFixture(derivationClaim(subjectId()));
    const tampered = {
      ...signedClaim,
      claim: {
        ...signedClaim.claim,
        metadata: { ...signedClaim.claim.metadata, statement: 'rewritten after signing' },
      },
    } as unknown as SignedClaim<VerifiableSovereignClaim>;
    const result = await run({ operation: 'verify-signed-claim', signedClaim: tampered });
    const verification = claimVerification(result);
    expect(verification.valid).toBe(false);
    expect(verification.checks.claimDigest).toBe('invalid');
    expect(verification.checks.signature).toBe('invalid');
    expect(verification.reasons).toContain('CLAIM_DIGEST_MISMATCH');
    expect(verification.reasons).toContain('CLAIM_SIGNATURE_INVALID');
    expect(result.status).toBe('succeeded');
  });

  it('CLAIM TEST 11b — a tampered derivation source list is detected', async () => {
    const signedClaim = signedClaimFixture(derivationClaim(subjectId()));
    const tampered = {
      ...signedClaim,
      claim: {
        ...signedClaim.claim,
        metadata: {
          ...signedClaim.claim.metadata,
          sourceSovereignAssetIds: [parseSovereignAssetId(mintSovereignAssetId())],
        },
      },
    } as unknown as SignedClaim<VerifiableSovereignClaim>;
    const verification = claimVerification(await run({ operation: 'verify-signed-claim', signedClaim: tampered }));
    expect(verification.checks.claimStructure).toBe('valid');
    expect(verification.checks.claimDigest).toBe('invalid');
    expect(verification.checks.signature).toBe('invalid');
  });

  it('CLAIM TEST 12 — tampering only SignedClaim.digest invalidates the digest, not the signature', async () => {
    const signedClaim = signedClaimFixture(originClaim(subjectId()));
    const tampered = { ...signedClaim, digest: 'a'.repeat(64) };
    const verification = claimVerification(await run({ operation: 'verify-signed-claim', signedClaim: tampered }));
    expect(verification.checks.claimDigest).toBe('invalid');
    // The proof signs the claim payload, not the SignedClaim.digest beside it.
    expect(verification.checks.signature).toBe('valid');
    expect(verification.valid).toBe(false);
    expect(verification.reasons).toEqual(['CLAIM_DIGEST_MISMATCH']);
  });

  it('CLAIM TEST 13 — tampering only the signature invalidates the signature, not the digest', async () => {
    const signedClaim = signedClaimFixture(originClaim(subjectId()));
    const flipped = Buffer.from(signedClaim.proof.signature, 'base64url');
    flipped[1] ^= 0xff;
    const tampered = {
      ...signedClaim,
      proof: { ...signedClaim.proof, signature: flipped.toString('base64url') },
    };
    const verification = claimVerification(await run({ operation: 'verify-signed-claim', signedClaim: tampered }));
    expect(verification.checks.claimDigest).toBe('valid');
    expect(verification.checks.signature).toBe('invalid');
    expect(verification.valid).toBe(false);
  });

  it('CLAIM TEST 14 — a cryptographically valid signature over a structurally invalid claim is reported honestly', async () => {
    // Deliberately signed *as malformed*, so the digest and signature both hold
    // over exactly the bytes the issuer signed.
    const malformed = {
      ...originClaim(subjectId()),
      metadata: { assertedOrigin: '   ' },
    } as unknown as VerifiableSovereignClaim;
    const signedClaim = signedClaimFixture(malformed);
    const result = await run({ operation: 'verify-signed-claim', signedClaim });
    const verification = claimVerification(result);
    expect(verification.checks.claimStructure).toBe('invalid');
    expect(verification.checks.claimDigest).toBe('valid');
    expect(verification.checks.signature).toBe('valid');
    expect(verification.valid).toBe(false);
    expect(verification.reasons).toContain('INVALID_ASSERTED_ORIGIN');
    expect(result.status).toBe('succeeded');
  });

  it('CLAIM TEST 15 — a missing assertionRef makes the structure invalid', async () => {
    const { assertionRef, ...withoutAssertionRef } = originClaim(subjectId());
    void assertionRef;
    const signedClaim = signedClaimFixture(withoutAssertionRef as unknown as VerifiableSovereignClaim);
    const verification = claimVerification(await run({ operation: 'verify-signed-claim', signedClaim }));
    expect(verification.checks.claimStructure).toBe('invalid');
    expect(verification.reasons).toContain('INVALID_CLAIM_ASSERTION_REF');
    expect(verification.checks.signature).toBe('valid');
    expect(verification.valid).toBe(false);
  });

  it('CLAIM TEST 16 — missing attestationRefs makes the structure invalid', async () => {
    const { attestationRefs, ...withoutAttestationRefs } = originClaim(subjectId());
    void attestationRefs;
    const signedClaim = signedClaimFixture(withoutAttestationRefs as unknown as VerifiableSovereignClaim);
    const verification = claimVerification(await run({ operation: 'verify-signed-claim', signedClaim }));
    expect(verification.checks.claimStructure).toBe('invalid');
    expect(verification.reasons).toContain('INVALID_CLAIM_ATTESTATION_REFS');
  });

  it('CLAIM TEST 17 — an invalid issuer makes the structure invalid', async () => {
    const signedClaim = signedClaimFixture({ ...originClaim(subjectId()), issuer: '   ' } as unknown as VerifiableSovereignClaim);
    const verification = claimVerification(await run({ operation: 'verify-signed-claim', signedClaim }));
    expect(verification.checks.claimStructure).toBe('invalid');
    expect(verification.reasons).toContain('INVALID_CLAIM_ISSUER');
  });

  it('CLAIM TEST 17b — an invalid issuedAt makes the structure invalid', async () => {
    const signedClaim = signedClaimFixture({
      ...originClaim(subjectId()),
      issuedAt: 'the day before yesterday',
    } as unknown as VerifiableSovereignClaim);
    const verification = claimVerification(await run({ operation: 'verify-signed-claim', signedClaim }));
    expect(verification.checks.claimStructure).toBe('invalid');
    expect(verification.reasons).toContain('INVALID_CLAIM_ISSUED_AT');
  });

  it('CLAIM TEST 18 — invalid Derivation sources make the structure invalid', async () => {
    const base = derivationClaim(subjectId());
    for (const [sources, reason] of [
      [[], 'DERIVATION_SOURCES_REQUIRED'],
      [['not-a-sovereign-asset-id'], 'INVALID_DERIVATION_SOURCE'],
      [[base.subject], 'DERIVATION_SELF_REFERENCE'],
    ] as const) {
      const signedClaim = signedClaimFixture({
        ...base,
        metadata: { ...base.metadata, sourceSovereignAssetIds: sources },
      } as unknown as VerifiableSovereignClaim);
      const verification = claimVerification(await run({ operation: 'verify-signed-claim', signedClaim }));
      expect(verification.checks.claimStructure).toBe('invalid');
      expect(verification.reasons).toContain(reason);
      expect(verification.valid).toBe(false);
    }
  });

  it('CLAIM TEST 18b — an invalid claim subject makes the structure invalid and mints no id', async () => {
    const signedClaim = signedClaimFixture({
      ...originClaim(subjectId()),
      subject: 'not-a-sovereign-asset-id',
    } as unknown as VerifiableSovereignClaim);
    const result = await run({ operation: 'verify-signed-claim', signedClaim });
    expect(result.status).toBe('succeeded');
    expect(claimVerification(result).reasons).toContain('INVALID_CLAIM_SUBJECT');
    expect(result.subject).toBeUndefined();
    expect(result.evidence.subject).toBeUndefined();
  });

  it('CLAIM TEST 18c — a claim type with no runtime validator is reported as unsupported, never waved through', async () => {
    const unsupported = {
      ...originClaim(subjectId()),
      type: ClaimType.Identity,
    } as unknown as VerifiableSovereignClaim;
    const signedClaim = signedClaimFixture(unsupported);
    const verification = claimVerification(await run({ operation: 'verify-signed-claim', signedClaim }));
    expect(verification.checks.claimStructure).toBe('invalid');
    expect(verification.checks.signature).toBe('valid');
    expect(verification.reasons).toContain('UNSUPPORTED_SOVEREIGN_CLAIM_TYPE');
    expect(verification.valid).toBe(false);
  });

  it('CLAIM TEST 19 — an ordinary invalid claim artifact is a succeeded execution', async () => {
    const signedClaim = signedClaimFixture(originClaim(subjectId()));
    const result = await run({ operation: 'verify-signed-claim', signedClaim: { ...signedClaim, digest: 'b'.repeat(64) } });
    expect(result.status).toBe('succeeded');
    expect(result.evidence.outcome).toBe('succeeded');
  });

  it('CLAIM TEST 20 — the claim is not mutated', async () => {
    const signedClaim = signedClaimFixture(derivationClaim(subjectId()));
    const before = canonicalizeJSON(signedClaim);
    await run({ operation: 'verify-signed-claim', signedClaim });
    await run({ operation: 'verify-signed-claim', signedClaim }, { resolver: boundResolver(KEY_PAIR.signingKey.keyId) });
    expect(canonicalizeJSON(signedClaim)).toBe(before);
  });

  it('CLAIM TEST 21 — no standing is produced, read or mutated', async () => {
    const signedClaim = signedClaimFixture(derivationClaim(subjectId()));
    const result = await run({ operation: 'verify-signed-claim', signedClaim });
    const serialized = JSON.stringify(result);
    for (const term of Object.values(StandingStatus)) {
      expect(serialized).not.toContain(term);
    }
    for (const term of ['standing', 'Standing', 'claimRef', 'effectiveAt']) {
      expect(serialized).not.toContain(term);
    }
  });

  it('CLAIM TEST 22 — no truth, ownership or adjudication field appears in the output', async () => {
    const signedClaim = signedClaimFixture(originClaim(subjectId()));
    const result = await run({ operation: 'verify-signed-claim', signedClaim });
    const serialized = JSON.stringify(result);
    for (const term of [
      'truth', 'historicallyTrue', 'authorized', 'authorizedDerivative', 'legalValidity', 'legalOwner',
      'ownershipVerified', 'copyright', 'licenseValid', 'trustScore', 'confidenceScore', 'riskScore',
      'reputation', 'assuranceScore', 'ALLOW', 'DENY', 'APPROVE', 'REJECT',
    ]) {
      expect(serialized).not.toContain(term);
    }
  });

  it('CLAIM TEST 23 — no SovereignAssetId is minted: the returned subject is the claim subject', async () => {
    const id = subjectId();
    const signedClaim = signedClaimFixture(derivationClaim(id));
    const result = await run({ operation: 'verify-signed-claim', signedClaim });
    expect(result.subject).toEqual({ sovereignAssetId: id });
    expect(result.subject?.externalReference).toBeUndefined();
  });

  it('CLAIM TEST 23b — an explicit subject keeps its external reference; none is fabricated from the claim', async () => {
    const id = subjectId();
    const signedClaim = signedClaimFixture(derivationClaim(id));
    const subject: SovereignSubjectRef = { sovereignAssetId: id, externalReference };
    const result = await run({ operation: 'verify-signed-claim', signedClaim }, { subject });
    expect(result.status).toBe('succeeded');
    expect(result.subject).toEqual(subject);
    expect(result.evidence.subject).toEqual(subject);
  });

  it('CLAIM TEST 24 — an explicit subject mismatch fails the execution', async () => {
    const signedClaim = signedClaimFixture(derivationClaim(subjectId()));
    const result = await run(
      { operation: 'verify-signed-claim', signedClaim },
      { subject: { sovereignAssetId: parseSovereignAssetId(mintSovereignAssetId()) } },
    );
    expect(result.status).toBe('failed');
    if (result.status !== 'failed') throw new Error('unreachable');
    expect(result.reasonCodes).toEqual([CODES.subjectMismatch]);
  });
});

describe('SM-08 / AOC.VERIFIABILITY generic sovereign proof verification (PROOF TESTS 1-12)', () => {
  const payload = { resultType: 'example-protocol-result', value: 42 };
  const proofOver = (value: unknown, keyPair: SovereignKeyPair = KEY_PAIR) =>
    signSovereignPayload(value, keyPair.privateKeyPem, keyPair.signingKey, SIGNED_AT);

  it('PROOF TEST 1 — a signSovereignPayload fixture verifies through the capsule', async () => {
    const verification = proofVerification(
      await run({ operation: 'verify-sovereign-proof', payload, proof: proofOver(payload) }),
    );
    expect(verification.valid).toBe(true);
    expect(verification.reasons).toEqual([]);
  });

  it('PROOF TEST 2 — the generic operation works with no subject at all', async () => {
    const result = await run({ operation: 'verify-sovereign-proof', payload, proof: proofOver(payload) });
    expect(result.status).toBe('succeeded');
    expect(result.subject).toBeUndefined();
    expect(result.evidence.subject).toBeUndefined();
    expect(isValidSovereigntyCapabilityInvocationEvidence(result.evidence)).toBe(true);
  });

  it('PROOF TEST 3 — an explicit subject is preserved purely as attribution context', async () => {
    const subject: SovereignSubjectRef = { sovereignAssetId: parseSovereignAssetId(mintSovereignAssetId()), externalReference };
    const result = await run({ operation: 'verify-sovereign-proof', payload, proof: proofOver(payload) }, { subject });
    expect(result.status).toBe('succeeded');
    expect(result.subject).toEqual(subject);
    expect(proofVerification(result).valid).toBe(true);
  });

  it('PROOF TEST 4 — no subject is guessed out of a payload that looks like it has one', async () => {
    const subjectish = {
      sovereignAssetId: mintSovereignAssetId(),
      subject: mintSovereignAssetId(),
      id: 'looks-like-an-id',
    };
    const result = await run({ operation: 'verify-sovereign-proof', payload: subjectish, proof: proofOver(subjectish) });
    expect(proofVerification(result).valid).toBe(true);
    expect(result.subject).toBeUndefined();
    expect(result.evidence.subject).toBeUndefined();
  });

  it('PROOF TEST 5 — a tampered payload is invalid', async () => {
    const proof = proofOver(payload);
    const result = await run({ operation: 'verify-sovereign-proof', payload: { ...payload, value: 43 }, proof });
    expect(result.status).toBe('succeeded');
    const verification = proofVerification(result);
    expect(verification.valid).toBe(false);
    expect(verification.reasons).toEqual([CODES.sovereignProofInvalid]);
  });

  it('PROOF TEST 6 — a tampered signature is invalid', async () => {
    const proof = proofOver(payload);
    const flipped = Buffer.from(proof.signature, 'base64url');
    flipped[2] ^= 0xff;
    const verification = proofVerification(
      await run({
        operation: 'verify-sovereign-proof',
        payload,
        proof: { ...proof, signature: flipped.toString('base64url') },
      }),
    );
    expect(verification.valid).toBe(false);
  });

  it('PROOF TEST 7 — a tampered payloadHash is invalid', async () => {
    const proof = proofOver(payload);
    const verification = proofVerification(
      await run({ operation: 'verify-sovereign-proof', payload, proof: { ...proof, payloadHash: 'c'.repeat(64) } }),
    );
    expect(verification.valid).toBe(false);
  });

  it('PROOF TEST 8 — an unsupported algorithm is invalid, not a crash', async () => {
    const proof = { ...proofOver(payload), algorithm: 'secp256k1' } as never;
    const result = await run({ operation: 'verify-sovereign-proof', payload, proof });
    expect(result.status).toBe('succeeded');
    expect(proofVerification(result).valid).toBe(false);
  });

  it('PROOF TEST 9 — an unsupported canonicalization profile is invalid, not a crash', async () => {
    const proof = { ...proofOver(payload), canonicalizationProfile: 'some-other-canonical-json/9' } as never;
    const result = await run({ operation: 'verify-sovereign-proof', payload, proof });
    expect(result.status).toBe('succeeded');
    expect(proofVerification(result).valid).toBe(false);
  });

  it('PROOF TEST 10 — malformed public key/signature material fails closed', async () => {
    const proof = proofOver(payload);
    for (const broken of [
      { ...proof, publicKey: 'NOT A PEM' },
      { ...proof, signature: '' },
      { ...proof, publicKey: '' },
    ]) {
      const result = await run({ operation: 'verify-sovereign-proof', payload, proof: broken });
      expect(result.status).toBe('succeeded');
      expect(proofVerification(result).valid).toBe(false);
    }
  });

  it('PROOF TEST 11 — a non-canonicalizable payload is handled without leaking a raw error', async () => {
    const proof = proofOver(payload);
    for (const bad of [{ a: undefined }, { n: Number.POSITIVE_INFINITY }, { f: () => 1 }, undefined]) {
      const result = await run({ operation: 'verify-sovereign-proof', payload: bad, proof });
      expect(result.status).toBe('succeeded');
      const verification = proofVerification(result);
      expect(verification.valid).toBe(false);
      expect(verification.reasons).toEqual([CODES.payloadNotCanonicalizable]);
      for (const reason of verification.reasons) {
        expect(reason).not.toMatch(/Error|Unsupported type|at Object|node:internal|\.ts:/);
      }
    }
  });

  it('PROOF TEST 12 — verification agrees exactly with the owning primitive, so no second implementation exists', async () => {
    const proof = proofOver(payload);
    const { verifySovereignSignature } = await import('@aoc/protocol/manifest');
    for (const candidate of [payload, { ...payload, value: 43 }, { unrelated: true }]) {
      const viaCapsule = proofVerification(await run({ operation: 'verify-sovereign-proof', payload: candidate, proof }));
      expect(viaCapsule.valid).toBe(verifySovereignSignature(candidate, proof));
    }
  });

  it('PROOF TEST 12b — a canonicalizable Protocol-shaped payload with no sovereign identity verifies subjectlessly', async () => {
    const nonSubject = { resultType: 'example-protocol-result', findings: ['a', 'b'], count: 2 };
    const result = await run({ operation: 'verify-sovereign-proof', payload: nonSubject, proof: proofOver(nonSubject) });
    expect(proofVerification(result).valid).toBe(true);
    expect(result.subject).toBeUndefined();
  });
});

describe('SM-08 / AOC.VERIFIABILITY issuer/key binding (BINDING TESTS 1-10)', () => {
  it('BINDING TEST 1 — no resolver means not_performed on both artifact operations', async () => {
    const { signed } = signedManifestFixture();
    expect(manifestVerification(await run({ operation: 'verify-signed-manifest', signedManifest: signed })).checks.issuerBinding)
      .toBe('not_performed');
    const signedClaim = signedClaimFixture(originClaim(parseSovereignAssetId(mintSovereignAssetId())));
    expect(claimVerification(await run({ operation: 'verify-signed-claim', signedClaim })).checks.issuerBinding)
      .toBe('not_performed');
  });

  it('BINDING TEST 2 — the correct keyId binds', async () => {
    const { signed } = signedManifestFixture();
    expect(
      manifestVerification(
        await run({ operation: 'verify-signed-manifest', signedManifest: signed }, { resolver: boundResolver(KEY_PAIR.signingKey.keyId) }),
      ).checks.issuerBinding,
    ).toBe('verified');
  });

  it('BINDING TEST 3 — a wrong keyId does not bind', async () => {
    const { signed } = signedManifestFixture();
    expect(
      manifestVerification(
        await run(
          { operation: 'verify-signed-manifest', signedManifest: signed },
          { resolver: boundResolver(OTHER_KEY_PAIR.signingKey.keyId) },
        ),
      ).checks.issuerBinding,
    ).toBe('unverified');
  });

  it('BINDING TEST 4 — a resolver returning undefined does not bind', async () => {
    const { signed } = signedManifestFixture();
    const verification = manifestVerification(
      await run({ operation: 'verify-signed-manifest', signedManifest: signed }, { resolver: emptyResolver() }),
    );
    expect(verification.checks.issuerBinding).toBe('unverified');
    expect(verification.valid).toBe(false);
  });

  it('BINDING TEST 5 — the resolver is not called for the generic proof operation', async () => {
    const calls: string[] = [];
    const proof = signSovereignPayload({ a: 1 }, KEY_PAIR.privateKeyPem, KEY_PAIR.signingKey, SIGNED_AT);
    const result = await run(
      { operation: 'verify-sovereign-proof', payload: { a: 1 }, proof },
      { resolver: boundResolver(KEY_PAIR.signingKey.keyId, calls) },
    );
    expect(result.status).toBe('succeeded');
    expect(calls).toEqual([]);
  });

  it('BINDING TEST 5b — creating the implementation calls nothing', () => {
    const calls: string[] = [];
    createVerifiabilitySovereigntyCapabilityImplementation({ verificationKeyResolver: throwingResolver(calls) });
    expect(calls).toEqual([]);
  });

  it('BINDING TEST 6 — the resolver is called exactly once per invocation', async () => {
    const calls: string[] = [];
    const { signed } = signedManifestFixture();
    await run({ operation: 'verify-signed-manifest', signedManifest: signed }, { resolver: boundResolver(KEY_PAIR.signingKey.keyId, calls) });
    expect(calls).toHaveLength(1);

    const claimCalls: string[] = [];
    const signedClaim = signedClaimFixture(derivationClaim(parseSovereignAssetId(mintSovereignAssetId())));
    await run({ operation: 'verify-signed-claim', signedClaim }, { resolver: boundResolver(KEY_PAIR.signingKey.keyId, claimCalls) });
    expect(claimCalls).toHaveLength(1);
  });

  it('BINDING TESTS 7-8 — a throwing resolver fails the execution once, with no retry and no leaked exception', async () => {
    for (const input of [
      (): VerifiabilitySovereigntyCapabilityInput => ({
        operation: 'verify-signed-manifest',
        signedManifest: signedManifestFixture().signed,
      }),
      (): VerifiabilitySovereigntyCapabilityInput => ({
        operation: 'verify-signed-claim',
        signedClaim: signedClaimFixture(originClaim(parseSovereignAssetId(mintSovereignAssetId()))),
      }),
    ]) {
      const calls: string[] = [];
      const result = await run(input(), { resolver: throwingResolver(calls) });
      expect(result.status).toBe('failed');
      if (result.status !== 'failed') throw new Error('unreachable');
      expect(result.reasonCodes).toEqual([CODES.keyResolutionFailed]);
      expect(calls).toHaveLength(1);
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('super-secret-kms-token');
      expect(serialized).not.toContain('could not reach vault');
      expect(result.evidence.outcome).toBe('failed');
      expect(result.evidence.reasonCodes).toEqual([CODES.keyResolutionFailed]);
    }
  });

  it('BINDING TEST 8b — an issuerId that differs from the signed registrant is never resolved and fails the binding', async () => {
    const calls: string[] = [];
    const { signed } = signedManifestFixture();
    const verification = manifestVerification(
      await run(
        { operation: 'verify-signed-manifest', signedManifest: signed, issuerId: 'principal:explicit-override' },
        { resolver: boundResolver(KEY_PAIR.signingKey.keyId, calls) },
      ),
    );
    expect(calls).toEqual([]);
    expect(verification.checks.issuerBinding).toBe('unverified');
    expect(verification.reasons).toContain('ISSUER_BINDING_ISSUER_MISMATCH');
    expect(verification.valid).toBe(false);
  });

  it('BINDING TEST 8b′ — an issuerId equal to the signed registrant resolves that registrant', async () => {
    const calls: string[] = [];
    const { signed } = signedManifestFixture();
    const verification = manifestVerification(
      await run(
        { operation: 'verify-signed-manifest', signedManifest: signed, issuerId: ISSUER },
        { resolver: boundResolver(KEY_PAIR.signingKey.keyId, calls) },
      ),
    );
    expect(calls).toEqual([ISSUER]);
    expect(verification.checks.issuerBinding).toBe('verified');
    expect(verification.valid).toBe(true);
  });

  it('BINDING TEST 8c — a CanonicalPrincipalRef registrant resolves by its id and nothing else', async () => {
    const id = parseSovereignAssetId(mintSovereignAssetId());
    const manifest = buildSovereignManifestV1({
      sovereignAssetId: id,
      registrant: { id: 'principal:ref-registrant', kind: 'Organization', displayName: 'Not An Identity' },
      createdAt: AT,
    });
    const signed = signSovereignManifest(manifest, KEY_PAIR.privateKeyPem, KEY_PAIR.signingKey, SIGNED_AT);
    const calls: string[] = [];
    const verification = manifestVerification(
      await run({ operation: 'verify-signed-manifest', signedManifest: signed }, { resolver: boundResolver(KEY_PAIR.signingKey.keyId, calls) }),
    );
    expect(calls).toEqual(['principal:ref-registrant']);
    expect(verification.checks.issuerBinding).toBe('verified');
  });

  it('BINDING TEST 9 — a verified binding reports a key relationship only, with no ownership result', async () => {
    const { signed } = signedManifestFixture();
    const result = await run(
      { operation: 'verify-signed-manifest', signedManifest: signed },
      { resolver: boundResolver(KEY_PAIR.signingKey.keyId) },
    );
    const serialized = JSON.stringify(result);
    for (const term of [
      'owner', 'ownership', 'legal', 'kyc', 'KYC', 'certificate', 'chain', 'revoked', 'revocation',
      'trusted', 'trustLevel', 'identityProof',
    ]) {
      expect(serialized).not.toContain(term);
    }
    expect(manifestVerification(result).checks.issuerBinding).toBe('verified');
  });

  it('BINDING TEST 10 — proof.publicKey alone never sets issuerBinding to verified', async () => {
    const { signed } = signedManifestFixture();
    expect(signed.proof.publicKey).toContain('BEGIN PUBLIC KEY');
    const verification = manifestVerification(await run({ operation: 'verify-signed-manifest', signedManifest: signed }));
    expect(verification.checks.signature).toBe('valid');
    expect(verification.checks.issuerBinding).toBe('not_performed');
  });

  it('BINDING TEST 10b — a resolver descriptor validity window is not evaluated in v1', async () => {
    const { signed } = signedManifestFixture();
    const expiredResolver: VerificationKeyResolver = {
      resolveVerificationKey: (issuer): VerificationKeyDescriptor => ({
        keyId: KEY_PAIR.signingKey.keyId,
        issuer,
        validFrom: '1999-01-01T00:00:00.000Z',
        validUntil: '2000-01-01T00:00:00.000Z',
      }),
    };
    // v1 owns no key-window rule, so it invents none: the binding is reported
    // on key identity alone. Documented as a v1 limitation, not as a policy.
    const verification = manifestVerification(
      await run({ operation: 'verify-signed-manifest', signedManifest: signed }, { resolver: expiredResolver }),
    );
    expect(verification.checks.issuerBinding).toBe('verified');
  });
});

describe('SM-08 / AOC.VERIFIABILITY invocation validation and failure semantics', () => {
  it('the operation set is exactly the three v1 operations', () => {
    expect(VERIFIABILITY_SOVEREIGNTY_CAPABILITY_OPERATIONS).toEqual([
      'verify-signed-manifest',
      'verify-signed-claim',
      'verify-sovereign-proof',
    ]);
    for (const forbidden of ['generate-key-pair', 'sign-manifest', 'sign-claim', 'sign-payload']) {
      expect(VERIFIABILITY_SOVEREIGNTY_CAPABILITY_OPERATIONS as readonly string[]).not.toContain(forbidden);
    }
  });

  it('an uninterpretable invocation is a FAILED execution, never a negative verification', async () => {
    const cases: readonly [unknown, string][] = [
      [null, CODES.invalidInput],
      ['verify-signed-manifest', CODES.invalidInput],
      [[], CODES.invalidInput],
      [{}, CODES.unsupportedOperation],
      [{ operation: 'verify-everything' }, CODES.unsupportedOperation],
      [{ operation: 'sign-manifest' }, CODES.unsupportedOperation],
      [{ operation: 'verify-signed-manifest' }, CODES.invalidSignedManifestTarget],
      [{ operation: 'verify-signed-manifest', signedManifest: {} }, CODES.invalidSignedManifestTarget],
      [{ operation: 'verify-signed-claim' }, CODES.invalidSignedClaimTarget],
      [{ operation: 'verify-signed-claim', signedClaim: { claim: {}, digest: 1, proof: {} } }, CODES.invalidSignedClaimTarget],
      [{ operation: 'verify-sovereign-proof' }, CODES.invalidGenericProofTarget],
      [{ operation: 'verify-sovereign-proof', payload: 1 }, CODES.invalidGenericProofTarget],
    ];
    for (const [input, code] of cases) {
      const validation = validateVerifiabilitySovereigntyCapabilityInput(input);
      expect(validation.valid).toBe(false);
      expect(validation.reasons).toContain(code);
      const result = await run(input as VerifiabilitySovereigntyCapabilityInput);
      expect(result.status).toBe('failed');
      if (result.status !== 'failed') throw new Error('unreachable');
      expect(result.reasonCodes).toContain(code);
      expect(result.evidence.outcome).toBe('failed');
    }
  });

  it('a blank expected issuerId is a malformed invocation', async () => {
    const { signed } = signedManifestFixture();
    const result = await run({ operation: 'verify-signed-manifest', signedManifest: signed, issuerId: '  ' });
    expect(result.status).toBe('failed');
  });

  it('an inspectable-but-invalid artifact is NOT an invocation failure', () => {
    const { signed } = signedManifestFixture();
    // A structurally broken inner manifest is a legitimate verification target.
    expect(
      isValidVerifiabilitySovereigntyCapabilityInput({
        operation: 'verify-signed-manifest',
        signedManifest: { ...signed, manifest: { nonsense: true } },
      }),
    ).toBe(true);
    expect(
      isValidVerifiabilitySovereigntyCapabilityInput({
        operation: 'verify-signed-claim',
        signedClaim: { claim: { nonsense: true }, digest: 'x', proof: { algorithm: 'nope' } },
      }),
    ).toBe(true);
  });

  it('a structurally invalid inner manifest verifies to manifestStructure invalid, not an execution failure', async () => {
    const { signed } = signedManifestFixture();
    const broken = {
      ...signed,
      manifest: { ...signed.manifest, schemaVersion: 'aoc-sovereign-manifest/999' },
    } as unknown as SignedSovereignManifest;
    const result = await run({ operation: 'verify-signed-manifest', signedManifest: broken });
    expect(result.status).toBe('succeeded');
    const verification = manifestVerification(result);
    expect(verification.checks.manifestStructure).toBe('invalid');
    expect(verification.reasons).toContain('UNSUPPORTED_SCHEMA_VERSION');
  });

  it('the input validator mutates nothing', () => {
    const { signed } = signedManifestFixture();
    const input = { operation: 'verify-signed-manifest', signedManifest: signed } as VerifiabilitySovereigntyCapabilityInput;
    const before = canonicalizeJSON(input);
    validateVerifiabilitySovereigntyCapabilityInput(input);
    expect(canonicalizeJSON(input)).toBe(before);
  });

  it('the verification report is deterministic and carries no id, clock or nonce', async () => {
    const { signed } = signedManifestFixture();
    const a = manifestVerification(await run({ operation: 'verify-signed-manifest', signedManifest: signed }));
    const b = manifestVerification(await run({ operation: 'verify-signed-manifest', signedManifest: signed }));
    expect(canonicalizeJSON(a)).toBe(canonicalizeJSON(b));
    const serialized = JSON.stringify(a);
    for (const term of ['verifiedAt', 'checkedAt', 'generatedAt', 'reportId', 'verificationId', 'nonce']) {
      expect(serialized).not.toContain(term);
    }
  });

  it('every verification report is JSON-safe and canonicalizes', async () => {
    const { signed } = signedManifestFixture();
    const signedClaim = signedClaimFixture(derivationClaim(parseSovereignAssetId(mintSovereignAssetId())));
    const proof = signSovereignPayload({ a: 1 }, KEY_PAIR.privateKeyPem, KEY_PAIR.signingKey, SIGNED_AT);
    for (const input of [
      { operation: 'verify-signed-manifest', signedManifest: signed },
      { operation: 'verify-signed-claim', signedClaim },
      { operation: 'verify-sovereign-proof', payload: { a: 1 }, proof },
    ] as VerifiabilitySovereigntyCapabilityInput[]) {
      const result = await run(input);
      if (result.status !== 'succeeded') throw new Error('expected success');
      const report = result.output.verification;
      expect(canonicalizeJSON(JSON.parse(JSON.stringify(report)))).toBe(canonicalizeJSON(report));
    }
  });
});
