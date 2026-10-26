import { createHash, createPrivateKey } from 'crypto';
import { createDidKeySigner, type ConsentSubjectSigner } from '../../consent/proof';
import { signConsentObject } from '../../consent/signing';
import type { ConsentObjectV1 } from '../../consent/types';
import { signConsentRecord } from '../../protocol/consent/consent-record-proof';
import type { ConsentRecord } from '../../protocol/consent/types';
import { signPackManifest } from '../../pack/signing';
import type { PackManifestV1 } from '../../pack/types';

// PKCS#8 DER prefix of an Ed25519 private key; the 32-byte seed follows it.
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

const signersByDid = new Map<string, ConsentSubjectSigner>();

/**
 * A deterministic did:key subject for tests. The same label always yields the
 * same key, so fixtures and snapshots stay stable.
 */
export function testSubjectSigner(label: string): ConsentSubjectSigner {
  const seed = createHash('sha256').update(`aoc-test-subject:${label}`).digest();
  const signer = createDidKeySigner(
    createPrivateKey({ key: Buffer.concat([ED25519_PKCS8_PREFIX, seed]), format: 'der', type: 'pkcs8' })
  );
  signersByDid.set(signer.did, signer);
  return signer;
}

/** Signs the consent as its subject, when the subject is a known test signer. */
export function signTestConsent<T extends ConsentObjectV1>(consent: T): T {
  const signer = signersByDid.get(consent.subject);
  return signer ? (signConsentObject(consent, signer) as T) : consent;
}

/** Signs the consent record as its subject, when the subject is a known test signer. */
export function signTestConsentRecord<T extends ConsentRecord>(record: T): T {
  const signer = signersByDid.get(record.subject_id);
  return signer ? (signConsentRecord(record, signer) as T) : record;
}

/** Signs the pack manifest as its subject, when the subject is a known test signer. */
export function signTestPack<T extends PackManifestV1>(pack: T): T {
  const signer = signersByDid.get(pack.subject);
  return signer ? (signPackManifest(pack, signer) as T) : pack;
}
