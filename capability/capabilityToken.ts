import crypto from 'node:crypto';
import { ConsentObjectV1, ScopeEntry } from '../consent/types';
import { assertConsentObjectAuthenticated } from '../consent/signing';
import { canonicalizeCapabilityPayload } from './canonical';
import { computeCapabilityHash } from './hash';
import { readRevocation } from './revocation';
import { validateMarketMakerId } from '../shared/marketMakerId';
import { validateCapabilityActions } from '../shared/capabilityActions';
import type { MarketMakerRegistry } from '../shared/marketMakerRegistry';
import type { NonceRegistry } from './registries/NonceRegistry';
import type { RevocationRegistry } from './registries/RevocationRegistry';
import { InMemoryNonceRegistry } from './registries/InMemoryNonceRegistry';
import { CapabilityTokenV1, MintCapabilityOptions } from './types';

const VERSION_PATTERN = /^[0-9]+\.[0-9]+$/;
const DID_PATTERN = /^did:[a-z0-9]+:[a-zA-Z0-9._%-]+$/;
const HASH_HEX_PATTERN = /^[a-f0-9]{64}$/;
const ISO8601_UTC_PATTERN =
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/;
const MIN_DID_LENGTH = 8;
const MAX_DID_LENGTH = 2048;
const MAX_SCOPE_ENTRIES = 10000;
const MAX_PERMISSIONS = 100;
const CLOCK_SKEW_SECONDS = 300;

const VALID_SCOPE_TYPES: ReadonlyArray<string> = ['field', 'content', 'pack'];

// --- Default nonce registry for replay protection ---

const defaultNonceRegistry = new InMemoryNonceRegistry();

/**
 * Resets the nonce registry. Intended for testing only.
 */
export function resetNonceRegistry(): void {
  defaultNonceRegistry.reset();
}

// --- Validation helpers ---

function validateVersion(version: string): void {
  if (typeof version !== 'string' || !VERSION_PATTERN.test(version)) {
    throw new Error(
      'Capability version must match pattern MAJOR.MINOR (e.g., "1.0").'
    );
  }
}

