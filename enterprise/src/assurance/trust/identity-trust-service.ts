import { snapshotGovernanceSignature, verifyPayloadSignature } from '@aoc-runtime/crypto';
import type { TrustedKeyResolver } from '@aoc-runtime/crypto';
import type { GovernanceSignature } from '@aoc-runtime/shared-types';
import { IdentityVerificationEngine, type VerifyIdentityInput } from '../verification/identity-verification';
import type {
  AocIdentityConsentRecord,
  AocIdentityCredentialRecord,
  AocIdentityIssuerRecord,
  IdentityVerificationResult,
  RlusdWithdrawalRequest,
  TrustAuditEvent,
} from './types';

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
export function identityRegistrationPayload(
  kind: 'credential' | 'consent',
  input: Omit<RegisterCredentialInput, 'issuer_signature'> | Omit<GrantConsentInput, 'issuer_signature'>
): { kind: 'aoc.identity.credential' | 'aoc.identity.consent'; record: Record<string, unknown> } {
  const { issuer_signature: _ignored, ...record } = input as Record<string, unknown>;
  return { kind: kind === 'credential' ? 'aoc.identity.credential' : 'aoc.identity.consent', record };
}

export type { VerifyIdentityInput } from '../verification/identity-verification';

export class InMemoryTrustService {
  private readonly issuers = new Map<string, AocIdentityIssuerRecord>();
  private readonly credentials = new Map<string, AocIdentityCredentialRecord>();
  private readonly consents = new Map<string, AocIdentityConsentRecord>();
  private readonly auditEvents: TrustAuditEvent[] = [];

  private readonly trustedIssuerKeys?: TrustedKeyResolver;

  constructor(
    initialIssuers: readonly AocIdentityIssuerRecord[] = [],
    options: InMemoryTrustServiceOptions = {},
    private readonly verificationEngine = new IdentityVerificationEngine(),
  ) {
    this.trustedIssuerKeys = options.trustedIssuerKeys;
    for (const issuer of initialIssuers) this.issuers.set(issuer.issuer_id, issuer);
  }

  getAuditEvents(): readonly TrustAuditEvent[] {
    return [...this.auditEvents];
  }

  /**
   * Confirms that `input` was signed by the trusted key of the issuer it names,
   * and returns the signed record (read once). Throws otherwise.
   */
  private authenticateIssuer<T extends RegisterCredentialInput | GrantConsentInput>(kind: 'credential' | 'consent', input: T): Omit<T, 'issuer_signature'> {
    if (this.trustedIssuerKeys === undefined) {
      throw new Error('No trusted issuer keys are configured; identity registration is refused.');
    }
    const payload = identityRegistrationPayload(kind, input);
    const record = payload.record as Omit<T, 'issuer_signature'>;
    const envelope = snapshotGovernanceSignature(input?.issuer_signature);
    if (
      !envelope ||
      typeof record.issuer_id !== 'string' ||
      envelope.signer.issuerId !== record.issuer_id ||
      !verifyPayloadSignature(payload, envelope, this.trustedIssuerKeys)
    ) {
      throw new Error(`Identity ${kind} is not signed by issuer ${String(record.issuer_id)}.`);
    }
    return record;
  }

  registerCredential(signedInput: RegisterCredentialInput): AocIdentityCredentialRecord {
    const input = this.authenticateIssuer('credential', signedInput);
    const issuer = this.issuers.get(input.issuer_id);
    if (issuer === undefined || !issuer.active) throw new Error(`Issuer is invalid or inactive: ${input.issuer_id}`);
    if (!issuer.supported_kyc_levels.includes(input.kyc_level)) throw new Error(`Issuer does not support KYC level: ${input.kyc_level}`);

    const record: AocIdentityCredentialRecord = {
      credential_ref: input.credential_ref,
      subject_hash: input.subject_hash,
      issuer_id: input.issuer_id,
      credential_hash: input.credential_hash,
      kyc_level: input.kyc_level,
      metadata_hash: input.metadata_hash,
      wallet_address: input.wallet_address,
      issued_at: input.issued_at,
      expires_at: input.expires_at,
    };
    this.credentials.set(record.credential_ref, record);
    this.auditEvents.push({
      event_type: 'CREDENTIAL_REGISTERED',
      at: input.issued_at,
      subject_hash: input.subject_hash,
      issuer_id: input.issuer_id,
      credential_ref: input.credential_ref,
    });
    if (input.wallet_address !== undefined) {
      this.auditEvents.push({
        event_type: 'WALLET_LINKED',
        at: input.issued_at,
        subject_hash: input.subject_hash,
        issuer_id: input.issuer_id,
        credential_ref: input.credential_ref,
      });
    }
    return record;
  }

