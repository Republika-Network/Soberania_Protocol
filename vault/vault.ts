import type { ConsentObjectV1 } from '../consent';
import { assertConsentObjectAuthenticated, validateConsentObject, verifyConsentObjectProof } from '../consent';
import type { ScopeEntry } from '../consent/types';

import type { CapabilityTokenV1 } from '../capability';
import {
  isConsentHashRevoked,
  mintCapabilityToken,
  readRevocation,
  revokeCapabilityToken,
  revokeConsent,
} from '../capability';
import { InMemoryNonceRegistry } from '../capability/registries/InMemoryNonceRegistry';
import { InMemoryRevocationRegistry } from '../capability/registries/InMemoryRevocationRegistry';

import type { PackManifestV1 } from '../pack';
import { assertPackManifestAuthenticated, canonicalizePackManifestPayload, computePackHash } from '../pack';

import type { ContentOwnershipLookup } from './contentOwnership';
import type {
  Vault,
  VaultStore,
  VaultAccessRequest,
  VaultAccessResult,
  VaultErrorCode,
  VaultOptions,
  ResolvedField,
  UnresolvedField,
} from './types';

import {
  enforceConsentPresent,
  enforcePackPresent,
} from '../enforcement';
import { enforceCapability } from '../protocol/capabilities/capabilityEnforcer';

// --- SDL path validation scaffold (temporary) ---
// TODO(protocol/sdl): Replace this with canonical parser from protocol/sdl module
// Must align with protocol/sdl/README.md grammar.
const SDL_PATH_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;

function validateSdlPath(path: string): string | null {
  if (typeof path !== 'string' || path.trim() === '') {
    return `Invalid SDL path: "${path}". Must be a non-empty dot-separated path with at least 2 segments.`;
  }

  const normalizedPath = path.trim();

  if (!SDL_PATH_PATTERN.test(normalizedPath)) {
    return `Invalid SDL path: "${path}". Must be dot-separated lowercase segments allowing digits and hyphens.`;
  }

  return null;
}

function mapCapabilityDenyCode(code: string): VaultErrorCode {
  if (code === 'SCOPE_MISMATCH' || code === 'INVALID_SCOPE') {
    return 'SCOPE_ESCALATION';
  }

  if (code === 'MALFORMED_CAPABILITY') {
    return 'INVALID_CAPABILITY';
  }

  return code as VaultErrorCode;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value as Record<string, unknown>)) deepFreeze(inner);
  }
  return value;
}

function denyAccess(reason_codes: VaultErrorCode[]): VaultAccessResult {
  return {
    policy: {
      decision: 'DENY',
      reason_codes,
    },
    resolved_fields: [],
    unresolved_fields: [],
  };
}

function allowAccess(
  resolved_fields: ResolvedField[],
  unresolved_fields: UnresolvedField[]
): VaultAccessResult {
  return {
    policy: {
      decision: 'ALLOW',
      reason_codes: [],
    },
    resolved_fields,
    unresolved_fields,
  };
}

function denyDecision(decision: { decision: 'ALLOW' | 'DENY'; reason_codes: string[] }): VaultAccessResult {
  return denyAccess(decision.reason_codes as VaultErrorCode[]);
}

// --- Factory ---

