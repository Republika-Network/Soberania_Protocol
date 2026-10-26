import type { ConsentRevocationRecord, RevocationRegistry } from './RevocationRegistry';

/**
 * Single-process revocation store. Append-only: nothing here un-revokes, and a
 * test that needs a clean state creates a new instance. It is not shared across
 * processes, so a deployment with more than one runtime instance must use a
 * shared store instead (see RevocationRegistry).
 */
export class InMemoryRevocationRegistry implements RevocationRegistry {
  private readonly revokedCapabilities = new Set<string>();
  private readonly revokedConsents = new Map<string, ConsentRevocationRecord>();

  isRevoked(capabilityHash: string): boolean {
    return this.revokedCapabilities.has(capabilityHash);
  }

  revoke(capabilityHash: string): void {
    this.revokedCapabilities.add(capabilityHash);
  }

  isConsentRevoked(consentHash: string): boolean {
    return this.revokedConsents.has(consentHash);
  }

  revokeConsent(record: ConsentRevocationRecord): void {
    // The first revocation of a consent is the one kept; a later one changes nothing.
    if (!this.revokedConsents.has(record.consent_hash)) {
      this.revokedConsents.set(record.consent_hash, { ...record });
    }
  }

  /** The evidence stored for a revoked consent, if any. */
  consentRevocation(consentHash: string): ConsentRevocationRecord | undefined {
    const record = this.revokedConsents.get(consentHash);
    return record ? { ...record } : undefined;
  }
}
