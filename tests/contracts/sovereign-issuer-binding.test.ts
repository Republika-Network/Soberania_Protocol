import { createHash, createPublicKey, generateKeyPairSync } from 'node:crypto';

import { mintSovereignAssetId, computeContentIdentity } from '@aoc/protocol/identity';
import {
  buildOriginClaim,
  buildSovereignManifestV1,
  generateSovereignKeyPair,
  signClaim,
  signSovereignManifest,
  signSovereignPayload,
  verifySignedSovereignClaim,
  verifySovereignManifest,
  verifySovereignSignature,
} from '@aoc/protocol/manifest';
import type { SovereignKeyPair, SovereignSigningKey } from '@aoc/protocol/manifest';
import type { VerificationKeyDescriptor, VerificationKeyResolver } from '@aoc/protocol/adapters';

// SOBE-SEC-01 — issuer binding must be cryptographic: a keyId string match
// alone never establishes that a principal's key produced a signature.

const ALICE = 'principal:alice';
const alice = generateSovereignKeyPair();
const mallory = generateSovereignKeyPair();

function resolverReturning(descriptor: VerificationKeyDescriptor | undefined): VerificationKeyResolver {
  return { resolveVerificationKey: async () => descriptor };
}

/** The trusted registry's view: Alice's key is `alice.signingKey.keyId`. */
const aliceResolver: VerificationKeyResolver = {
  resolveVerificationKey: async (issuer) =>
    issuer === ALICE ? { keyId: alice.signingKey.keyId, issuer } : undefined,
};

function aliceJwk(pair: SovereignKeyPair = alice): Record<string, unknown> {
  return generateJwk(pair.signingKey.publicKey);
}

function generateJwk(publicKeyPem: string): Record<string, unknown> {
  return createPublicKey(publicKeyPem).export({ format: 'jwk' }) as Record<string, unknown>;
}

function manifestFor(registrant: string) {
  return buildSovereignManifestV1({
    sovereignAssetId: mintSovereignAssetId(),
    contentIdentity: computeContentIdentity(new TextEncoder().encode('sobe-sec-01')),
    registrant,
  });
}

function originClaimFor(issuer: string) {
  return buildOriginClaim({
    id: 'claim:sobe-sec-01-origin',
    sovereignAssetId: mintSovereignAssetId(),
    issuer,
    assertedOrigin: 'issuer-binding regression fixture',
    assertedAt: '2026-04-01T09:00:00.000Z',
  });
}

/** Attacker B's key presented under victim A's keyId (the R1 reproduction). */
const keyIdSubstitutedMallory: SovereignSigningKey = { ...mallory.signingKey, keyId: alice.signingKey.keyId };

describe('SOBE-SEC-01 — key identity convention', () => {
  it('generated key ids are the SHA-256 of the exact SPKI PEM text (unchanged convention)', () => {
    const pair = generateSovereignKeyPair();
    expect(pair.signingKey.keyId).toBe(createHash('sha256').update(pair.signingKey.publicKey).digest('hex'));
  });
});

