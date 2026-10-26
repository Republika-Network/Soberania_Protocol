import type { ConsentEvaluationOptions, ConsentStateResult, ProtocolConsent } from './consent-types';
import { validateConsent } from './consent-validator';
import { revocationLookupFailedStatus } from '../revocation';
import { verifyConsentObjectProof } from '../../consent/signing';

function resolveConsentRevocationStatus(consent: ProtocolConsent, checkRevocation: ConsentEvaluationOptions['checkRevocation']) {
  try {
    const status = checkRevocation({ subjectId: consent.consent_hash, subjectType: 'consent_grant' });
    if (!status || typeof status.status !== 'string') {
      return revocationLookupFailedStatus({ subjectId: consent.consent_hash, subjectType: 'consent_grant' });
    }
    return status;
  } catch {
    return revocationLookupFailedStatus({ subjectId: consent.consent_hash, subjectType: 'consent_grant' });
  }
}

export function evaluateConsentState(
  consent: ProtocolConsent,
  opts: ConsentEvaluationOptions
): ConsentStateResult {
  if (consent.action !== 'grant' && consent.action !== 'revoke') {
    return { state: 'invalid', reasons: ['Consent action is invalid.'] };
  }

  const validation = validateConsent(consent);
  if (!validation.valid) {
    return { state: 'invalid', reasons: validation.errors };
  }

  if (consent.action !== 'grant') {
    return { state: 'invalid', reasons: ['Consent action must be grant for active evaluation.'] };
  }

  // A consent is only active if its subject signed it. Unsigned (legacy) or
  // altered consents are never active, whatever their dates say.
  const proof = verifyConsentObjectProof(consent);
  if (!proof.valid) {
    return { state: 'invalid', reasons: [proof.reason] };
  }

  const revocationStatus = resolveConsentRevocationStatus(consent, opts.checkRevocation);
  if (revocationStatus.status === 'revoked') {
    return { state: 'revoked', reasons: ['Consent was revoked.'], revocationStatus };
  }
  if (revocationStatus.status === 'unknown') {
    return {
      state: 'revocation_unknown',
      reasons: [`Consent revocation status could not be verified (${revocationStatus.errorCode}).`],
      revocationStatus,
    };
  }

  const now = opts.now ?? new Date();
  const issuedAt = Date.parse(consent.issued_at);

  if (!Number.isFinite(issuedAt)) {
    return { state: 'invalid', reasons: ['Consent issued_at is not parseable.'] };
  }

  if (now.getTime() < issuedAt) {
    return {
      state: 'inactive',
      reasons: ['Consent issued_at is in the future for evaluation time.'],
      revocationStatus,
    };
  }

  if (consent.expires_at !== null) {
    const expiresAt = Date.parse(consent.expires_at);

    if (!Number.isFinite(expiresAt)) {
      return { state: 'invalid', reasons: ['Consent expires_at is not parseable.'] };
    }

    if (now.getTime() >= expiresAt) {
      return { state: 'expired', reasons: ['Consent is expired.'], revocationStatus };
    }
  }

  return { state: 'active', reasons: [], revocationStatus };
}

export function isConsentActive(consent: ProtocolConsent, opts: ConsentEvaluationOptions): boolean {
  return evaluateConsentState(consent, opts).state === 'active';
}

export function isConsentRevoked(consent: ProtocolConsent, opts: ConsentEvaluationOptions): boolean {
  return evaluateConsentState(consent, opts).state === 'revoked';
}
