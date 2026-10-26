import { projectCapabilityScopeMatch, evaluateCapabilityState, verifyCapability } from '../capability';
import { evaluateConsentState, normalizeConsent, parseConsent, validateConsent } from '../consent';
import type { ScopeEntry } from '../consent/consent-types';
import type { ProtocolCapability } from '../capability/capability-types';
import type { EnforcementReasonCode } from './enforcement-types';
import type { RevocationCheckPort } from '../revocation';
import { verifyConsentObjectProof } from '../../consent/signing';
import { parseEnforcementRequest, normalizeEnforcementRequest } from './enforcement-request';
import type { EnforcementDecision, EnforcementRequest, NormalizedEnforcementRequest } from './enforcement-types';
import { ENFORCEMENT_REASON_CODES } from './enforcement-types';
import { buildAllowDecision, buildDenyDecision, mapCapabilityStateToReason } from './enforcement-policy';

function toScopeKey(entry: ScopeEntry): string {
  return `${entry.type}:${entry.ref}`;
}

function findScopeMismatch(
  normalizedRequest: NormalizedEnforcementRequest,
  allowedScope: ScopeEntry[]
): { matched: ScopeEntry[]; mismatch?: ScopeEntry } {
  const allowed = new Set(allowedScope.map(toScopeKey));
  const matched: ScopeEntry[] = [];

  for (const requested of normalizedRequest.requested_scope) {
    if (!allowed.has(toScopeKey(requested))) {
      return { matched, mismatch: requested };
    }
    matched.push(requested);
  }

  return { matched };
}

function findPermissionMismatch(
  normalizedRequest: NormalizedEnforcementRequest,
  allowedPermissions: string[]
): { matched: string[]; mismatch?: string } {
  const allowed = new Set(allowedPermissions);
  const matched: string[] = [];

  for (const permission of normalizedRequest.requested_permissions) {
    if (!allowed.has(permission)) {
      return { matched, mismatch: permission };
    }
    matched.push(permission);
  }

  return { matched };
}

type ParentConsentFailure = { reason_code: EnforcementReasonCode; reasons: string[] };

/**
 * The capability must have been minted from `consentInput` and must stay within
 * it: same consent hash, subject, grantee and market maker; scope, permissions
 * and validity window covered by the consent; and the consent active at `now`
 * (including its revocation status, read from `checkRevocation`). The consent
 * must carry a valid proof by its subject (consent/proof.ts).
 */
function checkParentConsent(
  consentInput: unknown,
  capability: ProtocolCapability,
  now: Date,
  checkRevocation: RevocationCheckPort
): ParentConsentFailure | undefined {
  let consent;
  try {
    consent = normalizeConsent(parseConsent(consentInput));
  } catch (error) {
    return {
      reason_code: ENFORCEMENT_REASON_CODES.CONSENT_INVALID,
      reasons: [error instanceof Error ? error.message : 'Parent consent could not be parsed.'],
    };
  }

  const validation = validateConsent(consent);
  if (!validation.valid) {
    return { reason_code: ENFORCEMENT_REASON_CODES.CONSENT_INVALID, reasons: validation.errors };
  }

  const proof = verifyConsentObjectProof(consent);
  if (!proof.valid) {
    return { reason_code: ENFORCEMENT_REASON_CODES.CONSENT_UNAUTHENTICATED, reasons: [proof.reason] };
  }

  const mismatch = (reason: string): ParentConsentFailure => ({
    reason_code: ENFORCEMENT_REASON_CODES.CONSENT_MISMATCH,
    reasons: [reason],
  });

  if (consent.consent_hash !== capability.parent_consent_hash) {
    return mismatch('Capability was not minted from the supplied consent.');
  }
  if (consent.subject !== capability.subject || consent.grantee !== capability.grantee) {
    return mismatch('Capability subject or grantee does not match the parent consent.');
  }
  if ((consent.marketMakerId ?? undefined) !== (capability.marketMakerId ?? undefined)) {
    return mismatch('Capability marketMakerId does not match the parent consent.');
  }

  const consentScope = new Set(consent.scope.map(toScopeKey));
  if (capability.scope.some((entry) => !consentScope.has(toScopeKey(entry)))) {
    return mismatch('Capability scope is not covered by the parent consent.');
  }
  const consentPermissions = new Set(consent.permissions);
  if (capability.permissions.some((permission) => !consentPermissions.has(permission))) {
    return mismatch('Capability permissions are not covered by the parent consent.');
  }

  const consentIssuedAt = Date.parse(consent.issued_at);
  const starts = [capability.issued_at, capability.not_before].filter((value): value is string => typeof value === 'string');
  if (starts.some((start) => !(Date.parse(start) >= consentIssuedAt))) {
    return mismatch('Capability validity starts before the parent consent was issued.');
  }
  if (consent.expires_at !== null && !(Date.parse(capability.expires_at) <= Date.parse(consent.expires_at))) {
    return mismatch('Capability expires after the parent consent.');
  }

  const state = evaluateConsentState(consent, { now, checkRevocation });
  if (state.state !== 'active') {
    return {
      reason_code: ENFORCEMENT_REASON_CODES.CONSENT_INACTIVE,
      reasons: [`Parent consent is not active (${state.state}).`, ...state.reasons],
    };
  }

  return undefined;
}