describe('SOBE-SEC-01 — manifest issuer binding', () => {
  it('R1-CTRL: a manifest signed by the registered key is issuer-verified', async () => {
    const signed = signSovereignManifest(manifestFor(ALICE), alice.privateKeyPem, alice.signingKey);
    const result = await verifySovereignManifest(signed, { verificationKeyResolver: aliceResolver });
    expect(result.checks.signature).toBe('valid');
    expect(result.checks.issuerBinding).toBe('verified');
    expect(result.valid).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("R1-1: an attacker key carrying the registered issuer's keyId is never issuer-verified", async () => {
    const signed = signSovereignManifest(manifestFor(ALICE), mallory.privateKeyPem, keyIdSubstitutedMallory);
    const result = await verifySovereignManifest(signed, { verificationKeyResolver: aliceResolver });
    // The attacker's signature is cryptographically valid for the attacker's key...
    expect(result.checks.signature).toBe('valid');
    // ...but it does not bind to Alice.
    expect(result.checks.issuerBinding).toBe('unverified');
    expect(result.valid).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining(['ISSUER_BINDING_UNVERIFIED', 'ISSUER_BINDING_KEY_ID_NOT_DERIVED']),
    );
  });

  it("R1-1 (JWK variant): attacker key is rejected when the descriptor carries the issuer's JWK", async () => {
    const signed = signSovereignManifest(manifestFor(ALICE), mallory.privateKeyPem, keyIdSubstitutedMallory);
    const resolver = resolverReturning({ keyId: alice.signingKey.keyId, issuer: ALICE, publicKeyJwk: aliceJwk() });
    const result = await verifySovereignManifest(signed, { verificationKeyResolver: resolver });
    expect(result.checks.issuerBinding).toBe('unverified');
    expect(result.valid).toBe(false);
  });

  it('accepts a descriptor whose JWK is the signing key', async () => {
    const signed = signSovereignManifest(manifestFor(ALICE), alice.privateKeyPem, alice.signingKey);
    const resolver = resolverReturning({
      keyId: alice.signingKey.keyId,
      issuer: ALICE,
      algorithm: 'ed25519',
      publicKeyJwk: aliceJwk(),
    });
    const result = await verifySovereignManifest(signed, { verificationKeyResolver: resolver });
    expect(result.checks.issuerBinding).toBe('verified');
    expect(result.valid).toBe(true);
  });

  it('rejects a descriptor whose JWK is a different key than the signing key (mismatched JWK)', async () => {
    const signed = signSovereignManifest(manifestFor(ALICE), alice.privateKeyPem, alice.signingKey);
    const resolver = resolverReturning({
      keyId: alice.signingKey.keyId,
      issuer: ALICE,
      publicKeyJwk: aliceJwk(mallory),
    });
    const result = await verifySovereignManifest(signed, { verificationKeyResolver: resolver });
    expect(result.checks.issuerBinding).toBe('unverified');
    expect(result.valid).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining(['ISSUER_BINDING_UNVERIFIED', 'ISSUER_BINDING_KEY_MISMATCH']),
    );
  });

  it.each([
    ['RSA JWK', { kty: 'RSA', n: 'AQAB', e: 'AQAB' }],
    ['X25519 (wrong curve)', { kty: 'OKP', crv: 'X25519', x: 'AAAA' }],
    ['malformed OKP (no x)', { kty: 'OKP', crv: 'Ed25519' }],
    ['private JWK (carries d)', { ...generateJwk(alice.signingKey.publicKey), d: 'AAAA' }],
  ])('rejects an unsupported descriptor JWK: %s', async (_label, jwk) => {
    const signed = signSovereignManifest(manifestFor(ALICE), alice.privateKeyPem, alice.signingKey);
    const resolver = resolverReturning({ keyId: alice.signingKey.keyId, issuer: ALICE, publicKeyJwk: jwk });
    const result = await verifySovereignManifest(signed, { verificationKeyResolver: resolver });
    expect(result.checks.issuerBinding).toBe('unverified');
    expect(result.valid).toBe(false);
    expect(result.reasons).toContain('ISSUER_BINDING_JWK_UNSUPPORTED');
  });

  it('rejects a descriptor that declares an unsupported algorithm', async () => {
    const signed = signSovereignManifest(manifestFor(ALICE), alice.privateKeyPem, alice.signingKey);
    const resolver = resolverReturning({ keyId: alice.signingKey.keyId, issuer: ALICE, algorithm: 'rsa-sha256' });
    const result = await verifySovereignManifest(signed, { verificationKeyResolver: resolver });
    expect(result.checks.issuerBinding).toBe('unverified');
    expect(result.reasons).toContain('ISSUER_BINDING_ALGORITHM_UNSUPPORTED');
  });

  it('rejects a proof whose keyId is not derived from its public key (inconsistent keyId)', async () => {
    // An honest signature, but under a hand-assigned keyId. A keyId the verifier
    // cannot recompute from the key is a self-asserted label, not an identity.
    const handLabelled: SovereignSigningKey = { ...alice.signingKey, keyId: 'key:alice-1' };
    const signed = signSovereignManifest(manifestFor(ALICE), alice.privateKeyPem, handLabelled);
    const resolver = resolverReturning({ keyId: 'key:alice-1', issuer: ALICE });
    const result = await verifySovereignManifest(signed, { verificationKeyResolver: resolver });
    expect(result.checks.signature).toBe('valid');
    expect(result.checks.issuerBinding).toBe('unverified');
    expect(result.reasons).toContain('ISSUER_BINDING_KEY_ID_NOT_DERIVED');
  });

  it('rejects a descriptor bound to a different issuer than the one resolved', async () => {
    const signed = signSovereignManifest(manifestFor(ALICE), alice.privateKeyPem, alice.signingKey);
    const resolver = resolverReturning({ keyId: alice.signingKey.keyId, issuer: 'principal:bob' });
    const result = await verifySovereignManifest(signed, { verificationKeyResolver: resolver });
    expect(result.checks.issuerBinding).toBe('unverified');
    expect(result.reasons).toContain('ISSUER_BINDING_ISSUER_MISMATCH');
  });

  it.each([
    ['missing descriptor', undefined],
    ['descriptor with non-string keyId', { keyId: 42, issuer: ALICE } as unknown as VerificationKeyDescriptor],
    ['empty descriptor object', {} as unknown as VerificationKeyDescriptor],
    ['null descriptor', null as unknown as VerificationKeyDescriptor],
  ])('fails closed on a %s', async (_label, descriptor) => {
    const signed = signSovereignManifest(manifestFor(ALICE), alice.privateKeyPem, alice.signingKey);
    const result = await verifySovereignManifest(signed, { verificationKeyResolver: resolverReturning(descriptor) });
    expect(result.checks.issuerBinding).toBe('unverified');
    expect(result.valid).toBe(false);
    expect(result.reasons).toContain('ISSUER_BINDING_UNVERIFIED');
  });

  it('never reports issuer binding as verified for a proof whose signature does not verify', async () => {
    const signed = signSovereignManifest(manifestFor(ALICE), alice.privateKeyPem, alice.signingKey);
    const tampered = { ...signed, manifest: { ...signed.manifest, registrant: ALICE, manifestVersion: 2 } };
    const result = await verifySovereignManifest(tampered, { verificationKeyResolver: aliceResolver });
    expect(result.checks.signature).toBe('invalid');
    expect(result.checks.issuerBinding).toBe('unverified');
    expect(result.valid).toBe(false);
  });

  it('preserves the documented no-resolver semantics: signature validity is not issuer authenticity', async () => {
    const signed = signSovereignManifest(manifestFor(ALICE), mallory.privateKeyPem, keyIdSubstitutedMallory);
    const result = await verifySovereignManifest(signed);
    expect(result.checks.signature).toBe('valid');
    expect(result.checks.issuerBinding).toBe('not_performed');
  });
});

