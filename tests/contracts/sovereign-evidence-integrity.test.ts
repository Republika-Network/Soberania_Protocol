import type { VerificationKeyDescriptor, VerificationKeyResolver } from '@aoc/protocol/adapters';
import {
  buildSovereignExternalReference,
  computeContentIdentity,
  mintSovereignAssetId,
  parseSovereignAssetId,
} from '@aoc/protocol/identity';
import type { SovereignAssetId, SovereignSubjectRef } from '@aoc/protocol/identity';
import {
  AuthorityClaimKind,
  buildAuthorityClaim,
  buildSovereignManifestV1,
  generateSovereignKeyPair,
  signClaim,
  signSovereignManifest,
  signSovereignPayload,
  verifySignedSovereignClaim,
  verifySovereignManifest,
} from '@aoc/protocol/manifest';
import type {
  SignedClaim,
  SignedSovereignManifest,
  SovereignClaimVerificationResult,
  SovereignKeyPair,
  SovereignManifestVerificationResult,
  VerifiableSovereignClaim,
} from '@aoc/protocol/manifest';
import {
  VERIFIABILITY_SOVEREIGNTY_CAPABILITY_REASON_CODES,
  buildSovereigntyCapabilityInvocation,
  createVerifiabilitySovereigntyCapabilityImplementation,
  getSovereigntyCapabilityRefByKey,
  invokeSovereigntyCapability,
} from '@aoc/protocol/sovereignty-capabilities';
import type {
  SovereigntyCapabilityInvocation,
  SovereigntyCapabilityRef,
  SovereigntyCapabilityResult,
  VerifiabilitySovereigntyCapabilityInput,
  VerifiabilitySovereigntyCapabilityOutput,
} from '@aoc/protocol/sovereignty-capabilities';

/**
 * SOBE-SEC-01.2 — end-to-end verified evidence integrity (H-1).
 *
 * Invariant: every verification result and every evidence record refers to the
 * exact representation that was cryptographically verified. AOC.VERIFIABILITY
 * must never attribute a `valid` (or issuer-`verified`) verification to a
 * subject or issuer the signed bytes do not name.
 *
 * Trust boundary: `invokeSovereigntyCapability(invocation, implementation)` and
 * `implementation.invoke(invocation)`. Everything reachable from `invocation`
 * — the envelope's `subject`, its `input`, the signed wrapper, the manifest or
 * claim, and the proof — is caller-controlled and may be a getter or a proxy
 * that answers differently on every read.
 *
 * Every test drives the full capsule through the common socket, so the
 * evidence record asserted on is the one a consumer actually receives. All
 * key pairs are TEST ONLY fixture material.
 */

const CODES = VERIFIABILITY_SOVEREIGNTY_CAPABILITY_REASON_CODES;
const VERIFIABILITY_REF = getSovereigntyCapabilityRefByKey('verifiability') as SovereigntyCapabilityRef;
const AT = '2026-04-01T09:00:00.000Z';
const SIGNED_AT = new Date(AT);
const ALICE = 'principal:alice';
const BOB = 'principal:bob';

/** TEST ONLY signing material. */
const ALICE_KEYS: SovereignKeyPair = generateSovereignKeyPair();
const BOB_KEYS: SovereignKeyPair = generateSovereignKeyPair();

/** A registry binding Alice and Bob to their own keys. */
const REGISTRY: Record<string, string> = {
  [ALICE]: ALICE_KEYS.signingKey.keyId,
  [BOB]: BOB_KEYS.signingKey.keyId,
};

const registryResolver = (calls?: string[]): VerificationKeyResolver => ({
  resolveVerificationKey(issuer): VerificationKeyDescriptor | undefined {
    calls?.push(issuer);
    const keyId = REGISTRY[issuer];
    return keyId === undefined ? undefined : { keyId, issuer };
  },
});

const externalReference = buildSovereignExternalReference({
  namespace: 'sec-01-2',
  id: 'asset-1',
  locator: 'sec://asset/1',
});

const newAssetId = (): SovereignAssetId => parseSovereignAssetId(mintSovereignAssetId());

const manifestFor = (id: SovereignAssetId, registrant: string) =>
  buildSovereignManifestV1({
    sovereignAssetId: id,
    externalReference,
    contentIdentity: computeContentIdentity(new TextEncoder().encode(`content of ${id}`)),
    registrant,
    createdAt: AT,
  });