export function evaluateEnforcement(request: EnforcementRequest, checkRevocation: RevocationCheckPort): EnforcementDecision {
  const now = request.now ?? new Date();

  let normalizedRequest: NormalizedEnforcementRequest;
  try {
    normalizedRequest = normalizeEnforcementRequest(parseEnforcementRequest(request));
  } catch (error) {
    return buildDenyDecision(
      ENFORCEMENT_REASON_CODES.REQUEST_INVALID,
      [error instanceof Error ? error.message : 'Enforcement request parsing failed.'],
      { now }
    );
  }

  const verification = verifyCapability(normalizedRequest.capability);
  if (!verification.valid || verification.normalized === undefined) {
    return buildDenyDecision(ENFORCEMENT_REASON_CODES.CAPABILITY_INVALID, verification.errors, {
      now,
      normalized_request: normalizedRequest,
    });
  }

  const normalizedCapability = verification.normalized;
  const state = evaluateCapabilityState(normalizedCapability, {
    now: normalizedRequest.now ?? now,
    checkRevocation,
  });

  if (state.state !== 'active') {
    return buildDenyDecision(mapCapabilityStateToReason(state.state), state.reasons, {
      now,
      normalized_request: normalizedRequest,
      normalized_capability: normalizedCapability,
    });
  }

  const consentFailure = checkParentConsent(
    normalizedRequest.consent,
    normalizedCapability,
    normalizedRequest.now ?? now,
    checkRevocation
  );
  if (consentFailure !== undefined) {
    return buildDenyDecision(consentFailure.reason_code, consentFailure.reasons, {
      now,
      normalized_request: normalizedRequest,
      normalized_capability: normalizedCapability,
    });
  }

  const scopeMatch = findScopeMismatch(normalizedRequest, normalizedCapability.scope);
  if (scopeMatch.mismatch !== undefined) {
    return buildDenyDecision(
      ENFORCEMENT_REASON_CODES.SCOPE_NOT_ALLOWED,
      [`Requested scope is not allowed: ${scopeMatch.mismatch.type}:${scopeMatch.mismatch.ref}.`],
      {
        now,
        normalized_request: normalizedRequest,
        normalized_capability: normalizedCapability,
        matched_scope: scopeMatch.matched,
      }
    );
  }

  const permissionMatch = findPermissionMismatch(normalizedRequest, normalizedCapability.permissions);
  if (permissionMatch.mismatch !== undefined) {
    return buildDenyDecision(
      ENFORCEMENT_REASON_CODES.PERMISSION_NOT_ALLOWED,
      [`Requested permission is not allowed: ${permissionMatch.mismatch}.`],
      {
        now,
        normalized_request: normalizedRequest,
        normalized_capability: normalizedCapability,
        matched_scope: scopeMatch.matched,
        matched_permissions: permissionMatch.matched,
      }
    );
  }

  if (
    normalizedRequest.subject !== undefined &&
    normalizedRequest.subject !== normalizedCapability.subject
  ) {
    return buildDenyDecision(
      ENFORCEMENT_REASON_CODES.SUBJECT_MISMATCH,
      ['Request subject does not match capability subject.'],
      {
        now,
        normalized_request: normalizedRequest,
        normalized_capability: normalizedCapability,
        matched_scope: scopeMatch.matched,
        matched_permissions: permissionMatch.matched,
      }
    );
  }

  if (
    normalizedRequest.grantee !== undefined &&
    normalizedRequest.grantee !== normalizedCapability.grantee
  ) {
    return buildDenyDecision(
      ENFORCEMENT_REASON_CODES.GRANTEE_MISMATCH,
      ['Request grantee does not match capability grantee.'],
      {
        now,
        normalized_request: normalizedRequest,
        normalized_capability: normalizedCapability,
        matched_scope: scopeMatch.matched,
        matched_permissions: permissionMatch.matched,
      }
    );
  }

  if (
    normalizedRequest.marketMakerId !== undefined &&
    normalizedRequest.marketMakerId !== (normalizedCapability.marketMakerId ?? undefined)
  ) {
    return buildDenyDecision(
      ENFORCEMENT_REASON_CODES.MARKET_MAKER_MISMATCH,
      ['Request market maker binding does not match capability marketMakerId.'],
      {
        now,
        normalized_request: normalizedRequest,
        normalized_capability: normalizedCapability,
        matched_scope: scopeMatch.matched,
        matched_permissions: permissionMatch.matched,
      }
    );
  }

  // Scope arithmetic only: consent binding and revocation were decided above.
  const accessAllowed = projectCapabilityScopeMatch(normalizedCapability, {
    requested_scope: normalizedRequest.requested_scope,
    requested_permissions: normalizedRequest.requested_permissions,
    subject: normalizedRequest.subject,
    grantee: normalizedRequest.grantee,
    marketMakerId: normalizedRequest.marketMakerId,
    now: normalizedRequest.now ?? now,
    checkRevocation,
  });

  if (!accessAllowed) {
    return buildDenyDecision(
      ENFORCEMENT_REASON_CODES.REQUEST_INVALID,
      ['Capability access evaluation denied the request.'],
      {
        now,
        normalized_request: normalizedRequest,
        normalized_capability: normalizedCapability,
        matched_scope: scopeMatch.matched,
        matched_permissions: permissionMatch.matched,
      }
    );
  }

  return buildAllowDecision({
    now,
    normalized_request: normalizedRequest,
    normalized_capability: normalizedCapability,
    matched_scope: scopeMatch.matched,
    matched_permissions: permissionMatch.matched,
  });
}
