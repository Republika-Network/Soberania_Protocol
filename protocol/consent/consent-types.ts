import type { RevocationCheckPort, RevocationStatus } from '../revocation';
import type { SubjectConsentProofV1 } from '../../consent/proof';

export type ScopeEntry = {
  type: 'field' | 'content' | 'pack';
  ref: string;
};

export type ProtocolConsent = {
  version: string;
  subject: string;
  grantee: string;
  action: 'grant' | 'revoke';
  scope: ScopeEntry[];
  permissions: string[];
  pricing?: {
    model: 'per_use';
    amount: number;
    currency: string;
  };
  marketMakerId?: string;
  revoke_target?: {
    capability_hash: string;
  };
  issued_at: string;
  expires_at: string | null;
  prior_consent: string | null;
  consent_hash: string;
  /** The subject's detached proof (consent/proof.ts). Required for the consent to be active. */
  subject_proof?: SubjectConsentProofV1;
};

export type ConsentState =
  | 'active'
  | 'expired'
  | 'revoked'
  | 'revocation_unknown'
  | 'inactive'
  | 'invalid';

export type ConsentValidationResult = {
  valid: boolean;
  errors: string[];
};

export type ConsentStateResult = {
  state: ConsentState;
  reasons: string[];
  revocationStatus?: RevocationStatus;
};

export type ConsentEvaluationOptions = {
  now?: Date;
  /**
   * Mandatory: every material evaluation must present an explicit revocation determination.
   * There is no default — omission is a compile-time error, not a silent "not revoked".
   */
  checkRevocation: RevocationCheckPort;
};

export type ConsentScopeRequest = {
  scope: ScopeEntry[];
  permissions: string[];
  subject?: string;
  grantee?: string;
  marketMakerId?: string;
  now?: Date;
  checkRevocation: RevocationCheckPort;
};