/** A genuine manifest about `id`, registered to `registrant` and signed with `keys`. */
const signedManifest = (
  id: SovereignAssetId = newAssetId(),
  registrant: string = ALICE,
  keys: SovereignKeyPair = ALICE_KEYS,
): SignedSovereignManifest => signSovereignManifest(manifestFor(id, registrant), keys.privateKeyPem, keys.signingKey, SIGNED_AT);

const claimFor = (id: SovereignAssetId, issuer: string): VerifiableSovereignClaim =>
  buildAuthorityClaim({
    id: `claim:${id}`,
    sovereignAssetId: id,
    issuer,
    kind: AuthorityClaimKind.Authorship,
    statement: 'asserted authorship',
    issuedAt: AT,
  });

const signedClaim = (
  id: SovereignAssetId = newAssetId(),
  issuer: string = ALICE,
  keys: SovereignKeyPair = ALICE_KEYS,
): SignedClaim<VerifiableSovereignClaim> => signClaim(claimFor(id, issuer), keys.privateKeyPem, keys.signingKey, SIGNED_AT);

const subjectOf = (id: SovereignAssetId): SovereignSubjectRef => ({ sovereignAssetId: id, externalReference });

type Result = SovereigntyCapabilityResult<VerifiabilitySovereigntyCapabilityOutput>;

const implementation = (resolver?: VerificationKeyResolver) =>
  createVerifiabilitySovereigntyCapabilityImplementation(
    resolver === undefined ? {} : { verificationKeyResolver: resolver },
  );

const invocationOf = (
  input: VerifiabilitySovereigntyCapabilityInput,
  subject?: SovereignSubjectRef,
): SovereigntyCapabilityInvocation<VerifiabilitySovereigntyCapabilityInput> =>
  buildSovereigntyCapabilityInvocation({
    capability: VERIFIABILITY_REF,
    input,
    ...(subject === undefined ? {} : { subject }),
  });

const invoke = (
  invocation: SovereigntyCapabilityInvocation<VerifiabilitySovereigntyCapabilityInput>,
  resolver?: VerificationKeyResolver,
): Promise<Result> => invokeSovereigntyCapability(invocation, implementation(resolver));

const run = (
  input: VerifiabilitySovereigntyCapabilityInput,
  options: { subject?: SovereignSubjectRef; resolver?: VerificationKeyResolver } = {},
): Promise<Result> => invoke(invocationOf(input, options.subject), options.resolver);

const manifestReport = (result: Result): SovereignManifestVerificationResult | undefined =>
  result.status === 'succeeded' && result.output.operation === 'verify-signed-manifest' ? result.output.verification : undefined;

const claimReport = (result: Result): SovereignClaimVerificationResult | undefined =>
  result.status === 'succeeded' && result.output.operation === 'verify-signed-claim' ? result.output.verification : undefined;

/** Settles the invocation; a thrown implementation fault is reported, not rethrown. */
const settle = async (pending: Promise<Result>): Promise<{ result?: Result; thrown?: unknown }> => {
  try {
    return { result: await pending };
  } catch (thrown) {
    return { thrown };
  }
};

/**
 * A copy of `base` whose `key` answers `first` for the first `flipAfter` reads
 * and `then` for every later read — the deterministic shape of a
 * time-of-check/time-of-use substitution. `reads()` reports how often it was read.
 */
function flipping<T extends object>(
  base: T,
  key: string,
  first: unknown,
  then: unknown,
  flipAfter: number,
): { readonly value: T; readonly reads: () => number } {
  let reads = 0;
  const value = { ...base };
  Object.defineProperty(value, key, {
    enumerable: true,
    configurable: true,
    get() {
      reads += 1;
      return reads <= flipAfter ? first : then;
    },
  });
  return { value, reads: () => reads };
}

/** A proxy over `base` whose `key` answers `first` for the first `flipAfter` gets, then `then`. */
function flippingProxy<T extends object>(base: T, key: string, first: unknown, then: unknown, flipAfter: number): T {
  let reads = 0;
  return new Proxy(base, {
    get(target, property, receiver) {
      if (property === key) {
        reads += 1;
        return reads <= flipAfter ? first : then;
      }
      return Reflect.get(target, property, receiver);
    },
  });
}

