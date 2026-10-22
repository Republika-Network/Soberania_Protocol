/**
 * Crypto integration tests (AOC Protocol Slice 0 / SAP-GAP-010).
 *
 * Proves that canonicalize -> hash -> sign are all backed by the single
 * authoritative canonicalization implementation: a payload canonicalizes
 * to the exact same bytes whether invoked directly, through the hashing
 * path (stableHash), or through the signing path (signPayload), and that
 * sign/verify remains correct (including failing closed on mutation and
 * on canonicalization-unsupported input).
 */
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  stableHash,
  signPayload,
  verifyPayloadSignature,
  createRuntimeAuthority,
  createTrustedKeySet,
} from '../engine';
import { canonicalizeJSON } from '../canonicalize';

const representativePayload = {
  subject: 'aoc://content/object/v1/0/0xabc123',
  scope: [{ type: 'field', ref: 'legal-full-name' }],
  issuedAt: '2024-01-01T00:00:00.000Z',
  amount: 12.5,
  metadata: { nested: true, tags: ['a', 'b'] },
};

describe('canonicalize -> hash -> sign use identical bytes', () => {
  it('produces the same canonical string whether invoked directly or via canonicalSerialize', () => {
    expect(canonicalSerialize(representativePayload)).toBe(canonicalizeJSON(representativePayload));
  });

  it('stableHash hashes exactly the bytes canonicalizeJSON produces', () => {
    const expectedHash = createHash('sha256')
      .update(canonicalizeJSON(representativePayload))
      .digest('base64url');

    expect(stableHash(representativePayload)).toBe(expectedHash);
  });

  it('stableHash is deterministic and order-independent across repeated calls', () => {
    const reordered = {
      metadata: representativePayload.metadata,
      amount: representativePayload.amount,
      issuedAt: representativePayload.issuedAt,
      scope: representativePayload.scope,
      subject: representativePayload.subject,
    };

    expect(stableHash(representativePayload)).toBe(stableHash(reordered));
  });

  it('signPayload embeds a payloadHash equal to stableHash(payload)', () => {
    const { identity, privateKey } = createRuntimeAuthority('runtime-1', 'issuer-1');
    const signature = signPayload(representativePayload, privateKey, identity, {
      runtimeSource: 'test-suite',
      timestamp: '2024-01-01T00:00:00.000Z',
    });

    expect(signature.payloadHash).toBe(stableHash(representativePayload));
  });
});

describe('sign -> verify roundtrip', () => {
  it('verifies a valid signature over the exact signed payload', () => {
    const { identity, privateKey } = createRuntimeAuthority('runtime-1', 'issuer-1');
    const signature = signPayload(representativePayload, privateKey, identity, {
      runtimeSource: 'test-suite',
      timestamp: '2024-01-01T00:00:00.000Z',
    });

    expect(verifyPayloadSignature(representativePayload, signature, createTrustedKeySet([identity]))).toBe(true);
  });

  it('fails verification when the payload is mutated after signing', () => {
    const { identity, privateKey } = createRuntimeAuthority('runtime-1', 'issuer-1');
    const signature = signPayload(representativePayload, privateKey, identity, {
      runtimeSource: 'test-suite',
      timestamp: '2024-01-01T00:00:00.000Z',
    });

    const mutatedPayload = { ...representativePayload, amount: 999 };

    expect(verifyPayloadSignature(mutatedPayload, signature, createTrustedKeySet([identity]))).toBe(false);
  });

  it('fails verification when the signature bytes are tampered with', () => {
    const { identity, privateKey } = createRuntimeAuthority('runtime-1', 'issuer-1');
    const signature = signPayload(representativePayload, privateKey, identity, {
      runtimeSource: 'test-suite',
      timestamp: '2024-01-01T00:00:00.000Z',
    });

    const buffer = Buffer.from(signature.signature, 'base64url');
    buffer[0] = buffer[0] ^ 0xff;
    const tampered = { ...signature, signature: buffer.toString('base64url') };

    expect(verifyPayloadSignature(representativePayload, tampered, createTrustedKeySet([identity]))).toBe(false);
  });

  it('fails verification when reordering keys does not change the payload but payloadHash was tampered with', () => {
    const { identity, privateKey } = createRuntimeAuthority('runtime-1', 'issuer-1');
    const signature = signPayload(representativePayload, privateKey, identity, {
      runtimeSource: 'test-suite',
      timestamp: '2024-01-01T00:00:00.000Z',
    });

    const tampered = { ...signature, payloadHash: `${signature.payloadHash.slice(0, -1)}0` };

    expect(verifyPayloadSignature(representativePayload, tampered, createTrustedKeySet([identity]))).toBe(false);
  });
});

describe('canonicalization negative propagation into hashing/signing', () => {
  it('stableHash fails deterministically instead of silently hashing dropped/undefined data', () => {
    expect(() => stableHash({ subject: 'x', optional: undefined })).toThrow(
      'Unsupported type in canonical JSON: undefined'
    );
  });

  it('stableHash fails deterministically on non-finite numeric input instead of silently hashing null', () => {
    expect(() => stableHash({ amount: NaN })).toThrow(
      'Non-finite numbers are not supported in canonical JSON'
    );
  });

  it('signPayload fails deterministically rather than signing ambiguous canonicalized bytes', () => {
    const { identity, privateKey } = createRuntimeAuthority('runtime-1', 'issuer-1');
    expect(() =>
      signPayload({ subject: 'x', optional: undefined }, privateKey, identity, {
        runtimeSource: 'test-suite',
        timestamp: '2024-01-01T00:00:00.000Z',
      })
    ).toThrow('Unsupported type in canonical JSON: undefined');
  });
});