  grantConsent(signedInput: GrantConsentInput): AocIdentityConsentRecord {
    const input = this.authenticateIssuer('consent', signedInput);
    const issuer = this.issuers.get(input.issuer_id);
    if (issuer === undefined || !issuer.active) throw new Error(`Issuer is invalid or inactive: ${input.issuer_id}`);
    const consent: AocIdentityConsentRecord = {
      consent_id: input.consent_id,
      subject_hash: input.subject_hash,
      consumer_id: input.consumer_id,
      issuer_id: input.issuer_id,
      granted_at: input.granted_at,
    };
    this.consents.set(input.consent_id, consent);
    this.auditEvents.push({
      event_type: 'CONSENT_GRANTED',
      at: input.granted_at,
      subject_hash: input.subject_hash,
      consumer_id: input.consumer_id,
      issuer_id: input.issuer_id,
    });
    return consent;
  }

  verifyIdentity(input: VerifyIdentityInput): IdentityVerificationResult {
    const evaluation = this.verificationEngine.verify(input, {
      issuers: this.issuers,
      credentials: this.credentials.values(),
      consents: this.consents.values(),
    });
    this.pushVerificationAudit(input, evaluation.result, evaluation.credential);
    return evaluation.result;
  }

  enforcePayoutKyc(request: RlusdWithdrawalRequest, now: Date = new Date()): { allowed: boolean; reason_code: string } {
    const verification = this.verifyIdentity({
      subject_hash: request.subject_hash,
      consumer_id: request.consumer_id,
      issuer_id: request.identity_issuer,
      now,
    });
    if (!verification.valid) {
      this.auditEvents.push({
        event_type: 'PAYOUT_BLOCKED',
        at: now.toISOString(),
        subject_hash: request.subject_hash,
        consumer_id: request.consumer_id,
        issuer_id: request.identity_issuer,
        credential_ref: request.identity_ref,
        reason_code: verification.reason_code,
      });
      return { allowed: false, reason_code: `PAYOUT_BLOCKED_${verification.reason_code}` };
    }
    this.auditEvents.push({
      event_type: 'PAYOUT_ALLOWED',
      at: now.toISOString(),
      subject_hash: request.subject_hash,
      consumer_id: request.consumer_id,
      issuer_id: verification.issuer,
      credential_ref: request.identity_ref,
      reason_code: verification.reason_code,
    });
    return { allowed: true, reason_code: 'PAYOUT_ALLOWED' };
  }

  private pushVerificationAudit(
    input: VerifyIdentityInput,
    result: IdentityVerificationResult,
    credential?: AocIdentityCredentialRecord,
  ): void {
    this.auditEvents.push({
      event_type: 'VERIFICATION_PERFORMED',
      at: (input.now ?? new Date()).toISOString(),
      subject_hash: input.subject_hash,
      consumer_id: input.consumer_id,
      issuer_id: credential?.issuer_id,
      credential_ref: credential?.credential_ref,
      reason_code: result.reason_code,
    });
  }
}

export const DEFAULT_TRUST_ISSUERS: readonly AocIdentityIssuerRecord[] = [
  {
    issuer_id: 'kyc-global-v1',
    display_name: 'KYC Global',
    active: true,
    supported_kyc_levels: ['basic', 'enhanced', 'institutional'],
  },
];