/**
 * The invariant, asserted on the result a consumer receives: a verification
 * that passed is attributed to the subject the verified bytes name, in both the
 * result and its evidence, and nowhere else.
 */
const expectValidResultsAttributedTo = (result: Result | undefined, verifiedId: SovereignAssetId): void => {
  if (result === undefined) return;
  const report = manifestReport(result) ?? claimReport(result);
  if (report?.valid !== true) return;
  expect(result.subject?.sovereignAssetId).toBe(verifiedId);
  expect(result.evidence.subject?.sovereignAssetId).toBe(verifiedId);
};

const FLIP_POINTS = [0, 1, 2, 3, 4, 5, 6, 8];

describe('SOBE-SEC-01.2 / H-1 baseline — manifest capsule path', () => {
  it('CONTROL — an honest signed manifest verifies and is attributed to its own subject', async () => {
    const id = newAssetId();
    const result = await run({ operation: 'verify-signed-manifest', signedManifest: signedManifest(id) }, { resolver: registryResolver() });
    const report = manifestReport(result);
    expect(report?.valid).toBe(true);
    expect(report?.checks.issuerBinding).toBe('verified');
    expect(result.subject).toEqual(subjectOf(id));
    expect(result.evidence.subject).toEqual(subjectOf(id));
  });

  it('H-1 — a manifest getter cannot attribute a genuine verification to a victim subject', async () => {
    const genuineId = newAssetId();
    const victimId = newAssetId();
    const genuine = signedManifest(genuineId);
    // The first read (subject derivation) sees a forged, unsigned manifest
    // naming the victim; every later read (verification) sees the genuine one.
    const forged = { ...genuine.manifest, sovereignAssetId: victimId };
    const { value } = flipping(genuine, 'manifest', forged, genuine.manifest, 1);

    const result = await run({ operation: 'verify-signed-manifest', signedManifest: value }, { subject: subjectOf(victimId) });

    const report = manifestReport(result);
    // Vulnerable: { valid: true } attributed to the victim.
    expect(report?.valid === true && result.evidence.subject?.sovereignAssetId === victimId).toBe(false);
    expectValidResultsAttributedTo(result, genuineId);
  });

  it('H-1 — a proxy-backed signed manifest cannot attribute a genuine verification to a victim subject', async () => {
    const genuineId = newAssetId();
    const victimId = newAssetId();
    const genuine = signedManifest(genuineId);
    const forged = { ...genuine.manifest, sovereignAssetId: victimId };
    const proxy = flippingProxy(genuine, 'manifest', forged, genuine.manifest, 1);

    const result = await run({ operation: 'verify-signed-manifest', signedManifest: proxy });

    const report = manifestReport(result);
    expect(report?.valid === true && result.evidence.subject?.sovereignAssetId === victimId).toBe(false);
    expectValidResultsAttributedTo(result, genuineId);
  });

  it('H-1 — a manifest getter cannot bind the signature to an issuer the manifest does not name', async () => {
    // Alice signed a manifest that names Bob as its registrant. Honestly, the
    // binding is checked against Bob and fails: Alice's key is not Bob's.
    const genuineId = newAssetId();
    const genuine = signedManifest(genuineId, BOB, ALICE_KEYS);
    const honest = manifestReport(
      await run({ operation: 'verify-signed-manifest', signedManifest: genuine }, { resolver: registryResolver() }),
    );
    expect(honest?.checks.signature).toBe('valid');
    expect(honest?.checks.issuerBinding).toBe('unverified');
    expect(honest?.valid).toBe(false);

    // A getter shows the capsule a registrant of Alice when it picks the issuer.
    const forged = { ...genuine.manifest, registrant: ALICE };
    const { value } = flipping(genuine, 'manifest', forged, genuine.manifest, 1);
    const calls: string[] = [];
    const result = await run({ operation: 'verify-signed-manifest', signedManifest: value }, { resolver: registryResolver(calls) });

    const report = manifestReport(result);
    // Vulnerable: issuer 'verified' against Alice for bytes that name Bob.
    // Fixed: the issuer is read from the captured bytes, which are exactly
    // what the signature is checked over, so no reading can pair Alice with
    // Bob's signed manifest.
    expect(report?.checks.issuerBinding).not.toBe('verified');
    expect(report?.valid).not.toBe(true);
  });

  it('INVARIANT — for every flip point, issuer binding is never verified against an issuer the signed bytes do not name', async () => {
    for (const flipAfter of FLIP_POINTS) {
      for (const order of ['forged-first', 'genuine-first'] as const) {
        const genuine = signedManifest(newAssetId(), BOB, ALICE_KEYS);
        const forged = { ...genuine.manifest, registrant: ALICE };
        const [first, then] = order === 'forged-first' ? [forged, genuine.manifest] : [genuine.manifest, forged];
        const { value } = flipping(genuine, 'manifest', first, then, flipAfter);
        const { result } = await settle(
          run({ operation: 'verify-signed-manifest', signedManifest: value }, { resolver: registryResolver() }),
        );
        const report = result === undefined ? undefined : manifestReport(result);
        expect(report?.checks.issuerBinding).not.toBe('verified');
        expect(report?.valid).not.toBe(true);
      }
    }
  });

  it('INVARIANT — for every flip point, a valid manifest result names the verified subject', async () => {
    for (const flipAfter of FLIP_POINTS) {
      for (const order of ['forged-first', 'genuine-first'] as const) {
        const genuineId = newAssetId();
        const victimId = newAssetId();
        const genuine = signedManifest(genuineId);
        const forged = { ...genuine.manifest, sovereignAssetId: victimId };
        const [first, then] = order === 'forged-first' ? [forged, genuine.manifest] : [genuine.manifest, forged];
        const { value } = flipping(genuine, 'manifest', first, then, flipAfter);
        const { result } = await settle(run({ operation: 'verify-signed-manifest', signedManifest: value }));
        expectValidResultsAttributedTo(result, genuineId);
      }
    }
  });
});