describe('SOBE-SEC-01 — unsupported key material in proofs', () => {
  it('rejects a non-Ed25519 (P-256) key labelled as ed25519', async () => {
    const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const ecPublicPem = ec.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const ecPrivatePem = ec.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const mislabelled: SovereignSigningKey = {
      keyId: createHash('sha256').update(ecPublicPem).digest('hex'),
      algorithm: 'ed25519',
      publicKey: ecPublicPem,
    };
    const signed = signSovereignManifest(manifestFor(ALICE), ecPrivatePem, mislabelled);
    const result = await verifySovereignManifest(signed, {
      verificationKeyResolver: resolverReturning({ keyId: mislabelled.keyId, issuer: ALICE }),
    });
    expect(result.checks.signature).toBe('invalid');
    expect(result.checks.issuerBinding).toBe('unverified');
    expect(result.valid).toBe(false);
  });

  it('rejects private-key PEM material presented in the proof publicKey field', async () => {
    const leaky: SovereignSigningKey = {
      keyId: createHash('sha256').update(alice.privateKeyPem).digest('hex'),
      algorithm: 'ed25519',
      publicKey: alice.privateKeyPem,
    };
    const signed = signSovereignManifest(manifestFor(ALICE), alice.privateKeyPem, leaky);
    const result = await verifySovereignManifest(signed);
    expect(result.checks.signature).toBe('invalid');
    expect(result.valid).toBe(false);
  });
});

describe('SOBE-SEC-01 — claim issuer binding follows the same invariant', () => {
  it('R1-CTRL (claim): a claim signed by the registered key is issuer-verified', async () => {
    const signed = signClaim(originClaimFor(ALICE), alice.privateKeyPem, alice.signingKey);
    const result = await verifySignedSovereignClaim(signed, { verificationKeyResolver: aliceResolver });
    expect(result.checks.issuerBinding).toBe('verified');
    expect(result.valid).toBe(true);
  });

  it("R1-2: an attacker key carrying the registered issuer's keyId is never issuer-verified", async () => {
    const signed = signClaim(originClaimFor(ALICE), mallory.privateKeyPem, keyIdSubstitutedMallory);
    const result = await verifySignedSovereignClaim(signed, { verificationKeyResolver: aliceResolver });
    expect(result.checks.signature).toBe('valid');
    expect(result.checks.issuerBinding).toBe('unverified');
    expect(result.valid).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining(['ISSUER_BINDING_UNVERIFIED', 'ISSUER_BINDING_KEY_ID_NOT_DERIVED']),
    );
  });

  it('rejects a claim whose descriptor JWK does not match the signing key', async () => {
    const signed = signClaim(originClaimFor(ALICE), alice.privateKeyPem, alice.signingKey);
    const resolver = resolverReturning({ keyId: alice.signingKey.keyId, issuer: ALICE, publicKeyJwk: aliceJwk(mallory) });
    const result = await verifySignedSovereignClaim(signed, { verificationKeyResolver: resolver });
    expect(result.checks.issuerBinding).toBe('unverified');
    expect(result.reasons).toContain('ISSUER_BINDING_KEY_MISMATCH');
  });
});

