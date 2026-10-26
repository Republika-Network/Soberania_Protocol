/**
 * Evidence kept for a revoked consent: the subject-signed revoke consent that
 * withdrew it. The record can be re-verified later against the stored consents.
 */
export type ConsentRevocationRecord = {
  /** consent_hash of the revoked grant consent. */
  consent_hash: string;
  /** consent_hash of the signed revoke consent (action "revoke") that revoked it. */
  revocation_consent_hash: string;
  /** did:key of the subject that signed the revocation. */
  subject: string;
  /** issued_at of the revoke consent. Audit only: authorization does not depend on it. */
  revoked_at: string;
};

/**
 * Authoritative revocation state for the capability model. Two operations with
 * different authority, kept distinct:
 *
 * - capability revocation (`revoke` / `isRevoked`): operator containment of one
 *   token hash. The consent that issued it stays usable.
 * - consent revocation (`revokeConsent` / `isConsentRevoked`): the subject's
 *   signed withdrawal of a consent. Every capability that references the
 *   consent (`consent_ref` / `parent_consent_hash`) is denied from then on, and
 *   nothing can be minted from it again.
 *
 * Implementations are append-only: there is no un-revoke. The in-memory
 * implementation is a single-process store. A multi-instance deployment needs a
 * shared store behind this interface whose reads see its own writes and which
 * throws, rather than answering "not revoked", when it cannot answer.
 */
export interface RevocationRegistry {
  isRevoked(capabilityHash: string): boolean;
  revoke(capabilityHash: string): void;
  isConsentRevoked(consentHash: string): boolean;
  revokeConsent(record: ConsentRevocationRecord): void;
}