export function createInMemoryVault(options?: VaultOptions): Vault {
  const store: VaultStore = {
    packs: new Map(),
    consents: new Map(),
    capabilities: new Map(),
    sdl_mappings: new Map(),
  };

  const nonceRegistry = options?.nonceRegistry ?? new InMemoryNonceRegistry();
  const revocationRegistry = options?.revocationRegistry ?? new InMemoryRevocationRegistry();
  const trustDomain = options?.trustDomain;
  const contentOwnership = options?.contentOwnership;
  if ((trustDomain === undefined) !== (contentOwnership === undefined)) {
    throw new Error('trustDomain and contentOwnership must be configured together.');
  }
  if (contentOwnership !== undefined && contentOwnership.trustDomain !== trustDomain) {
    throw new Error(`Content ownership authority answers for domain ${contentOwnership.trustDomain}, not ${trustDomain}.`);
  }

  /**
   * Whether `subject` currently owns `content_id` in this vault's trust domain,
   * according to the authority only. Nothing the vault stores can answer this.
   */
  function ownershipOf(content_id: string, subject: string): 'owned' | 'unknown' | 'other_owner' | 'unavailable' {
    if (contentOwnership === undefined || trustDomain === undefined) return 'unavailable';
    let lookup: ContentOwnershipLookup;
    try {
      lookup = contentOwnership.lookup(content_id);
    } catch {
      return 'unavailable';
    }
    if (!lookup || lookup.status === 'unavailable') return 'unavailable';
    if (lookup.status === 'unknown') return 'unknown';
    if (lookup.status !== 'owned' || lookup.record.trust_domain !== trustDomain) return 'unavailable';
    return lookup.record.owner === subject ? 'owned' : 'other_owner';
  }

  function storePack(input: PackManifestV1): string {
    // Keep a private copy: later changes to the caller's object cannot alter
    // what was verified and stored.
    const pack = JSON.parse(JSON.stringify(input)) as PackManifestV1;
    const payloadBytes = canonicalizePackManifestPayload({
      version: pack.version,
      subject: pack.subject,
      created_at: pack.created_at,
      fields: pack.fields,
    });

    const expectedHash = computePackHash(payloadBytes);

    if (pack.pack_hash !== expectedHash) {
      throw new Error('Pack pack_hash does not match canonical payload hash.');
    }

    // The subject named as owner must have signed the manifest: a pack is a claim
    // its subject made, not a string anyone can write.
    assertPackManifestAuthenticated(pack);

    // Possessing a content hash is not owning the content, and submitting first
    // establishes nothing. Every content id the pack lists must be attributed to
    // the pack's subject by the trust domain's ownership authority, which only an
    // authenticated custodial system provisions. Unknown or unavailable refuses.
    if (contentOwnership === undefined || trustDomain === undefined) {
      throw new Error('No content ownership authority is configured for this vault; packs cannot be registered.');
    }
    for (const field of pack.fields) {
      const state = ownershipOf(field.content_id, pack.subject);
      if (state === 'unavailable') {
        throw new Error(`Content ownership for ${field.content_id} could not be determined; refusing to register.`);
      }
      if (state === 'unknown') {
        throw new Error(`Content ${field.content_id} is not attributed to any subject in trust domain ${trustDomain}; provision it through the ownership authority first.`);
      }
      if (state === 'other_owner') {
        throw new Error(`Content ${field.content_id} is attributed to another subject in trust domain ${trustDomain}.`);
      }
    }

    store.packs.set(pack.pack_hash, pack);
    return pack.pack_hash;
  }

  function applyConsent(input: ConsentObjectV1): string {
    // Keep a private copy: later changes to the caller's object cannot alter
    // what was verified and stored.
    const consent = JSON.parse(JSON.stringify(input)) as ConsentObjectV1;
    validateConsentObject(consent);
    // Only the subject can grant or revoke. Unsigned (legacy) consents are refused.
    assertConsentObjectAuthenticated(consent);

    if (consent.action === 'revoke') {
      // A subject-signed revoke withdraws the consent named by prior_consent
      // (consent-object-spec §5.2–5.3) and with it every capability that
      // references that consent. Naming one token in revoke_target does not
      // narrow it: tokens are bearer objects that anyone holding the consent can
      // mint again, so only consent-level revocation is effective.
      const revokedConsentHash = consent.prior_consent;
      if (revokedConsentHash === null) {
        throw new Error('Revocation prior_consent must reference the consent being revoked.');
      }

      const originalConsent = store.consents.get(revokedConsentHash);
      if (!originalConsent || originalConsent.action !== 'grant') {
        throw new Error(`Revocation prior_consent does not reference a stored grant consent: ${revokedConsentHash}`);
      }
      if (originalConsent.subject !== consent.subject) {
        throw new Error('Consent subject must match revoked capability subject.');
      }
      if (originalConsent.grantee !== consent.grantee) {
        throw new Error('Consent grantee must match revoked consent grantee.');
      }
      if (consent.issued_at < originalConsent.issued_at) {
        throw new Error('Revocation issued_at must not precede the revoked consent.');
      }

      // The named token, if this vault minted it, must belong to that consent.
      // A token this vault never saw (minted elsewhere) is still revoked with it.
      const targetCapabilityHash = consent.revoke_target!.capability_hash;
      const targetCapability = store.capabilities.get(targetCapabilityHash);
      if (targetCapability && targetCapability.consent_ref !== revokedConsentHash) {
        throw new Error('Revocation prior_consent must reference the consent of the revoked capability.');
      }

      // Persisted before anything else can observe success: the consent first
      // (the authoritative withdrawal), then the named token for containment.
      revokeConsent(
        {
          consent_hash: revokedConsentHash,
          revocation_consent_hash: consent.consent_hash,
          subject: consent.subject,
          revoked_at: consent.issued_at,
        },
        revocationRegistry
      );
      revokeCapabilityToken(targetCapabilityHash, revocationRegistry);
    }

    store.consents.set(consent.consent_hash, consent);
    return consent.consent_hash;
  }

  /** Whether the consent is revoked; a registry that cannot answer reads as unavailable. */
  function consentRevocationState(consent_hash: string): 'clear' | 'revoked' | 'unavailable' {
    try {
      return isConsentHashRevoked(consent_hash, revocationRegistry) ? 'revoked' : 'clear';
    } catch {
      return 'unavailable';
    }
  }

  function storeConsent(consent: ConsentObjectV1): string {
    return applyConsent(consent);
  }

  function mintCapability(
    consent_hash: string,
    scope: ScopeEntry[],
    permissions: string[],
    expires_at: string,
    opts?: { now?: Date; not_before?: string | null }
  ): CapabilityTokenV1 {
    const consent = store.consents.get(consent_hash);

    if (!consent) {
      const err = new Error(`Consent not found: ${consent_hash}`);
      (err as any).code = 'CONSENT_NOT_FOUND';
      throw err;
    }

    // Nothing can be minted from a consent its subject has withdrawn.
    const revocation = consentRevocationState(consent_hash);
    if (revocation !== 'clear') {
      const code = revocation === 'revoked' ? 'CONSENT_REVOKED' : 'REVOCATION_UNAVAILABLE';
      const err = new Error(
        revocation === 'revoked'
          ? `Consent has been revoked by its subject: ${consent_hash}`
          : 'Revocation status could not be determined; refusing to mint.'
      );
      (err as any).code = code;
      throw err;
    }

    const token = mintCapabilityToken(consent, scope, permissions, expires_at, opts);

    store.capabilities.set(token.capability_hash, token);

    return token;
  }

  function registerSdlMapping(sdl_path: string, field_id: string): void {
    const pathError = validateSdlPath(sdl_path);

    if (pathError) {
      throw new Error(pathError);
    }

    store.sdl_mappings.set(sdl_path, field_id);
  }

  function requestAccess(request: VaultAccessRequest, opts?: { now?: Date }): VaultAccessResult {
    const { capability_token, sdl_paths, pack_ref } = request;

    // Step 1 — Consent enforcement
    const consent = store.consents.get(capability_token.consent_ref);
    const consentDecision = enforceConsentPresent(consent);

    if (consentDecision.decision.decision === 'DENY') {
      return denyDecision(consentDecision.decision);
    }

    if (!verifyConsentObjectProof(consent).valid) {
      return denyAccess(['CONSENT_UNAUTHENTICATED']);
    }

    // Step 1b — Revocation: a consent withdrawn by its subject authorizes no
    // token that references it, however the token was produced; a revoked token
    // hash is denied on its own. No registry answer means no access.
    const revocation = readRevocation(revocationRegistry, {
      capability_hash: capability_token.capability_hash,
      consent_hash: consent!.consent_hash,
    });
    if (revocation.state === 'unavailable') {
      return denyAccess(['REVOCATION_UNAVAILABLE']);
    }
    if (revocation.state === 'revoked_consent') {
      return denyAccess(['CONSENT_REVOKED']);
    }
    if (revocation.state === 'revoked_capability') {
      return denyAccess(['REVOKED']);
    }

    // Step 2 — Pack enforcement
    const pack = store.packs.get(pack_ref);
    const packDecision = enforcePackPresent(pack !== undefined, pack_ref);

    if (packDecision.decision.decision === 'DENY') {
      return denyDecision(packDecision.decision);
    }

    // Only the pack's owner can consent to access to it. A consent issued by
    // anyone else grants nothing here, even if its scope names this pack's content.
    if (pack!.subject !== consent!.subject) {
      return denyAccess(['CONSENT_MISMATCH']);
    }

    // Step 3 — Build field index
    const fieldByFieldId = new Map<string, { field_id: string; content_id: string }>();

    for (const field of pack!.fields) {
      fieldByFieldId.set(field.field_id, {
        field_id: field.field_id,
        content_id: field.content_id,
      });
    }

    // Step 4 — Deterministic ordering
    const sortedPaths = [...sdl_paths].sort();

    const resolved: ResolvedField[] = [];
    const unresolved: UnresolvedField[] = [];

    // Step 5 — Resolve paths deterministically
    let tokenConsumed = false;

    for (const sdl_path of sortedPaths) {
      const validationError = validateSdlPath(sdl_path);

      if (validationError) {
        unresolved.push({
          sdl_path,
          error: {
            code: 'INVALID_SDL_PATH',
            message: validationError,
            path: sdl_path,
          },
        });
        continue;
      }

      const field_id = store.sdl_mappings.get(sdl_path);

      if (!field_id) {
        unresolved.push({
          sdl_path,
          error: {
            code: 'UNRESOLVED_FIELD',
            message: `No mapping found for SDL path: ${sdl_path}`,
            path: sdl_path,
          },
        });
        continue;
      }

      const fieldRef = fieldByFieldId.get(field_id);

      if (!fieldRef) {
        unresolved.push({
          sdl_path,
          error: {
            code: 'UNRESOLVED_FIELD',
            message: `Field "${field_id}" not present in pack ${pack_ref}`,
            path: sdl_path,
          },
        });
        continue;
      }

      // The pack's subject must own this content now. A content id that was
      // transferred away, or never provisioned, releases nothing, however the
      // pack and the consent read. Checked before any token is consumed.
      const ownership = ownershipOf(fieldRef.content_id, pack!.subject);
      if (ownership !== 'owned') {
        return denyAccess([ownership === 'unavailable' ? 'OWNERSHIP_UNAVAILABLE' : 'CONTENT_NOT_OWNED']);
      }

      const contentDecision = enforceCapability({
        required_scope: `content:${fieldRef.content_id}`,
        token: capability_token,
        consent: consent!,
        resource_context: {
          resource_type: 'content',
          content_ref: fieldRef.content_id,
          pack_ref,
        },
        request_context: {
          subject: consent!.subject,
          grantee: capability_token.grantee,
          endpoint: 'vault.requestAccess',
        },
        now: opts?.now,
        registries: { nonceRegistry, revocationRegistry },
        consume: !tokenConsumed,
      });

      const accessDecision = contentDecision.allowed
        ? contentDecision
        : contentDecision.code === 'SCOPE_MISMATCH'
          ? enforceCapability({
              required_scope: `pack:${pack_ref}`,
              token: capability_token,
              consent: consent!,
              resource_context: {
                resource_type: 'pack',
                pack_ref,
              },
              request_context: {
                subject: consent!.subject,
                grantee: capability_token.grantee,
                endpoint: 'vault.requestAccess',
              },
              now: opts?.now,
              registries: { nonceRegistry, revocationRegistry },
              consume: !tokenConsumed,
            })
          : contentDecision;

      if (!accessDecision.allowed) {
        return denyAccess([mapCapabilityDenyCode(accessDecision.code)]);
      }

      tokenConsumed = true;

      resolved.push({
        sdl_path,
        field_id: fieldRef.field_id,
        content_id: fieldRef.content_id,
      });
    }

    return allowAccess(resolved, unresolved);
  }

  /**
   * A read-only snapshot. The vault's state can be changed only through its own
   * operations; nothing handed out here reaches the stored records.
   */
  function getStore(): Readonly<VaultStore> {
    const copy = <T>(entries: Map<string, T>): Map<string, T> =>
      new Map([...entries].map(([key, value]) => [key, deepFreeze(JSON.parse(JSON.stringify(value)) as T)]));
    return Object.freeze({
      packs: copy(store.packs),
      consents: copy(store.consents),
      capabilities: copy(store.capabilities),
      sdl_mappings: new Map(store.sdl_mappings),
    });
  }

  return {
    storePack,
    applyConsent,
    storeConsent,
    mintCapability,
    requestAccess,
    registerSdlMapping,
    getStore,
  };
}