// ---------------------------------------------------------------------------
// SOBE-SEC-01.1 — every check must examine one snapshot of the input (F1),
// and a public key must have exactly one accepted encoding (F2).
// ---------------------------------------------------------------------------

/** A copy of `proof` whose listed fields answer from `sequence`, one entry per read (last entry repeats). */
function proofWithMutableFields<T extends object>(proof: T, sequences: Record<string, string[]>) {
  const reads: Record<string, number> = {};
  const copy = { ...proof } as Record<string, unknown>;
  for (const [field, sequence] of Object.entries(sequences)) {
    reads[field] = 0;
    Object.defineProperty(copy, field, {
      enumerable: true,
      get() {
        const value = sequence[Math.min(reads[field], sequence.length - 1)];
        reads[field] += 1;
        return value;
      },
    });
  }
  return { proof: copy as unknown as T, reads };
}

describe('SOBE-SEC-01.1 — single-read verification snapshot (F1)', () => {
  it('a proof whose getter shows a different public key on later reads is not issuer-verified', async () => {
    const real = signSovereignManifest(manifestFor(ALICE), mallory.privateKeyPem, mallory.signingKey);
    const { proof, reads } = proofWithMutableFields(real.proof, {
      publicKey: [mallory.signingKey.publicKey, alice.signingKey.publicKey],
      keyId: [alice.signingKey.keyId],
    });
    const result = await verifySovereignManifest({ ...real, proof }, { verificationKeyResolver: aliceResolver });
    expect(result.checks.issuerBinding).not.toBe('verified');
    expect(result.valid).toBe(false);
    expect(reads.publicKey).toBe(1);
  });

  it('a proxy-backed proof cannot answer the signature check and issuer binding differently', async () => {
    const real = signSovereignManifest(manifestFor(ALICE), mallory.privateKeyPem, mallory.signingKey);
    let publicKeyReads = 0;
    const proxy = new Proxy(real.proof, {
      get(target, property, receiver) {
        if (property === 'publicKey') {
          publicKeyReads += 1;
          return publicKeyReads === 1 ? mallory.signingKey.publicKey : alice.signingKey.publicKey;
        }
        if (property === 'keyId') return alice.signingKey.keyId;
        return Reflect.get(target, property, receiver);
      },
    });
    const result = await verifySovereignManifest({ ...real, proof: proxy }, { verificationKeyResolver: aliceResolver });
    expect(result.checks.issuerBinding).not.toBe('verified');
    expect(result.valid).toBe(false);
    expect(publicKeyReads).toBe(1);
  });

  it('a keyId that changes across reads cannot pass the derivation check and then match the registered key', async () => {
    // Honest Mallory proof; keyId first reads as Mallory's own (derivable), then as Alice's (registered).
    const real = signSovereignManifest(manifestFor(ALICE), mallory.privateKeyPem, mallory.signingKey);
    const { proof, reads } = proofWithMutableFields(real.proof, {
      keyId: [mallory.signingKey.keyId, alice.signingKey.keyId],
    });
    const result = await verifySovereignManifest({ ...real, proof }, { verificationKeyResolver: aliceResolver });
    expect(result.checks.issuerBinding).toBe('unverified');
    expect(result.valid).toBe(false);
    expect(reads.keyId).toBe(1);
  });

  it('a signed claim with a mutable proof is not issuer-verified', async () => {
    const real = signClaim(originClaimFor(ALICE), mallory.privateKeyPem, mallory.signingKey);
    const { proof, reads } = proofWithMutableFields(real.proof, {
      publicKey: [mallory.signingKey.publicKey, alice.signingKey.publicKey],
      keyId: [alice.signingKey.keyId],
    });
    const result = await verifySignedSovereignClaim({ ...real, proof }, { verificationKeyResolver: aliceResolver });
    expect(result.checks.issuerBinding).not.toBe('verified');
    expect(result.valid).toBe(false);
    expect(reads.publicKey).toBe(1);
  });

  it('a manifest whose content identity changes after it was digested and signed cannot attest other content', async () => {
    const genuineBytes = new TextEncoder().encode('content alice signed');
    const otherBytes = new TextEncoder().encode('content alice never signed');
    const manifest = buildSovereignManifestV1({
      sovereignAssetId: mintSovereignAssetId(),
      contentIdentity: computeContentIdentity(genuineBytes),
      registrant: ALICE,
    });
    const real = signSovereignManifest(manifest, alice.privateKeyPem, alice.signingKey);
    // Genuine for the reads that digest and sign; the other content's identity afterwards.
    let reads = 0;
    const mutable: Record<string, unknown> = { ...real.manifest };
    Object.defineProperty(mutable, 'contentIdentity', {
      enumerable: true,
      get() {
        reads += 1;
        return reads <= 3 ? real.manifest.contentIdentity : computeContentIdentity(otherBytes);
      },
    });
    const result = await verifySovereignManifest(
      { ...real, manifest: mutable as unknown as typeof real.manifest },
      { contentBytes: otherBytes, verificationKeyResolver: aliceResolver },
    );
    expect(result.checks.contentDigest).toBe('invalid');
    expect(result.valid).toBe(false);
    expect(reads).toBe(1);
  });

  it('fails closed, without throwing, when reading the proof throws', async () => {
    const real = signSovereignManifest(manifestFor(ALICE), alice.privateKeyPem, alice.signingKey);
    const hostile = new Proxy(real.proof, {
      get() {
        throw new Error('hostile proof');
      },
    });
    const result = await verifySovereignManifest({ ...real, proof: hostile }, { verificationKeyResolver: aliceResolver });
    expect(result.valid).toBe(false);
    expect(result.checks.signature).toBe('invalid');
    expect(result.checks.issuerBinding).toBe('unverified');
  });

  it('fails closed, without throwing, when the proof is missing or not made of strings', async () => {
    const real = signSovereignManifest(manifestFor(ALICE), alice.privateKeyPem, alice.signingKey);
    for (const proof of [undefined, null, {}, { ...real.proof, publicKey: 42 }, { ...real.proof, keyId: undefined }]) {
      const result = await verifySovereignManifest(
        { ...real, proof } as unknown as typeof real,
        { verificationKeyResolver: aliceResolver },
      );
      expect(result.valid).toBe(false);
      expect(result.checks.issuerBinding).toBe('unverified');
    }
  });
});

