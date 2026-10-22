/**
 * verifyPayloadSignature verifies only against independently configured keys.
 *
 * A signature envelope names its signer and carries a public key, but neither
 * is evidence of who signed: anyone can generate a key and fill those fields
 * in. These tests pin that the engine resolves the key from the caller's
 * trusted key set, verifies with that key, and requires every signer identity
 * field in the envelope to equal the configured one.
 */
import {
  createRuntimeAuthority,
  createTrustedKeySet,
  signPayload,
  verifyPayloadSignature,
} from '../engine';
import type { GovernanceSignature, TrustedKeyResolver } from '../types';

const PROVENANCE = { runtimeSource: 'test-suite', timestamp: '2026-01-01T00:00:00.000Z' };
const payload = { action: 'transfer', resource: 'account:1', amount: 10 };

const registered = createRuntimeAuthority('runtime:registered', 'issuer:registered', 'authority:registered');
const outsider = createRuntimeAuthority('runtime:outsider', 'issuer:outsider', 'authority:outsider');
const trusted = createTrustedKeySet([registered.identity]);

const signedByRegistered = (): GovernanceSignature => signPayload(payload, registered.privateKey, registered.identity, PROVENANCE);

/** Signed with the outsider's own key, then labelled with the registered signer's identity. */
const relabelledOutsiderSignature = (overrides: Partial<GovernanceSignature['signer']> = {}): GovernanceSignature => {
  const signature = signPayload(payload, outsider.privateKey, outsider.identity, PROVENANCE);
  return {
    ...signature,
    keyId: registered.identity.keyId,
    signer: { ...registered.identity, publicKey: outsider.identity.publicKey, ...overrides },
  };
};

describe('verifyPayloadSignature with a trusted key set', () => {
  it('accepts a signature from a configured key over the exact payload', () => {
    expect(verifyPayloadSignature(payload, signedByRegistered(), trusted)).toBe(true);
  });

  it('rejects a signature from a key that is not configured, whatever identity it claims', () => {
    const own = signPayload(payload, outsider.privateKey, outsider.identity, PROVENANCE);
    expect(verifyPayloadSignature(payload, own, trusted)).toBe(false);
    expect(verifyPayloadSignature(payload, relabelledOutsiderSignature(), trusted)).toBe(false);
  });

  it('verifies with the configured key, never with the key the envelope carries', () => {
    // The envelope carries the configured public key, but the signature was made by another key.
    const forged = relabelledOutsiderSignature({ publicKey: registered.identity.publicKey });
    expect(verifyPayloadSignature(payload, forged, trusted)).toBe(false);
  });

  it.each(['authorityId', 'issuerId', 'runtimeId', 'keyId', 'publicKey'] as const)(
    'rejects a genuine signature whose envelope relabels signer.%s',
    (field) => {
      const genuine = signedByRegistered();
      const relabelled = { ...genuine, signer: { ...genuine.signer, [field]: `${genuine.signer[field]}-other` } };
      expect(verifyPayloadSignature(payload, relabelled, trusted)).toBe(false);
    },
  );

  it('rejects a genuine signature whose envelope key id names another configured key', () => {
    const second = createRuntimeAuthority('runtime:second', 'issuer:second');
    const both = createTrustedKeySet([registered.identity, second.identity]);
    const genuine = signedByRegistered();
    expect(verifyPayloadSignature(payload, { ...genuine, keyId: second.identity.keyId }, both)).toBe(false);
  });

  it('rejects a mutated payload, a tampered hash and tampered signature bytes', () => {
    const genuine = signedByRegistered();
    expect(verifyPayloadSignature({ ...payload, amount: 11 }, genuine, trusted)).toBe(false);
    expect(verifyPayloadSignature(payload, { ...genuine, payloadHash: `${genuine.payloadHash}x` }, trusted)).toBe(false);
    const bytes = Buffer.from(genuine.signature, 'base64url');
    bytes[0] = bytes[0] ^ 0xff;
    expect(verifyPayloadSignature(payload, { ...genuine, signature: bytes.toString('base64url') }, trusted)).toBe(false);
  });

  it('fails closed without a resolver, with a resolver that knows nothing, and when the resolver throws', () => {
    const genuine = signedByRegistered();
    expect(verifyPayloadSignature(payload, genuine, undefined as unknown as TrustedKeyResolver)).toBe(false);
    expect(verifyPayloadSignature(payload, genuine, { resolveTrustedKey: () => undefined })).toBe(false);
    expect(verifyPayloadSignature(payload, genuine, { resolveTrustedKey: () => { throw new Error('down'); } })).toBe(false);
  });

  it('rejects a resolver answer for a different key id', () => {
    const genuine = signedByRegistered();
    const wrong: TrustedKeyResolver = { resolveTrustedKey: () => ({ ...registered.identity, keyId: 'another-key' }) };
    expect(verifyPayloadSignature(payload, genuine, wrong)).toBe(false);
  });

  it('returns false, rather than throwing, for a payload that cannot be canonicalized', () => {
    expect(verifyPayloadSignature({ value: undefined }, signedByRegistered(), trusted)).toBe(false);
  });

  it('reads each envelope field once, so a getter cannot show one key id to resolution and another later', () => {
    const genuine = signedByRegistered();
    let reads = 0;
    const shifting = { ...genuine } as GovernanceSignature;
    Object.defineProperty(shifting, 'keyId', { get: () => (reads++ === 0 ? genuine.keyId : 'shifted') });
    expect(verifyPayloadSignature(payload, shifting, trusted)).toBe(true);
    expect(reads).toBe(1);
  });
});

describe('createTrustedKeySet', () => {
  it('rejects a key id not derived from the runtime, issuer and public key', () => {
    expect(() => createTrustedKeySet([{ ...registered.identity, issuerId: 'issuer:other' }])).toThrow(/does not match/);
    expect(() => createTrustedKeySet([{ ...registered.identity, publicKey: outsider.identity.publicKey }])).toThrow(/does not match/);
  });

  it('rejects key material that is not canonical Ed25519 SPKI PEM', () => {
    expect(() => createTrustedKeySet([{ ...registered.identity, publicKey: 'not-a-key' }])).toThrow(/canonical Ed25519/);
    expect(() => createTrustedKeySet([{ ...registered.identity, publicKey: registered.identity.publicKey.replace(/\n/g, '\r\n') }])).toThrow(/canonical Ed25519/);
    expect(() => createTrustedKeySet([{ ...registered.identity, publicKey: registered.privateKey }])).toThrow(/canonical Ed25519/);
  });

  it('rejects blank identity fields and duplicate key ids', () => {
    expect(() => createTrustedKeySet([{ ...registered.identity, authorityId: ' ' }])).toThrow(/authorityId/);
    expect(() => createTrustedKeySet([registered.identity, registered.identity])).toThrow(/Duplicate/);
  });

  it('is not affected by later mutation of the configured key objects', () => {
    const configured = { ...registered.identity };
    const set = createTrustedKeySet([configured]);
    configured.publicKey = outsider.identity.publicKey;
    expect(verifyPayloadSignature(payload, signedByRegistered(), set)).toBe(true);
  });
});
