import type { TrustedKeyResolver } from '@aoc-runtime/crypto';
import type { GovernanceSignature } from '@aoc-runtime/shared-types';
import { IdentityVerificationEngine, type VerifyIdentityInput } from '../verification/identity-verification';
import type { AocIdentityConsentRecord, AocIdentityCredentialRecord, AocIdentityIssuerRecord, IdentityVerificationResult, RlusdWithdrawalRequest, TrustAuditEvent } from './types';
export type RegisterCredentialInput = {
    credential_ref: string;
    subject_hash: string;
    issuer_id: string;
    credential_hash: string;
    metadata_hash: string;
    kyc_level: AocIdentityCredentialRecord['kyc_level'];
    wallet_address?: string;
    issued_at: string;
    expires_at?: string;
    /** Signature by the issuer's trusted key over `identityRegistrationPayload('credential', input)`. */
    issuer_signature: GovernanceSignature;
};
export type GrantConsentInput = {
    consent_id: string;
    subject_hash: string;
    consumer_id: string;
    issuer_id: string;
    granted_at: string;
    /** Signature by the issuer's trusted key over `identityRegistrationPayload('consent', input)`. */
    issuer_signature: GovernanceSignature;
};
export type InMemoryTrustServiceOptions = {
    /**
     * Issuer keys configured independently of any request. Credentials and
     * consents are accepted only when signed by the key whose `issuerId` is the
     * record's `issuer_id`. Without keys, registration is refused.
     */
    trustedIssuerKeys?: TrustedKeyResolver;
};
/** The bytes an issuer signs to register a credential or consent: the record without its signature. */
export declare function identityRegistrationPayload(kind: 'credential' | 'consent', input: Omit<RegisterCredentialInput, 'issuer_signature'> | Omit<GrantConsentInput, 'issuer_signature'>): {
    kind: 'aoc.identity.credential' | 'aoc.identity.consent';
    record: Record<string, unknown>;
};
export type { VerifyIdentityInput } from '../verification/identity-verification';
export declare class InMemoryTrustService {
    private readonly verificationEngine;
    private readonly issuers;
    private readonly credentials;
    private readonly consents;
    private readonly auditEvents;
    private readonly trustedIssuerKeys?;
    constructor(initialIssuers?: readonly AocIdentityIssuerRecord[], options?: InMemoryTrustServiceOptions, verificationEngine?: IdentityVerificationEngine);
    getAuditEvents(): readonly TrustAuditEvent[];
    /**
     * Confirms that `input` was signed by the trusted key of the issuer it names,
     * and returns the signed record (read once). Throws otherwise.
     */
    private authenticateIssuer;
    registerCredential(signedInput: RegisterCredentialInput): AocIdentityCredentialRecord;
    grantConsent(signedInput: GrantConsentInput): AocIdentityConsentRecord;
    verifyIdentity(input: VerifyIdentityInput): IdentityVerificationResult;
    enforcePayoutKyc(request: RlusdWithdrawalRequest, now?: Date): {
        allowed: boolean;
        reason_code: string;
    };
    private pushVerificationAudit;
}
export declare const DEFAULT_TRUST_ISSUERS: readonly AocIdentityIssuerRecord[];
//# sourceMappingURL=identity-trust-service.d.ts.map