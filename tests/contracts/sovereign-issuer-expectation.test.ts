import type { VerificationKeyDescriptor, VerificationKeyResolver } from '@aoc/protocol/adapters';
import { computeContentIdentity, mintSovereignAssetId } from '@aoc/protocol/identity';
import {
  buildOriginClaim,
  buildSovereignManifestV1,
  computeManifestDigest,
  generateSovereignKeyPair,
  signClaim,
  signSovereignManifest,
  signSovereignPayload,
  verifySignedSovereignClaim,
  verifySovereignManifest,
} from '@aoc/protocol/manifest';
import type { SignedClaim, SignedSovereignManifest, SovereignKeyPair } from '@aoc/protocol/manifest';
import {
  buildSovereigntyCapabilityInvocation,
  createVerifiabilitySovereigntyCapabilityImplementation,
  getSovereigntyCapabilityRefByKey,
  invokeSovereigntyCapability,
} from '@aoc/protocol/sovereignty-capabilities';
import type {
  SovereigntyCapabilityRef,
  VerifiabilitySovereigntyCapabilityInput,
} from '@aoc/protocol/sovereignty-capabilities';

/**
 * SOBE-SEC-01 (N1) — the issuer a binding is verified for is the issuer the
 * signed content names. A caller's expected issuer (`options.issuer`, the
 * capsule's `issuerId`) may narrow that identity but never replace it.
 *
 * Every key pair here is TEST ONLY fixture material. Mallory is a legitimately
 * REGISTERED issuer with her own key: the attack is not key substitution
 * (covered by sovereign-issuer-binding.test.ts) but re-attributing her own
 * signature to an issuer the signed bytes do not name.
 */

const ALICE = 'principal:alice';
const MALLORY = 'principal:mallory';
const AT = '2026-04-01T09:00:00.000Z';

const alice: SovereignKeyPair = generateSovereignKeyPair();
const mallory: SovereignKeyPair = generateSovereignKeyPair();

/** The trusted registry: both principals are registered, each with their own key. */
function registry(calls?: string[]): VerificationKeyResolver {
  const keys: Record<string, string> = { [ALICE]: alice.signingKey.keyId, [MALLORY]: mallory.signingKey.keyId };
  return {
    resolveVerificationKey: async (issuer): Promise<VerificationKeyDescriptor | undefined> => {
      calls?.push(issuer);
      return keys[issuer] === undefined ? undefined : { keyId: keys[issuer] as string, issuer };
    },
  };
}

function manifestNaming(registrant: string | { id: string; kind: 'Organization' }) {
  return buildSovereignManifestV1({
    sovereignAssetId: mintSovereignAssetId(),
    contentIdentity: computeContentIdentity(new TextEncoder().encode('sobe-sec-01-n1')),
    registrant,
    createdAt: AT,
  });
}

function signedManifest(registrant: string | { id: string; kind: 'Organization' }, signer: SovereignKeyPair): SignedSovereignManifest {
  return signSovereignManifest(manifestNaming(registrant), signer.privateKeyPem, signer.signingKey);
}

function claimNaming(issuer: string | { id: string; kind: 'Organization' }) {
  return buildOriginClaim({
    id: 'claim:sobe-sec-01-n1',
    sovereignAssetId: mintSovereignAssetId(),
    issuer,
    assertedOrigin: 'issuer-expectation regression fixture',
    assertedAt: AT,
  });
}

function signedClaim(issuer: string | { id: string; kind: 'Organization' }, signer: SovereignKeyPair): SignedClaim {
  return signClaim(claimNaming(issuer), signer.privateKeyPem, signer.signingKey);
}

/** A signed manifest whose registrant is absent or malformed (signed exactly as given, bypassing the builder). */
function signedRawManifest(manifest: Record<string, unknown>, signer: SovereignKeyPair): SignedSovereignManifest {
  return {
    manifest,
    manifestDigest: computeManifestDigest(manifest as never),
    proof: signSovereignPayload(manifest, signer.privateKeyPem, signer.signingKey),
  } as unknown as SignedSovereignManifest;
}

const VERIFIABILITY_REF = getSovereigntyCapabilityRefByKey('verifiability') as SovereigntyCapabilityRef;

async function capsule(input: VerifiabilitySovereigntyCapabilityInput, resolver: VerificationKeyResolver) {
  const result = await invokeSovereigntyCapability(
    buildSovereigntyCapabilityInvocation({ capability: VERIFIABILITY_REF, input }),
    createVerifiabilitySovereigntyCapabilityImplementation({ verificationKeyResolver: resolver }),
  );
  if (result.status !== 'succeeded') throw new Error(`expected a verification answer, got ${result.reasonCodes.join(', ')}`);
  if (result.output.operation === 'verify-sovereign-proof') throw new Error('wrong operation');
  return result.output.verification;
}

