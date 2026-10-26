import type { ConsentRevocationRecord, RevocationRegistry } from './registries/RevocationRegistry';

const HASH_HEX_PATTERN = /^[a-f0-9]{64}$/;

function validateHash(value: string, label: string): void {
  if (typeof value !== 'string' || !HASH_HEX_PATTERN.test(value)) {
    throw new Error(`${label} must be a valid 64-character lowercase hex hash.`);
  }
}

function requireRegistry(registry: RevocationRegistry | undefined): RevocationRegistry {
  if (
    !registry ||
    typeof registry.isRevoked !== 'function' ||
    typeof registry.revoke !== 'function' ||
    typeof registry.isConsentRevoked !== 'function' ||
    typeof registry.revokeConsent !== 'function'
  ) {
    throw new Error('A revocation registry is required; there is no implicit default.');
  }
  return registry;
}

/**
 * Operator containment: revokes one capability token by its capability_hash.
 * The consent that issued it is untouched; use revokeConsent for that.
 */
export function revokeCapabilityToken(capabilityHash: string, registry: RevocationRegistry): void {
  validateHash(capabilityHash, 'Revocation target capability_hash');
  requireRegistry(registry).revoke(capabilityHash);
}

/** Whether one capability token was revoked by its hash. Throws without a registry. */
export function isRevoked(capabilityHash: string, registry: RevocationRegistry): boolean {
  return requireRegistry(registry).isRevoked(capabilityHash);
}

/**
 * Records the subject's revocation of a consent. Callers (the vault) verify the
 * signed revoke consent and its bindings before calling this; the record keeps
 * the evidence.
 */
export function revokeConsent(record: ConsentRevocationRecord, registry: RevocationRegistry): void {
  validateHash(record.consent_hash, 'Revoked consent_hash');
  validateHash(record.revocation_consent_hash, 'Revocation consent_hash');
  if (typeof record.subject !== 'string' || record.subject.trim() === '') {
    throw new Error('Consent revocation record must name its subject.');
  }
  if (typeof record.revoked_at !== 'string' || !Number.isFinite(Date.parse(record.revoked_at))) {
    throw new Error('Consent revocation record must carry a parseable revoked_at.');
  }
  requireRegistry(registry).revokeConsent({ ...record });
}

/** Whether a consent was revoked by its subject. Throws without a registry. */
export function isConsentHashRevoked(consentHash: string, registry: RevocationRegistry): boolean {
  return requireRegistry(registry).isConsentRevoked(consentHash);
}

export type RevocationReading =
  | { state: 'clear' }
  | { state: 'revoked_consent' }
  | { state: 'revoked_capability' }
  | { state: 'unavailable'; reason: string };

/**
 * The single revocation question every authorization path asks about a
 * capability and the consent it references. Fails closed: a missing registry, a
 * registry that throws, or a non-boolean answer all read as `unavailable`, which
 * callers must treat as a denial.
 */
export function readRevocation(
  registry: RevocationRegistry | undefined,
  refs: { capability_hash: string; consent_hash: string }
): RevocationReading {
  let source: RevocationRegistry;
  try {
    source = requireRegistry(registry);
  } catch (error) {
    return { state: 'unavailable', reason: (error as Error).message };
  }
  try {
    const consentRevoked = source.isConsentRevoked(refs.consent_hash);
    const capabilityRevoked = source.isRevoked(refs.capability_hash);
    if (typeof consentRevoked !== 'boolean' || typeof capabilityRevoked !== 'boolean') {
      return { state: 'unavailable', reason: 'Revocation registry returned a non-boolean answer.' };
    }
    if (consentRevoked) return { state: 'revoked_consent' };
    if (capabilityRevoked) return { state: 'revoked_capability' };
    return { state: 'clear' };
  } catch (error) {
    return { state: 'unavailable', reason: `Revocation lookup failed: ${(error as Error).message}` };
  }
}