describe('SOBE-SEC-01.2 / H-1 baseline — signed-claim capsule path', () => {
  it('CONTROL — an honest signed claim verifies and is attributed to its own subject', async () => {
    const id = newAssetId();
    const result = await run({ operation: 'verify-signed-claim', signedClaim: signedClaim(id) }, { resolver: registryResolver() });
    const report = claimReport(result);
    expect(report?.valid).toBe(true);
    expect(report?.checks.issuerBinding).toBe('verified');
    expect(result.subject?.sovereignAssetId).toBe(id);
    expect(result.evidence.subject?.sovereignAssetId).toBe(id);
  });

  it('CONTROL — an honest signed claim with a matching invocation subject keeps that subject', async () => {
    const id = newAssetId();
    const result = await run({ operation: 'verify-signed-claim', signedClaim: signedClaim(id) }, { subject: subjectOf(id) });
    expect(claimReport(result)?.valid).toBe(true);
    expect(result.subject).toEqual(subjectOf(id));
    expect(result.evidence.subject).toEqual(subjectOf(id));
  });

  it('H-1 — a claim getter cannot attribute a genuine verification to a victim subject', async () => {
    const genuineId = newAssetId();
    const victimId = newAssetId();
    const genuine = signedClaim(genuineId);
    const forged = { ...genuine.claim, subject: victimId };
    const { value } = flipping(genuine, 'claim', forged, genuine.claim, 1);

    const result = await run({ operation: 'verify-signed-claim', signedClaim: value }, { subject: subjectOf(victimId) });

    const report = claimReport(result);
    expect(report?.valid === true && result.evidence.subject?.sovereignAssetId === victimId).toBe(false);
    expectValidResultsAttributedTo(result, genuineId);
  });

  it('H-1 — a claim getter cannot attribute a genuine verification to a victim subject without an invocation subject', async () => {
    const genuineId = newAssetId();
    const victimId = newAssetId();
    const genuine = signedClaim(genuineId);
    const forged = { ...genuine.claim, subject: victimId };
    const { value } = flipping(genuine, 'claim', forged, genuine.claim, 1);

    const result = await run({ operation: 'verify-signed-claim', signedClaim: value });

    const report = claimReport(result);
    expect(report?.valid === true && result.evidence.subject?.sovereignAssetId === victimId).toBe(false);
    expectValidResultsAttributedTo(result, genuineId);
  });

  it('H-1 — a proxy-backed signed claim cannot attribute a genuine verification to a victim subject', async () => {
    const genuineId = newAssetId();
    const victimId = newAssetId();
    const genuine = signedClaim(genuineId);
    const forged = { ...genuine.claim, subject: victimId };
    const proxy = flippingProxy(genuine, 'claim', forged, genuine.claim, 1);

    const result = await run({ operation: 'verify-signed-claim', signedClaim: proxy });

    expectValidResultsAttributedTo(result, genuineId);
  });

  it('INVARIANT — for every flip point, a valid claim result names the verified subject', async () => {
    for (const flipAfter of FLIP_POINTS) {
      for (const order of ['forged-first', 'genuine-first'] as const) {
        for (const withSubject of [false, true]) {
          const genuineId = newAssetId();
          const victimId = newAssetId();
          const genuine = signedClaim(genuineId);
          const forged = { ...genuine.claim, subject: victimId };
          const [first, then] = order === 'forged-first' ? [forged, genuine.claim] : [genuine.claim, forged];
          const { value } = flipping(genuine, 'claim', first, then, flipAfter);
          const { result } = await settle(
            run({ operation: 'verify-signed-claim', signedClaim: value }, withSubject ? { subject: subjectOf(victimId) } : {}),
          );
          expectValidResultsAttributedTo(result, genuineId);
        }
      }
    }
  });
});