const MISMATCH = ['ISSUER_BINDING_UNVERIFIED', 'ISSUER_BINDING_ISSUER_MISMATCH'];

describe('SOBE-SEC-01 N1 — the original reproductions now fail closed', () => {
  it('library manifest: signed issuer Alice, signed by Mallory, expected issuer Mallory', async () => {
    const calls: string[] = [];
    const result = await verifySovereignManifest(signedManifest(ALICE, mallory), { verificationKeyResolver: registry(calls), issuer: MALLORY });
    expect(result.checks.signature).toBe('valid');
    expect(result.checks.issuerBinding).toBe('unverified');
    expect(result.reasons).toEqual(expect.arrayContaining(MISMATCH));
    expect(result.valid).toBe(false);
    expect(calls).toEqual([]);
  });

  it('library claim: signed issuer Alice, signed by Mallory, expected issuer Mallory', async () => {
    const calls: string[] = [];
    const result = await verifySignedSovereignClaim(signedClaim(ALICE, mallory), { verificationKeyResolver: registry(calls), issuer: MALLORY });
    expect(result.checks.signature).toBe('valid');
    expect(result.checks.issuerBinding).toBe('unverified');
    expect(result.reasons).toEqual(expect.arrayContaining(MISMATCH));
    expect(result.valid).toBe(false);
    expect(calls).toEqual([]);
  });

  it('capsule manifest: issuerId Mallory cannot re-attribute a manifest naming Alice', async () => {
    const calls: string[] = [];
    const verification = await capsule(
      { operation: 'verify-signed-manifest', signedManifest: signedManifest(ALICE, mallory), issuerId: MALLORY },
      registry(calls),
    );
    expect(verification.checks.issuerBinding).toBe('unverified');
    expect(verification.reasons).toEqual(expect.arrayContaining(MISMATCH));
    expect(verification.valid).toBe(false);
    expect(calls).toEqual([]);
  });

  it('capsule claim: issuerId Mallory cannot re-attribute a claim naming Alice', async () => {
    const calls: string[] = [];
    const verification = await capsule(
      { operation: 'verify-signed-claim', signedClaim: signedClaim(ALICE, mallory) as never, issuerId: MALLORY },
      registry(calls),
    );
    expect(verification.checks.issuerBinding).toBe('unverified');
    expect(verification.reasons).toEqual(expect.arrayContaining(MISMATCH));
    expect(verification.valid).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe('SOBE-SEC-01 N1 — expected issuer narrows, never replaces (library and capsule, manifest and claim)', () => {
  type Path = (artifact: 'manifest' | 'claim', named: string, signer: SovereignKeyPair, expected: string | undefined) => Promise<{
    valid: boolean;
    checks: { issuerBinding: string };
    reasons: readonly string[];
  }>;

  const library: Path = async (artifact, named, signer, expected) =>
    artifact === 'manifest'
      ? verifySovereignManifest(signedManifest(named, signer), { verificationKeyResolver: registry(), ...(expected === undefined ? {} : { issuer: expected }) })
      : verifySignedSovereignClaim(signedClaim(named, signer), { verificationKeyResolver: registry(), ...(expected === undefined ? {} : { issuer: expected }) });

  const viaCapsule: Path = async (artifact, named, signer, expected) =>
    capsule(
      artifact === 'manifest'
        ? { operation: 'verify-signed-manifest', signedManifest: signedManifest(named, signer), ...(expected === undefined ? {} : { issuerId: expected }) }
        : { operation: 'verify-signed-claim', signedClaim: signedClaim(named, signer) as never, ...(expected === undefined ? {} : { issuerId: expected }) },
      registry(),
    );

  describe.each([
    ['library', library],
    ['capsule', viaCapsule],
  ] as const)('%s', (_label, path) => {
    describe.each(['manifest', 'claim'] as const)('%s', (artifact) => {
      it('signed issuer Mallory (signed by Mallory), expected issuer Alice → mismatch', async () => {
        const result = await path(artifact, MALLORY, mallory, ALICE);
        expect(result.checks.issuerBinding).toBe('unverified');
        expect(result.reasons).toEqual(expect.arrayContaining(MISMATCH));
        expect(result.valid).toBe(false);
      });

      it('matching signed and expected issuer → verified', async () => {
        const result = await path(artifact, ALICE, alice, ALICE);
        expect(result.checks.issuerBinding).toBe('verified');
        expect(result.valid).toBe(true);
      });

      it('no expected issuer: the signed issuer is resolved and verified', async () => {
        const result = await path(artifact, ALICE, alice, undefined);
        expect(result.checks.issuerBinding).toBe('verified');
        expect(result.valid).toBe(true);
      });

      it('no expected issuer: a signature by another registered issuer does not bind to the named one', async () => {
        const result = await path(artifact, ALICE, mallory, undefined);
        expect(result.checks.issuerBinding).toBe('unverified');
        expect(result.reasons).toContain('ISSUER_BINDING_KEY_ID_MISMATCH');
        expect(result.valid).toBe(false);
      });
    });
  });
});

describe('SOBE-SEC-01 N1 — resolver, malformed and absent issuers', () => {
  it('a resolver that answers for a different issuer than the signed one does not verify', async () => {
    const lying: VerificationKeyResolver = { resolveVerificationKey: async () => ({ keyId: alice.signingKey.keyId, issuer: MALLORY }) };
    const manifest = await verifySovereignManifest(signedManifest(ALICE, alice), { verificationKeyResolver: lying, issuer: ALICE });
    const claim = await verifySignedSovereignClaim(signedClaim(ALICE, alice), { verificationKeyResolver: lying, issuer: ALICE });
    for (const result of [manifest, claim]) {
      expect(result.checks.issuerBinding).toBe('unverified');
      expect(result.reasons).toContain('ISSUER_BINDING_ISSUER_MISMATCH');
      expect(result.valid).toBe(false);
    }
  });

  it.each([
    ['blank', ''],
    ['whitespace', '   '],
    ['a number', 42],
    ['an object', { id: ALICE }],
  ])('an expected issuer that is %s never matches', async (_label, expected) => {
    const options = { verificationKeyResolver: registry(), issuer: expected as unknown as string };
    for (const result of [
      await verifySovereignManifest(signedManifest(ALICE, alice), options),
      await verifySignedSovereignClaim(signedClaim(ALICE, alice), options),
    ]) {
      expect(result.checks.issuerBinding).toBe('unverified');
      expect(result.reasons).toContain('ISSUER_BINDING_ISSUER_MISMATCH');
      expect(result.valid).toBe(false);
    }
  });

  it.each([
    ['absent', (m: Record<string, unknown>) => { delete m.registrant; }],
    ['blank', (m: Record<string, unknown>) => { m.registrant = ''; }],
    ['a number', (m: Record<string, unknown>) => { m.registrant = 7; }],
    ['an object without id', (m: Record<string, unknown>) => { m.registrant = { kind: 'Organization' }; }],
  ])('a signed registrant that is %s cannot be supplied by the caller', async (_label, mutate) => {
    const manifest = { ...manifestNaming(ALICE) } as Record<string, unknown>;
    mutate(manifest);
    const signed = signedRawManifest(manifest, mallory);

    const calls: string[] = [];
    const expected = await verifySovereignManifest(signed, { verificationKeyResolver: registry(calls), issuer: MALLORY });
    expect(expected.checks.issuerBinding).toBe('unverified');
    expect(expected.reasons).toContain('ISSUER_BINDING_ISSUER_MISMATCH');
    expect(expected.valid).toBe(false);
    expect(calls).toEqual([]);

    // Without an expectation nothing is bound and no issuer is claimed. (Whether
    // such a registrant is structurally valid is the manifest validator's
    // concern, not issuer binding's.)
    const unexpected = await verifySovereignManifest(signed, { verificationKeyResolver: registry(calls) });
    expect(unexpected.checks.issuerBinding).toBe('not_performed');
    expect(unexpected.reasons).toContain('ISSUER_BINDING_NOT_PERFORMED_NO_ISSUER');
    expect(calls).toEqual([]);
  });

  it('a principal-reference registrant binds only under its own id', async () => {
    const signed = signedManifest({ id: ALICE, kind: 'Organization' }, alice);
    const matching = await verifySovereignManifest(signed, { verificationKeyResolver: registry(), issuer: ALICE });
    expect(matching.checks.issuerBinding).toBe('verified');
    expect(matching.valid).toBe(true);
    const other = await verifySovereignManifest(signedManifest({ id: ALICE, kind: 'Organization' }, mallory), { verificationKeyResolver: registry(), issuer: MALLORY });
    expect(other.checks.issuerBinding).toBe('unverified');
    expect(other.reasons).toContain('ISSUER_BINDING_ISSUER_MISMATCH');
    // Unchanged default: without an expectation the library resolves only a string registrant.
    const defaulted = await verifySovereignManifest(signed, { verificationKeyResolver: registry() });
    expect(defaulted.checks.issuerBinding).toBe('not_performed');
  });

  it('a principal-reference claim issuer binds only under its own id', async () => {
    const result = await verifySignedSovereignClaim(signedClaim({ id: ALICE, kind: 'Organization' }, mallory), {
      verificationKeyResolver: registry(),
      issuer: MALLORY,
    });
    expect(result.checks.issuerBinding).toBe('unverified');
    expect(result.reasons).toContain('ISSUER_BINDING_ISSUER_MISMATCH');
    expect(result.valid).toBe(false);
  });

  it('without a resolver the expected issuer is unused and nothing is reported as bound', async () => {
    const manifest = await verifySovereignManifest(signedManifest(ALICE, mallory), { issuer: MALLORY });
    const claim = await verifySignedSovereignClaim(signedClaim(ALICE, mallory), { issuer: MALLORY });
    expect(manifest.checks.issuerBinding).toBe('not_performed');
    expect(claim.checks.issuerBinding).toBe('not_performed');
  });
});

describe('SOBE-SEC-01 N1 — round trips and hostile inputs', () => {
  it('a JSON round trip changes nothing: matching verifies, mismatching does not', async () => {
    const roundTrip = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
    const good = await verifySovereignManifest(roundTrip(signedManifest(ALICE, alice)), { verificationKeyResolver: registry(), issuer: ALICE });
    expect(good.checks.issuerBinding).toBe('verified');
    const goodClaim = await verifySignedSovereignClaim(roundTrip(signedClaim(ALICE, alice)), { verificationKeyResolver: registry(), issuer: ALICE });
    expect(goodClaim.checks.issuerBinding).toBe('verified');
    const bad = await verifySovereignManifest(roundTrip(signedManifest(ALICE, mallory)), { verificationKeyResolver: registry(), issuer: MALLORY });
    expect(bad.checks.issuerBinding).toBe('unverified');
    const badClaim = await verifySignedSovereignClaim(roundTrip(signedClaim(ALICE, mallory)), { verificationKeyResolver: registry(), issuer: MALLORY });
    expect(badClaim.checks.issuerBinding).toBe('unverified');
  });

  it('an expected issuer that answers differently on each read is read once and cannot re-attribute', async () => {
    let reads = 0;
    const options = {
      verificationKeyResolver: registry(),
      get issuer() {
        reads += 1;
        return reads === 1 ? MALLORY : ALICE;
      },
    };
    const result = await verifySovereignManifest(signedManifest(ALICE, mallory), options);
    expect(reads).toBe(1);
    expect(result.checks.issuerBinding).toBe('unverified');
    expect(result.valid).toBe(false);
  });

  it('a registrant that answers differently on each read is snapshotted once: no reading pairs Mallory with Alice', async () => {
    const genuine = signedManifest(MALLORY, mallory);
    let reads = 0;
    const flipping = new Proxy(genuine.manifest as unknown as Record<string, unknown>, {
      get(target, key, receiver) {
        if (key === 'registrant') {
          reads += 1;
          return reads === 1 ? MALLORY : ALICE;
        }
        return Reflect.get(target, key, receiver);
      },
    });
    const verify = async (expected: string) => {
      reads = 0;
      const result = await verifySovereignManifest({ ...genuine, manifest: flipping } as unknown as SignedSovereignManifest, {
        verificationKeyResolver: registry(),
        issuer: expected,
      });
      expect(reads).toBe(1);
      return result;
    };
    // The snapshot holds the first reading (Mallory), which is what Mallory signed.
    const asAlice = await verify(ALICE);
    expect(asAlice.checks.issuerBinding).toBe('unverified');
    expect(asAlice.reasons).toContain('ISSUER_BINDING_ISSUER_MISMATCH');
    expect(asAlice.valid).toBe(false);
    const asMallory = await verify(MALLORY);
    expect(asMallory.checks.issuerBinding).toBe('verified');
    expect(asMallory.valid).toBe(true);
  });

  it('a capsule issuerId that answers differently on each read is captured once', async () => {
    let reads = 0;
    const input = {
      operation: 'verify-signed-manifest' as const,
      signedManifest: signedManifest(ALICE, mallory),
      get issuerId() {
        reads += 1;
        return reads === 1 ? MALLORY : ALICE;
      },
    };
    const result = await invokeSovereigntyCapability(
      buildSovereigntyCapabilityInvocation({ capability: VERIFIABILITY_REF, input }),
      createVerifiabilitySovereigntyCapabilityImplementation({ verificationKeyResolver: registry() }),
    );
    if (result.status === 'succeeded' && result.output.operation === 'verify-signed-manifest') {
      expect(result.output.verification.checks.issuerBinding).not.toBe('verified');
      expect(result.output.verification.valid).toBe(false);
    } else {
      expect(result.status).toBe('failed');
    }
  });
});
