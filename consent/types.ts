import type { SubjectConsentProofV1 } from './proof';

export type ScopeEntry = {
  type: 'field' | 'content' | 'pack';
  ref: string;
};

export type ConsentPricing = {
  model: 'per_use';
  amount: number;
  currency: string;
};

export type ConsentObjectV1 = {
  version: string;
  subject: string;
  grantee: string;
  action: 'grant' | 'revoke';
  scope: ScopeEntry[];
  permissions: string[];
  pricing?: ConsentPricing;
  marketMakerId?: string;
  revoke_target?: {
    capability_hash: string;
  };
  issued_at: string;
  expires_at: string | null;
  prior_consent: string | null;
  consent_hash: string;
  /**
   * The subject's detached signature over this consent (consent/proof.ts). It is
   * not part of the canonical payload, so consent_hash does not depend on it.
   * A consent without a valid proof is legacy data and authorizes nothing.
   */
  subject_proof?: SubjectConsentProofV1;
};

export type BuildConsentOptions = {
  now?: Date;
  expires_at?: string | null;
  prior_consent?: string | null;
  revoke_target?: {
    capability_hash: string;
  };
  marketMakerId?: string;
  pricing?: ConsentPricing;
};
