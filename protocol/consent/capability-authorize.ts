import { validateCapabilityToken } from './capability-validate';
import {
  CAPABILITY_REASON_CODES,
  type CapabilityAuthorizationRequest,
  type CapabilityAuthorizationResult,
  type CapabilityReasonCode,
  type CapabilityToken,
} from './capability-types';

function deny(reason_code: CapabilityReasonCode, capability_id: string | null): CapabilityAuthorizationResult {
  return {
    allowed: false,
    reason_code,
    evaluated_at: new Date().toISOString(),
    capability_id,
  };
}

/**
 * HMAC capability token use is DISABLED (SOBE-SEC-03J).
 *
 * This function never authorizes. It still validates the token's shape, hash, HMAC signature
 * and expiry and still reports request/token mismatches, so callers get a precise denial
 * reason, but a token that passes every check is denied with `CAPABILITY_PATH_DISABLED`.
 *
 * Why: the token-use path has no revocation check (no `RevocationCheckPort`, and no revoke
 * mechanism exists for its `capability_id` key space), no single-use protection and a
 * non-constant-time signature compare (S3-09). Its only caller, `runtime/enforcement`, runs
 * under transpile-only toolchains despite its type errors, so "does not compile" is not a
 * safeguard. The function is no longer exported from the `protocol/consent` barrel;
 * `scripts/check-runtime-export-governance.mjs` keeps it off every stable surface.
 *
 * Re-enabling requires: a mandatory authoritative revocation port that denies on anything but
 * `verified_not_revoked`, single-use (nonce) enforcement, and a constant-time signature compare.
 */
export function authorizeWithCapability(
  request: CapabilityAuthorizationRequest,
  token: unknown,
  secret: string
): CapabilityAuthorizationResult {
  const validation = validateCapabilityToken(token, secret);

  if (!validation.valid || !token || typeof token !== 'object') {
    return deny(CAPABILITY_REASON_CODES.DENY_INVALID_CAPABILITY, null);
  }

  const capability = token as CapabilityToken;

  if (request.consent_id !== undefined && request.consent_id !== capability.consent_id) {
    return deny(CAPABILITY_REASON_CODES.CONSENT_MISMATCH, capability.capability_id);
  }

  if (request.subject_id !== capability.subject_id) {
    return deny(CAPABILITY_REASON_CODES.SUBJECT_MISMATCH, capability.capability_id);
  }

  if (request.requester_id !== capability.requester_id) {
    return deny(CAPABILITY_REASON_CODES.REQUESTER_MISMATCH, capability.capability_id);
  }

  if (request.resource !== capability.resource) {
    return deny(CAPABILITY_REASON_CODES.RESOURCE_MISMATCH, capability.capability_id);
  }

  if (request.action !== capability.action) {
    return deny(CAPABILITY_REASON_CODES.ACTION_MISMATCH, capability.capability_id);
  }

  // A valid, exactly matching token: the path is disabled, so this is still a denial.
  return deny(CAPABILITY_REASON_CODES.CAPABILITY_PATH_DISABLED, capability.capability_id);
}
