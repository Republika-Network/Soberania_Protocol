import {
  parseConsent,
  normalizeConsent,
  validateConsent,
  evaluateConsentState,
} from '../consent';
import { CapabilityMintError } from './capability-errors';
import { verifyConsentObjectProof } from '../../consent/signing';
import { computeCapabilityDeterministicHash } from './capability-object';
import type { MintCapabilityInput, ParsedConsentForCapability, ProtocolCapability } from './capability-types';
import type { ScopeEntry } from '../consent/consent-types';

function toScopeKey(entry: ScopeEntry): string {
  return `${entry.type}:${entry.ref}`;
}

function assertConsentReady(
  consentInput: unknown,
  now: Date,
  checkRevocation: MintCapabilityInput['checkConsentRevocation']
): ParsedConsentForCapability {
  const parsed = parseConsent(consentInput);
  const normalized = normalizeConsent(parsed);
  const validation = validateConsent(normalized);

  if (!validation.valid) {
    throw new CapabilityMintError(`Consent is invalid: ${validation.errors.join(' | ')}`);
  }

  const proof = verifyConsentObjectProof(normalized);
  if (!proof.valid) {
    throw new CapabilityMintError(`Consent is not signed by its subject: ${proof.reason}`);
  }

  const state = evaluateConsentState(normalized, { now, checkRevocation });
  if (state.state !== 'active') {
    throw new CapabilityMintError(`Consent must be ACTIVE to mint capability. Current state: ${state.state}.`);
  }

  return {
    normalized,
    state: 'active',
  };
}

function assertIsoTimestamp(value: string, fieldName: string): void {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/.test(value)) {
    throw new CapabilityMintError(`${fieldName} must be ISO8601 UTC with second precision.`);
  }
}

export function mintCapability(input: MintCapabilityInput): ProtocolCapability {
  if (typeof input.issued_at !== 'string') {
    throw new CapabilityMintError('issued_at is required and must be a string for deterministic minting.');
  }
  assertIsoTimestamp(input.issued_at, 'issued_at');

  const mintNow = new Date(input.issued_at);
  if (!Number.isFinite(mintNow.getTime())) {
    throw new CapabilityMintError('issued_at must be parseable date.');
  }

  const { normalized: consent } = assertConsentReady(input.consent, mintNow, input.checkConsentRevocation);

  const requestedScope = input.requested_scope;
  const requestedPermissions = input.requested_permissions;

  if (!Array.isArray(requestedScope) || requestedScope.length === 0) {
    throw new CapabilityMintError('requested_scope must be a non-empty array.');
  }
  if (!Array.isArray(requestedPermissions) || requestedPermissions.length === 0) {
    throw new CapabilityMintError('requested_permissions must be a non-empty array.');
  }

  const normalizedRequestedScope = [...requestedScope]
    .map((entry) => ({ type: entry.type, ref: entry.ref.trim().toLowerCase() }))
    .sort((a, b) => toScopeKey(a).localeCompare(toScopeKey(b)));
  const normalizedRequestedPermissions = [...new Set(requestedPermissions.map((p) => p.trim().toLowerCase()))].sort();

  const consentScope = new Set(consent.scope.map(toScopeKey));
  const consentPermissions = new Set(consent.permissions);

  for (const entry of normalizedRequestedScope) {
    if (!consentScope.has(toScopeKey(entry))) {
      throw new CapabilityMintError('requested_scope must be a subset of consent.scope.');
    }
  }

  for (const permission of normalizedRequestedPermissions) {
    if (!consentPermissions.has(permission)) {
      throw new CapabilityMintError('requested_permissions must be a subset of consent.permissions.');
    }
  }

  const marketMakerId = consent.marketMakerId;
  if (marketMakerId !== undefined && input.marketMakerId !== undefined && input.marketMakerId !== marketMakerId) {
    throw new CapabilityMintError('marketMakerId must match consent.marketMakerId when consent is bound.');
  }
  if (marketMakerId === undefined && input.marketMakerId !== undefined) {
    throw new CapabilityMintError('marketMakerId cannot be introduced if consent is unbound.');
  }

  const expires_at = input.expires_at ?? consent.expires_at;
  if (expires_at === null || expires_at === undefined) {
    throw new CapabilityMintError('expires_at is required when consent.expires_at is null.');
  }
  assertIsoTimestamp(expires_at, 'expires_at');
  if (expires_at <= input.issued_at) {
    throw new CapabilityMintError('expires_at must be strictly greater than issued_at.');
  }
  if (consent.expires_at !== null && expires_at > consent.expires_at) {
    throw new CapabilityMintError('expires_at cannot exceed consent.expires_at.');
  }

  const not_before = input.not_before;
  if (not_before !== undefined) {
    assertIsoTimestamp(not_before, 'not_before');
    if (not_before < input.issued_at) {
      throw new CapabilityMintError('not_before cannot be earlier than issued_at.');
    }
    if (not_before >= expires_at) {
      throw new CapabilityMintError('not_before must be earlier than expires_at.');
    }
  }

  const capabilityBase: Omit<ProtocolCapability, 'capability_hash' | 'metadata'> = {
    parent_consent_hash: consent.consent_hash,
    subject: consent.subject,
    grantee: consent.grantee,
    scope: normalizedRequestedScope,
    permissions: normalizedRequestedPermissions,
    issued_at: input.issued_at,
    expires_at,
    ...(not_before !== undefined ? { not_before } : {}),
    ...(marketMakerId !== undefined ? { marketMakerId } : {}),
  };

  const capability_hash = computeCapabilityDeterministicHash(capabilityBase);

  return {
    capability_hash,
    ...capabilityBase,
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
  };
}