describe('SOBE-SEC-01.2 / H-1 baseline — invocation envelope', () => {
  /** An invocation whose `key` flips from `first` to `then` after `flipAfter` reads. */
  const flippingInvocation = (
    input: VerifiabilitySovereigntyCapabilityInput,
    key: 'subject' | 'input',
    first: unknown,
    then: unknown,
    flipAfter: number,
  ) => flipping(invocationOf(input), key, first, then, flipAfter).value;

  it('INVARIANT — a mutable invocation subject cannot redirect a valid claim result to a victim', async () => {
    for (const flipAfter of FLIP_POINTS) {
      const genuineId = newAssetId();
      const victimId = newAssetId();
      const invocation = flippingInvocation(
        { operation: 'verify-signed-claim', signedClaim: signedClaim(genuineId) },
        'subject',
        subjectOf(genuineId),
        subjectOf(victimId),
        flipAfter,
      );
      const { result } = await settle(invoke(invocation));
      expectValidResultsAttributedTo(result, genuineId);
    }
  });

  it('INVARIANT — a mutable invocation subject cannot redirect a valid manifest result to a victim', async () => {
    for (const flipAfter of FLIP_POINTS) {
      const genuineId = newAssetId();
      const victimId = newAssetId();
      const invocation = flippingInvocation(
        { operation: 'verify-signed-manifest', signedManifest: signedManifest(genuineId) },
        'subject',
        subjectOf(genuineId),
        subjectOf(victimId),
        flipAfter,
      );
      const { result } = await settle(invoke(invocation));
      expectValidResultsAttributedTo(result, genuineId);
    }
  });

  it('INVARIANT — a mutable invocation input cannot pair one artifact\'s verification with another\'s subject', async () => {
    for (const flipAfter of FLIP_POINTS) {
      const genuineId = newAssetId();
      const otherId = newAssetId();
      const genuineInput = { operation: 'verify-signed-claim' as const, signedClaim: signedClaim(genuineId) };
      const otherInput = { operation: 'verify-signed-claim' as const, signedClaim: signedClaim(otherId) };
      const invocation = flippingInvocation(genuineInput, 'input', genuineInput, otherInput, flipAfter);
      const { result } = await settle(invoke(invocation));
      if (result === undefined) continue;
      const report = claimReport(result);
      if (report?.valid !== true) continue;
      // Both artifacts are genuine; whichever was verified must be the one named.
      expect([genuineId, otherId]).toContain(result.evidence.subject?.sovereignAssetId);
      expect(result.subject?.sovereignAssetId).toBe(result.evidence.subject?.sovereignAssetId);
    }
  });
});