function validateDID(value: string, fieldName: string): void {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Capability ${fieldName} must be non-empty.`);
  }
  if (value.length < MIN_DID_LENGTH) {
    throw new Error(
      `Capability ${fieldName} must be at least ${MIN_DID_LENGTH} characters.`
    );
  }
  if (value.length > MAX_DID_LENGTH) {
    throw new Error(
      `Capability ${fieldName} must be at most ${MAX_DID_LENGTH} characters.`
    );
  }
  if (!DID_PATTERN.test(value)) {
    throw new Error(`Capability ${fieldName} must be a valid DID.`);
  }
}

function validateConsentRef(consent_ref: string): void {
  if (
    typeof consent_ref !== 'string' ||
    !HASH_HEX_PATTERN.test(consent_ref)
  ) {
    throw new Error(
      'Capability consent_ref must be 64 lowercase hex characters.'
    );
  }
}

function validateScopeEntry(entry: ScopeEntry, index: number): void {
  if (!VALID_SCOPE_TYPES.includes(entry.type)) {
    throw new Error(
      `Scope entry ${index}: type must be "field", "content", or "pack".`
    );
  }
  if (typeof entry.ref !== 'string' || !HASH_HEX_PATTERN.test(entry.ref)) {
    throw new Error(
      `Scope entry ${index}: ref must be 64 lowercase hex characters.`
    );
  }
}

function validateScope(scope: ScopeEntry[]): void {
  if (!Array.isArray(scope) || scope.length === 0) {
    throw new Error('Capability scope must be a non-empty array.');
  }
  if (scope.length > MAX_SCOPE_ENTRIES) {
    throw new Error(
      `Capability scope must not exceed ${MAX_SCOPE_ENTRIES} entries.`
    );
  }

  const seen = new Set<string>();
  for (let i = 0; i < scope.length; i++) {
    validateScopeEntry(scope[i], i);
    const key = `${scope[i].type}:${scope[i].ref}`;
    if (seen.has(key)) {
      throw new Error(
        `Capability scope contains duplicate entry: (${scope[i].type}, ${scope[i].ref}).`
      );
    }
    seen.add(key);
  }
}

function validatePermissions(permissions: string[]): void {
  validateCapabilityActions(permissions, {
    containerLabel: 'Capability permissions',
    itemLabel: 'Capability permission',
    emptyMessage: 'Capability permissions must be a non-empty array.',
    maxEntries: MAX_PERMISSIONS
  });
}

function validateTimestamp(value: string, fieldName: string): void {
  if (typeof value !== 'string' || !ISO8601_UTC_PATTERN.test(value)) {
    throw new Error(
      `Capability ${fieldName} must be ISO 8601 UTC format (e.g., "2025-06-15T10:00:00Z").`
    );
  }
}

function validateTokenId(token_id: string): void {
  if (typeof token_id !== 'string' || !HASH_HEX_PATTERN.test(token_id)) {
    throw new Error(
      'Capability token_id must be 64 lowercase hex characters.'
    );
  }
}

// --- Scope containment check ---

function scopeKey(entry: ScopeEntry): string {
  return `${entry.type}:${entry.ref}`;
}

function assertScopeContainment(
  tokenScope: ScopeEntry[],
  consentScope: ScopeEntry[]
): void {
  const allowed = new Set(consentScope.map(scopeKey));
  for (const entry of tokenScope) {
    if (!allowed.has(scopeKey(entry))) {
      throw new Error(
        `Scope escalation: token scope entry (${entry.type}, ${entry.ref}) not found in parent consent scope.`
      );
    }
  }
}

function assertPermissionContainment(
  tokenPermissions: string[],
  consentPermissions: string[]
): void {
  const allowed = new Set(consentPermissions);
  for (const perm of tokenPermissions) {
    if (!allowed.has(perm)) {
      throw new Error(
        `Permission escalation: token permission "${perm}" not found in parent consent permissions.`
      );
    }
  }
}

// --- Generate token_id with 256-bit entropy ---

function generateTokenId(): string {
  return crypto.randomBytes(32).toString('hex');
}

// --- Public API ---

/**
 * Mints a new Capability Token derived from a parent Consent Object.
 *
 * Enforces all derivation invariants from capability-token-spec.md Section 4:
 * - Parent consent must have action "grant"
 * - Subject and grantee must match
 * - Token scope must be a subset of consent scope
 * - Token permissions must be a subset of consent permissions
 * - Temporal bounds must be contained within consent bounds
 * - Token must have a finite expires_at
 */
export function mintCapabilityToken(
  parentConsent: ConsentObjectV1,
  scope: ScopeEntry[],
  permissions: string[],
  expires_at: string,
  opts: MintCapabilityOptions = {}
): CapabilityTokenV1 {
  // Mint only from a consent its subject signed, and derive from the copy that
  // was verified.
  const consent = JSON.parse(JSON.stringify(parentConsent)) as ConsentObjectV1;
  assertConsentObjectAuthenticated(consent);

  // Derivation: parent consent must be a grant
  if (consent.action !== 'grant') {
    throw new Error(
      'Capability token can only be derived from a consent with action "grant".'
    );
  }

  const version = '1.0';
  const subject = consent.subject;
  const grantee = consent.grantee;
  const consent_ref = consent.consent_hash;
  const issued_at = (opts.now ?? new Date())
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z');
  const not_before = opts.not_before ?? null;
  const requestedMarketMakerId = opts.marketMakerId;
  const parentMarketMakerId = consent.marketMakerId;
  const token_id = generateTokenId();

  // Structural validation
  validateVersion(version);
  validateDID(subject, 'subject');
  validateDID(grantee, 'grantee');
  validateConsentRef(consent_ref);
  validateScope(scope);
  validatePermissions(permissions);
  validateTimestamp(issued_at, 'issued_at');
  validateTimestamp(expires_at, 'expires_at');
  validateTokenId(token_id);
  validateMarketMakerId(requestedMarketMakerId, 'Capability marketMakerId');
  validateMarketMakerId(parentMarketMakerId, 'Parent consent marketMakerId');

  if (not_before !== null) {
    validateTimestamp(not_before, 'not_before');
  }

  let marketMakerId: string | undefined;
  if (parentMarketMakerId !== undefined) {
    if (
      requestedMarketMakerId !== undefined &&
      requestedMarketMakerId !== parentMarketMakerId
    ) {
      throw new Error(
        'Capability marketMakerId must match parent consent marketMakerId.'
      );
    }
    marketMakerId = parentMarketMakerId;
  } else if (requestedMarketMakerId !== undefined) {
    throw new Error(
      'Capability marketMakerId cannot be introduced when parent consent is unbound.'
    );
  }

  // Semantic: expires_at must be after issued_at
  if (expires_at <= issued_at) {
    throw new Error('Capability expires_at must be after issued_at.');
  }

  // Semantic: not_before constraints
  if (not_before !== null) {
    if (not_before < issued_at) {
      throw new Error(
        'Capability not_before must be at or after issued_at.'
      );
    }
    if (not_before >= expires_at) {
      throw new Error('Capability not_before must be before expires_at.');
    }
  }

  // Derivation: issued_at must be at or after consent issued_at
  if (issued_at < consent.issued_at) {
    throw new Error(
      'Capability issued_at must be at or after parent consent issued_at.'
    );
  }

  // Derivation: if consent has a finite expires_at, token must expire at or before
  if (consent.expires_at !== null && expires_at > consent.expires_at) {
    throw new Error(
      'Capability expires_at must not exceed parent consent expires_at.'
    );
  }

  // Derivation: not_before must be at or after consent issued_at
  if (not_before !== null && not_before < consent.issued_at) {
    throw new Error(
      'Capability not_before must be at or after parent consent issued_at.'
    );
  }

  // Derivation: scope containment
  assertScopeContainment(scope, consent.scope);

  // Derivation: permission containment
  assertPermissionContainment(permissions, consent.permissions);

  // Compute capability_hash
  const payloadBytes = canonicalizeCapabilityPayload({
    version,
    subject,
    grantee,
    consent_ref,
    scope,
    permissions,
    ...(marketMakerId !== undefined ? { marketMakerId } : {}),
    issued_at,
    not_before,
    expires_at,
    token_id
  });

  const capability_hash = computeCapabilityHash(payloadBytes);

  return {
    version,
    subject,
    grantee,
    consent_ref,
    scope,
    permissions,
    ...(marketMakerId !== undefined ? { marketMakerId } : {}),
    issued_at,
    not_before,
    expires_at,
    token_id,
    capability_hash
  };
}

/**
 * Validates the structural integrity of a Capability Token.
 *
 * Checks all structural and semantic invariants, then recomputes the
 * capability_hash to detect tampering. Does NOT check derivation
 * invariants against the parent consent (use verifyCapabilityToken for that).
 */
export function validateCapabilityToken(
  token: CapabilityTokenV1,
  marketMakerRegistry?: Pick<MarketMakerRegistry, 'exists'>
): void {
  validateVersion(token.version);
  validateDID(token.subject, 'subject');
  validateDID(token.grantee, 'grantee');
  validateConsentRef(token.consent_ref);
  validateScope(token.scope);
  validatePermissions(token.permissions);
  validateTimestamp(token.issued_at, 'issued_at');
  validateTimestamp(token.expires_at, 'expires_at');
  validateTokenId(token.token_id);
  validateMarketMakerId(token.marketMakerId, 'Capability marketMakerId');

  if (token.marketMakerId !== undefined && marketMakerRegistry && !marketMakerRegistry.exists(token.marketMakerId)) {
    throw new Error(`Capability marketMakerId ${token.marketMakerId} is not registered.`);
  }

  if (token.not_before !== null) {
    validateTimestamp(token.not_before, 'not_before');
  }

  // Semantic: expires_at > issued_at
  if (token.expires_at <= token.issued_at) {
    throw new Error('Capability expires_at must be after issued_at.');
  }

  // Semantic: not_before constraints
  if (token.not_before !== null) {
    if (token.not_before < token.issued_at) {
      throw new Error(
        'Capability not_before must be at or after issued_at.'
      );
    }
    if (token.not_before >= token.expires_at) {
      throw new Error('Capability not_before must be before expires_at.');
    }
  }

  // Hash integrity
  if (
    typeof token.capability_hash !== 'string' ||
    !HASH_HEX_PATTERN.test(token.capability_hash)
  ) {
    throw new Error(
      'Capability capability_hash must be 64 lowercase hex characters.'
    );
  }

  const payloadBytes = canonicalizeCapabilityPayload({
    version: token.version,
    subject: token.subject,
    grantee: token.grantee,
    consent_ref: token.consent_ref,
    scope: token.scope,
    permissions: token.permissions,
    ...(token.marketMakerId !== undefined
      ? { marketMakerId: token.marketMakerId }
      : {}),
    issued_at: token.issued_at,
    not_before: token.not_before,
    expires_at: token.expires_at,
    token_id: token.token_id
  });

  const expectedHash = computeCapabilityHash(payloadBytes);
  if (token.capability_hash !== expectedHash) {
    throw new Error(
      'Capability capability_hash does not match canonical payload hash.'
    );
  }
}

/**
 * Verifies a Capability Token against its parent Consent Object and
 * enforces runtime authorization checks.
 *
 * Verification checks (all must pass):
 * 1. Structural integrity (via validateCapabilityToken)
 * 2. consent_ref matches parent consent_hash
 * 3. Subject and grantee match parent consent
 * 4. Scope containment (token scope ⊆ consent scope)
 * 5. Permission containment (token permissions ⊆ consent permissions)
 * 6. Temporal derivation bounds
 * 7. Expiry check (token must not be expired at evaluation time)
 * 8. not_before check (evaluation time must be at or after effective start)
 * 9. Replay rejection (nonce must not have been seen before)
 * 10. Revocation check
 */
export function verifyCapabilityToken(
  token: CapabilityTokenV1,
  parentConsent: ConsentObjectV1,
  opts: { now?: Date } = {},
  registries?: { nonceRegistry?: NonceRegistry; revocationRegistry?: RevocationRegistry }
): void {
  // 1. Structural integrity
  validateCapabilityToken(token);

  // The parent consent must be signed by its subject.
  const consent = JSON.parse(JSON.stringify(parentConsent)) as ConsentObjectV1;
  assertConsentObjectAuthenticated(consent);

  // 2. Consent ref must match
  if (token.consent_ref !== consent.consent_hash) {
    throw new Error(
      'Capability consent_ref does not match parent consent consent_hash.'
    );
  }

  // 3. Parent consent must be a grant
  if (consent.action !== 'grant') {
    throw new Error(
      'Parent consent action must be "grant".'
    );
  }

  // 4. Identity binding
  if (token.subject !== consent.subject) {
    throw new Error(
      'Capability subject does not match parent consent subject.'
    );
  }
  if (token.grantee !== consent.grantee) {
    throw new Error(
      'Capability grantee does not match parent consent grantee.'
    );
  }

  validateMarketMakerId(consent.marketMakerId, 'Parent consent marketMakerId');
  if (consent.marketMakerId !== token.marketMakerId) {
    throw new Error(
      'Capability marketMakerId does not match parent consent marketMakerId.'
    );
  }

  // 5. Scope containment
  assertScopeContainment(token.scope, consent.scope);

  // 6. Permission containment
  assertPermissionContainment(token.permissions, consent.permissions);

  // 7. Temporal derivation bounds
  if (token.issued_at < consent.issued_at) {
    throw new Error(
      'Capability issued_at must be at or after parent consent issued_at.'
    );
  }
  if (consent.expires_at !== null && token.expires_at > consent.expires_at) {
    throw new Error(
      'Capability expires_at must not exceed parent consent expires_at.'
    );
  }
  if (token.not_before !== null && token.not_before < consent.issued_at) {
    throw new Error(
      'Capability not_before must be at or after parent consent issued_at.'
    );
  }

  // 8. Expiry check
  const now = (opts.now ?? new Date())
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z');

  if (now > token.expires_at) {
    throw new Error('Capability token has expired.');
  }

  // 9. not_before check
  const effectiveStart = token.not_before ?? token.issued_at;
  if (now < effectiveStart) {
    throw new Error('Capability token is not yet valid (before not_before).');
  }

  // 10. Revocation check: the consent this token references, then the token
  // itself, read from the injected registry only (no registry → no access).
  const revocation = readRevocation(registries?.revocationRegistry, {
    capability_hash: token.capability_hash,
    consent_hash: consent.consent_hash
  });
  if (revocation.state === 'unavailable') {
    throw new Error(`Revocation status could not be determined: ${revocation.reason}`);
  }
  if (revocation.state === 'revoked_consent') {
    throw new Error('Parent consent has been revoked by its subject.');
  }
  if (revocation.state === 'revoked_capability') {
    throw new Error('Capability token has been revoked.');
  }

  // 11. Replay rejection (nonce/token_id uniqueness)
  const nonceRegistry = registries?.nonceRegistry ?? defaultNonceRegistry;
  if (nonceRegistry.hasSeen(token.token_id, opts.now ?? new Date())) {
    throw new Error(
      'Capability token_id has already been presented (replay detected).'
    );
  }
  nonceRegistry.markSeen(token.token_id, token.expires_at);
  nonceRegistry.cleanup?.(opts.now ?? new Date());
}