describe('SOBE-SEC-01.1 — exactly one accepted public-key encoding (F2)', () => {
  const payload = { statement: 'sobe-sec-01.1' };

  /** Signs `payload` with `privateKeyPem`, presenting `publicKeyText` (keyId derived from that exact text). */
  function proofPresenting(publicKeyText: string, privateKeyPem: string) {
    return signSovereignPayload(payload, privateKeyPem, {
      keyId: createHash('sha256').update(publicKeyText).digest('hex'),
      algorithm: 'ed25519',
      publicKey: publicKeyText,
    });
  }

  it('accepts a valid Ed25519 key in its canonical SPKI PEM encoding', () => {
    expect(verifySovereignSignature(payload, proofPresenting(alice.signingKey.publicKey, alice.privateKeyPem))).toBe(true);
  });

  it.each([
    ['Ed448', 'ed448'],
    ['P-256', 'ec'],
  ] as const)('rejects a %s key mislabelled as ed25519', (_label, type) => {
    const pair = type === 'ec' ? generateKeyPairSync('ec', { namedCurve: 'P-256' }) : generateKeyPairSync('ed448');
    const publicPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const privatePem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    expect(verifySovereignSignature(payload, proofPresenting(publicPem, privatePem))).toBe(false);
  });

  const pem = alice.signingKey.publicKey;
  it.each([
    ['public PEM followed by private-key PEM', pem + alice.privateKeyPem],
    ['public PEM followed by arbitrary text', pem + 'trailing junk'],
    ['an extra, different PEM block', pem + mallory.signingKey.publicKey],
    ['the same PEM block twice', pem + pem],
    ['CRLF-converted PEM', pem.replace(/\n/g, '\r\n')],
    ['leading whitespace', `  \n${pem}`],
    ['an extra trailing newline', `${pem}\n`],
  ])('rejects %s', (_label, text) => {
    // Every variant parses to Alice's real key and carries her real signature:
    // only the encoding differs, and only the canonical encoding is accepted.
    expect(createPublicKey(text).export({ type: 'spki', format: 'pem' })).toBe(pem);
    expect(verifySovereignSignature(payload, proofPresenting(text, alice.privateKeyPem))).toBe(false);
  });

  it('a non-canonical encoding of the issuer key cannot be issuer-verified', async () => {
    const appended = pem + alice.privateKeyPem;
    const variantKey: SovereignSigningKey = {
      keyId: createHash('sha256').update(appended).digest('hex'),
      algorithm: 'ed25519',
      publicKey: appended,
    };
    const signed = signSovereignManifest(manifestFor(ALICE), alice.privateKeyPem, variantKey);
    const result = await verifySovereignManifest(signed, {
      verificationKeyResolver: resolverReturning({ keyId: variantKey.keyId, issuer: ALICE }),
    });
    expect(result.checks.signature).toBe('invalid');
    expect(result.checks.issuerBinding).toBe('unverified');
  });
});