describe('SOBE-SEC-01.2 / evidence integrity — hardening and controls', () => {
  /** A copy of `base` whose `key` getter returns a fresh, deep copy on every read. */
  const freshEachRead = <T extends object>(base: T, key: string): T => {
    const source = (base as Record<string, unknown>)[key];
    const value = { ...base };
    Object.defineProperty(value, key, { enumerable: true, get: () => JSON.parse(JSON.stringify(source)) });
    return value;
  };

  /** A copy of `base` whose `key` getter throws. */
  const throwingAt = <T extends object>(base: T, key: string): T => {
    const value = { ...base };
    Object.defineProperty(value, key, {
      enumerable: true,
      get() {
        throw new Error('secret-internal-detail');
      },
    });
    return value;
  };

  it('a legitimate JSON-parsed signed manifest verifies with consistent subject, issuer, digest and signature', async () => {
    const id = newAssetId();
    const parsed = JSON.parse(JSON.stringify(signedManifest(id))) as SignedSovereignManifest;
    const calls: string[] = [];
    const result = await run({ operation: 'verify-signed-manifest', signedManifest: parsed }, { resolver: registryResolver(calls) });
    expect(manifestReport(result)).toEqual({
      valid: true,
      checks: {
        manifestStructure: 'valid',
        manifestDigest: 'valid',
        signature: 'valid',
        contentDigest: 'not_performed',
        issuerBinding: 'verified',
      },
      reasons: [],
    });
    expect(calls).toEqual([ALICE]);
    expect(result.subject).toEqual(subjectOf(id));
    expect(result.evidence.subject).toEqual(subjectOf(id));
    expect(Object.isFrozen(result.evidence.subject)).toBe(true);
  });

  it('a legitimate JSON-parsed signed claim verifies with consistent subject, issuer, digest and signature', async () => {
    const id = newAssetId();
    const parsed = JSON.parse(JSON.stringify(signedClaim(id))) as SignedClaim<VerifiableSovereignClaim>;
    const calls: string[] = [];
    const result = await run({ operation: 'verify-signed-claim', signedClaim: parsed }, { resolver: registryResolver(calls) });
    expect(claimReport(result)).toEqual({
      valid: true,
      checks: { claimStructure: 'valid', claimDigest: 'valid', signature: 'valid', issuerBinding: 'verified' },
      reasons: [],
    });
    expect(calls).toEqual([ALICE]);
    expect(result.subject).toEqual({ sovereignAssetId: id });
    expect(result.evidence.subject).toEqual({ sovereignAssetId: id });
  });

  it('getters returning a fresh but identical object on every read still verify honestly', async () => {
    const manifestId = newAssetId();
    const manifestResult = await run(
      { operation: 'verify-signed-manifest', signedManifest: freshEachRead(signedManifest(manifestId), 'manifest') },
      { subject: subjectOf(manifestId), resolver: registryResolver() },
    );
    expect(manifestReport(manifestResult)?.valid).toBe(true);
    expect(manifestResult.evidence.subject).toEqual(subjectOf(manifestId));

    const claimId = newAssetId();
    const claimResult = await run(
      { operation: 'verify-signed-claim', signedClaim: freshEachRead(signedClaim(claimId), 'claim') },
      { subject: subjectOf(claimId), resolver: registryResolver() },
    );
    expect(claimReport(claimResult)?.valid).toBe(true);
    expect(claimResult.evidence.subject).toEqual(subjectOf(claimId));
  });

  it('a manifest whose signer is not the bound issuer fails issuer binding and is still attributed to its own subject', async () => {
    const id = newAssetId();
    const result = await run(
      { operation: 'verify-signed-manifest', signedManifest: signedManifest(id, ALICE, BOB_KEYS) },
      { resolver: registryResolver() },
    );
    const report = manifestReport(result);
    expect(report?.checks.signature).toBe('valid');
    expect(report?.checks.issuerBinding).toBe('unverified');
    expect(report?.valid).toBe(false);
    expect(result.evidence.subject).toEqual(subjectOf(id));
  });

  it('a claim whose signer is not the bound issuer fails issuer binding', async () => {
    const id = newAssetId();
    const result = await run(
      { operation: 'verify-signed-claim', signedClaim: signedClaim(id, ALICE, BOB_KEYS) },
      { resolver: registryResolver() },
    );
    const report = claimReport(result);
    expect(report?.checks.signature).toBe('valid');
    expect(report?.checks.issuerBinding).toBe('unverified');
    expect(report?.valid).toBe(false);
  });

  it('a mutable proof cannot pair one key\'s signature check with another key\'s issuer binding', async () => {
    for (const flipAfter of FLIP_POINTS) {
      // Bob's genuine signature over a manifest naming Alice, with Alice's
      // genuine proof (over a different manifest) shown on some reads.
      const id = newAssetId();
      const bobSigned = signedManifest(id, ALICE, BOB_KEYS);
      const aliceProof = signedManifest(newAssetId(), ALICE, ALICE_KEYS).proof;
      const { value } = flipping(bobSigned, 'proof', bobSigned.proof, aliceProof, flipAfter);
      const { result } = await settle(
        run({ operation: 'verify-signed-manifest', signedManifest: value }, { resolver: registryResolver() }),
      );
      expect(result === undefined ? undefined : manifestReport(result)?.valid).not.toBe(true);
    }
  });

  it('throwing getters anywhere in the input fail closed: no valid result, no leaked detail, no thrown fault', async () => {
    const manifest = signedManifest();
    const claim = signedClaim();
    const cases: Array<SovereigntyCapabilityInvocation<VerifiabilitySovereigntyCapabilityInput>> = [
      invocationOf({ operation: 'verify-signed-manifest', signedManifest: throwingAt(manifest, 'manifest') }),
      invocationOf({ operation: 'verify-signed-manifest', signedManifest: throwingAt(manifest, 'manifestDigest') }),
      invocationOf({ operation: 'verify-signed-manifest', signedManifest: throwingAt(manifest, 'proof') }),
      invocationOf({ operation: 'verify-signed-manifest', signedManifest: { ...manifest, proof: throwingAt(manifest.proof, 'publicKey') } }),
      invocationOf({ operation: 'verify-signed-claim', signedClaim: throwingAt(claim, 'claim') }),
      invocationOf({ operation: 'verify-signed-claim', signedClaim: throwingAt(claim, 'digest') }),
      invocationOf({ operation: 'verify-signed-claim', signedClaim: { ...claim, claim: throwingAt(claim.claim, 'subject') } }),
      invocationOf(throwingAt({ operation: 'verify-signed-claim', signedClaim: claim }, 'signedClaim') as VerifiabilitySovereigntyCapabilityInput),
      invocationOf(throwingAt({ operation: 'verify-signed-claim', signedClaim: claim }, 'operation') as VerifiabilitySovereigntyCapabilityInput),
      throwingAt(invocationOf({ operation: 'verify-signed-claim', signedClaim: claim }), 'input'),
      throwingAt(invocationOf({ operation: 'verify-signed-claim', signedClaim: claim }, subjectOf(newAssetId())), 'subject'),
    ];
    for (const invocation of cases) {
      const { result, thrown } = await settle(invoke(invocation, registryResolver()));
      if (thrown !== undefined) {
        // A rejected envelope is a typed rejection, never an implementation fault.
        expect((thrown as { code?: string }).code).toBe('SOVEREIGNTY_CAPABILITY_INVOCATION_REJECTED');
        continue;
      }
      const report = result === undefined ? undefined : (manifestReport(result) ?? claimReport(result));
      expect(report?.valid).not.toBe(true);
      expect(JSON.stringify(result)).not.toContain('secret-internal-detail');
    }
  });

  it('invalid manifest and claim structures are reported as invalid, attributed to their own subject', async () => {
    const id = newAssetId();
    const manifest = manifestFor(id, ALICE);
    const malformed = { ...manifest, state: 'not-a-state' } as unknown as typeof manifest;
    // `signSovereignManifest` refuses to sign it, so it is signed with the low-level primitive.
    const proof = signSovereignPayload(malformed, ALICE_KEYS.privateKeyPem, ALICE_KEYS.signingKey, SIGNED_AT);
    const signedMalformed: SignedSovereignManifest = { manifest: malformed, manifestDigest: proof.payloadHash, proof };
    const manifestResult = await run({ operation: 'verify-signed-manifest', signedManifest: signedMalformed });
    const manifestCheck = manifestReport(manifestResult);
    expect(manifestCheck?.checks.manifestStructure).toBe('invalid');
    expect(manifestCheck?.checks.signature).toBe('valid');
    expect(manifestCheck?.valid).toBe(false);
    expect(manifestResult.evidence.subject).toEqual(subjectOf(id));

    const claim = { ...claimFor(id, ALICE), subject: 'not-a-sovereign-asset-id' } as unknown as VerifiableSovereignClaim;
    const signedMalformedClaim = signClaim(claim, ALICE_KEYS.privateKeyPem, ALICE_KEYS.signingKey, SIGNED_AT);
    const claimResult = await run({ operation: 'verify-signed-claim', signedClaim: signedMalformedClaim });
    const claimCheck = claimReport(claimResult);
    expect(claimCheck?.checks.claimStructure).toBe('invalid');
    expect(claimCheck?.checks.signature).toBe('valid');
    expect(claimCheck?.valid).toBe(false);
    // A malformed claim subject is never turned into an attributed subject.
    expect(claimResult.evidence.subject).toBeUndefined();
  });

  it('a claim that cannot be canonicalized fails closed through the capsule, attributed to its own subject', async () => {
    const id = newAssetId();
    const signed = signedClaim(id);
    const uncanonicalizable = { ...signed, claim: { ...signed.claim, issuedAt: Number.NaN } } as unknown as SignedClaim<VerifiableSovereignClaim>;
    const result = await run({ operation: 'verify-signed-claim', signedClaim: uncanonicalizable }, { resolver: registryResolver() });
    expect(claimReport(result)).toEqual({
      valid: false,
      checks: { claimStructure: 'invalid', claimDigest: 'invalid', signature: 'invalid', issuerBinding: 'not_performed' },
      reasons: [CODES.payloadNotCanonicalizable],
    });
    expect(result.evidence.subject).toEqual({ sovereignAssetId: id });
  });

  it('the capsule enforces the invariant when invoked directly, without the common socket', async () => {
    for (const flipAfter of FLIP_POINTS) {
      const genuineId = newAssetId();
      const victimId = newAssetId();
      const genuine = signedClaim(genuineId);
      const forged = { ...genuine.claim, subject: victimId };
      const { value } = flipping(genuine, 'claim', forged, genuine.claim, flipAfter);
      const subject = flipping({ v: 0 }, 'v', subjectOf(victimId), subjectOf(genuineId), flipAfter);
      const invocation = { ...invocationOf({ operation: 'verify-signed-claim', signedClaim: value }) };
      Object.defineProperty(invocation, 'subject', { enumerable: true, get: () => subject.value.v });
      const outcome = await implementation().invoke(invocation);
      if (outcome.status !== 'succeeded' || outcome.output.operation !== 'verify-signed-claim') continue;
      if (!outcome.output.verification.valid) continue;
      expect(outcome.subject?.sovereignAssetId).toBe(genuineId);
    }
  });

  it('an invalid or unreadable invocation subject passed directly to the capsule is rejected', async () => {
    const claim = signedClaim();
    const invalid = { ...invocationOf({ operation: 'verify-signed-claim', signedClaim: claim }), subject: { sovereignAssetId: 'nope' } };
    const outcome = await implementation().invoke(invalid as unknown as SovereigntyCapabilityInvocation<VerifiabilitySovereigntyCapabilityInput>);
    expect(outcome).toEqual({ status: 'failed', reasonCodes: [CODES.invalidInput] });
  });

  it('a payload whose canonical text is not JSON (an array with holes) fails closed instead of throwing', async () => {
    // eslint-disable-next-line no-sparse-arrays
    const holes = [1, , 2];
    const id = newAssetId();
    const manifest = signedManifest(id);
    const sparseManifest = { ...manifest, manifest: { ...manifest.manifest, authorityClaims: holes } } as unknown as SignedSovereignManifest;
    const manifestResult = await run({ operation: 'verify-signed-manifest', signedManifest: sparseManifest });
    expect(manifestReport(manifestResult)?.reasons).toEqual([CODES.payloadNotCanonicalizable]);

    const claim = signedClaim(id);
    const sparseClaim = { ...claim, claim: { ...claim.claim, metadata: holes } } as unknown as SignedClaim<VerifiableSovereignClaim>;
    const claimResult = await run({ operation: 'verify-signed-claim', signedClaim: sparseClaim });
    expect(claimReport(claimResult)?.reasons).toEqual([CODES.payloadNotCanonicalizable]);

    // The public verifiers report invalid rather than throwing.
    await expect(verifySovereignManifest(sparseManifest)).resolves.toMatchObject({ valid: false });
    await expect(verifySignedSovereignClaim(sparseClaim)).resolves.toMatchObject({ valid: false });
  });
});