describe('SOBE-SEC-01.1 — descriptor and claim-path coverage', () => {
  it("rejects an attacker's honestly derived keyId against the registered issuer's descriptor", async () => {
    const signed = signSovereignManifest(manifestFor(ALICE), mallory.privateKeyPem, mallory.signingKey);
    const result = await verifySovereignManifest(signed, { verificationKeyResolver: aliceResolver });
    expect(result.checks.signature).toBe('valid');
    expect(result.checks.issuerBinding).toBe('unverified');
    expect(result.reasons).toContain('ISSUER_BINDING_KEY_ID_MISMATCH');
  });

  it('claim path: rejects a keyId that is not derived from the signing key', async () => {
    const handLabelled: SovereignSigningKey = { ...alice.signingKey, keyId: 'key:alice-1' };
    const signed = signClaim(originClaimFor(ALICE), alice.privateKeyPem, handLabelled);
    const result = await verifySignedSovereignClaim(signed, {
      verificationKeyResolver: resolverReturning({ keyId: 'key:alice-1', issuer: ALICE }),
    });
    expect(result.checks.issuerBinding).toBe('unverified');
    expect(result.reasons).toContain('ISSUER_BINDING_KEY_ID_NOT_DERIVED');
  });

  it('claim path: rejects a descriptor bound to a different issuer', async () => {
    const signed = signClaim(originClaimFor(ALICE), alice.privateKeyPem, alice.signingKey);
    const result = await verifySignedSovereignClaim(signed, {
      verificationKeyResolver: resolverReturning({ keyId: alice.signingKey.keyId, issuer: 'principal:bob' }),
    });
    expect(result.checks.issuerBinding).toBe('unverified');
    expect(result.reasons).toContain('ISSUER_BINDING_ISSUER_MISMATCH');
  });

  it('accepts an equivalent JWK carrying extra public members and a capitalised algorithm name', async () => {
    const signed = signSovereignManifest(manifestFor(ALICE), alice.privateKeyPem, alice.signingKey);
    const result = await verifySovereignManifest(signed, {
      verificationKeyResolver: resolverReturning({
        keyId: alice.signingKey.keyId,
        issuer: ALICE,
        algorithm: 'Ed25519',
        publicKeyJwk: { ...aliceJwk(), kid: alice.signingKey.keyId, alg: 'EdDSA', use: 'sig' },
      }),
    });
    expect(result.checks.issuerBinding).toBe('verified');
    expect(result.valid).toBe(true);
  });

  it('legitimate manifests and claims still verify after a JSON round trip', async () => {
    const manifest = JSON.parse(JSON.stringify(signSovereignManifest(manifestFor(ALICE), alice.privateKeyPem, alice.signingKey)));
    const claim = JSON.parse(JSON.stringify(signClaim(originClaimFor(ALICE), alice.privateKeyPem, alice.signingKey)));
    const manifestResult = await verifySovereignManifest(manifest, { verificationKeyResolver: aliceResolver });
    const claimResult = await verifySignedSovereignClaim(claim, { verificationKeyResolver: aliceResolver });
    expect(manifestResult.valid).toBe(true);
    expect(manifestResult.checks.issuerBinding).toBe('verified');
    expect(claimResult.valid).toBe(true);
    expect(claimResult.checks.issuerBinding).toBe('verified');
  });
});
