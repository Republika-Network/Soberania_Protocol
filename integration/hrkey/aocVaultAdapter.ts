/**
 * AocVaultAdapter — HRKey's thin integration layer over AOC Vault.
 *
 * Responsibilities:
 *   - Instantiate and hold a reference to an AOC Vault.
 *   - Translate HRKey domain calls into AOC Vault operations.
 *   - Expose ONLY the IHRKeyVaultAdapter interface to HRKey code.
 *
 * Non-responsibilities:
 *   - No business logic (scoring, pricing, matching).
 *   - No persistence (Vault is in-memory; adapter adds nothing).
 *   - No modification of AOC invariants.
 *
 * This module treats createInMemoryVault as a black-box factory.
 */

import { createInMemoryVault } from '../../vault';
import type { Vault } from '../../vault';
import type { ContentOwnershipAuthority } from '../../vault/contentOwnership';
import { buildConsentObject } from '../../consent';
import type { ConsentObjectV1 } from '../../consent';
import { normalizeConsent, parseConsent, validateConsent } from '../../protocol/consent';

import type {
  IHRKeyVaultAdapter,
  RegisterPackInput,
  RegisterPackResult,
  GrantConsentInput,
  GrantConsentResult,
  SignedConsentInput,
  MintCapabilityInput,
  MintCapabilityResult,
  AccessRequestInput,
} from './types';

import type { VaultAccessResult } from '../../vault';

// ─── Factory ────────────────────────────────────────────────────────

/**
 * Create an HRKey vault adapter backed by an in-memory AOC Vault.
 *
 * Usage:
 *   const adapter = createHRKeyAdapter({ trustDomain, contentOwnership });
 *   adapter.registerPack({ pack, sdl_mappings });
 *   const unsigned = adapter.prepareConsent({ candidate, employer, scope, permissions, expires_at });
 *   // the candidate's wallet signs it: signConsentObject(unsigned, candidateSigner)
 *   adapter.grantConsent({ consent: signedByCandidate });
 *   // ...
 *
 * For testing, pass an existing Vault instance to share state
 * across test helpers without exposing Vault internals to HRKey code.
 */
export type HRKeyAdapterOptions = {
  /** An existing Vault to share state with (tests); it must carry its own ownership authority. */
  vault?: Vault;
  /** The trust domain (tenant) and the content ownership authority that answers for it. */
  trustDomain?: string;
  contentOwnership?: ContentOwnershipAuthority;
};

export function createHRKeyAdapter(options: HRKeyAdapterOptions | Vault = {}): IHRKeyVaultAdapter {
  const given = 'storePack' in options ? { vault: options as Vault } : (options as HRKeyAdapterOptions);
  // Without an ownership authority the vault stores consents and mints, but
  // refuses every pack: HRKey cannot vouch for content ownership by itself.
  const v: Vault = given.vault ?? createInMemoryVault({ trustDomain: given.trustDomain, contentOwnership: given.contentOwnership });

  // ── registerPack ────────────────────────────────────────────────

  function registerPack(input: RegisterPackInput): RegisterPackResult {
    const { pack, sdl_mappings } = input;

    // Store the pack (Vault verifies hash integrity).
    const pack_hash = v.storePack(pack);

    // Register each SDL path → field_id mapping.
    // Vault validates SDL path format; throws on invalid paths.
    for (const mapping of sdl_mappings) {
      v.registerSdlMapping(mapping.sdl_path, mapping.field_id);
    }

    return {
      pack_hash,
      sdl_paths_registered: sdl_mappings.length,
    };
  }

  // ── prepareConsent / grantConsent ───────────────────────────────

  function prepareConsent(
    input: GrantConsentInput,
    opts?: { now?: Date },
  ): ConsentObjectV1 {
    const { candidate, employer, scope, permissions, expires_at } = input;

    // Build the consent object (AOC validates all invariants). It is unsigned:
    // the candidate's wallet must sign it before it grants anything.
    return buildConsentObject(
      candidate,
      employer,
      'grant',
      scope,
      permissions,
      {
        now: opts?.now,
        expires_at,
      },
    );
  }

  function grantConsent(input: SignedConsentInput): GrantConsentResult {
    const { consent } = input;

    if (consent.action !== 'grant') {
      throw new Error('grantConsent requires a grant consent.');
    }

    // Transitional adapter step while HRKey migrates to protocol consent core:
    // fail-closed before persistence if consent cannot be parsed/validated.
    const parsedConsent = parseConsent(consent);
    const normalizedConsent = normalizeConsent(parsedConsent);
    const validation = validateConsent(normalizedConsent);

    if (!validation.valid) {
      throw new Error(
        `Consent rejected by protocol core validator: ${validation.errors.join('; ')}`
      );
    }

    // Store in Vault. The Vault refuses consents not signed by their subject.
    const consent_hash = v.storeConsent(normalizedConsent);

    return { consent_hash, consent: normalizedConsent };
  }

  // ── mintCapability ──────────────────────────────────────────────

  function mintCapability(
    input: MintCapabilityInput,
    opts?: { now?: Date },
  ): MintCapabilityResult {
    const { consent_hash, scope, permissions, expires_at, not_before } = input;

    // Vault looks up parent consent, validates derivation invariants,
    // generates token_id, and stores the token.
    const capability = v.mintCapability(
      consent_hash,
      scope,
      permissions,
      expires_at,
      {
        now: opts?.now,
        not_before: not_before ?? null,
      },
    );

    return {
      capability_hash: capability.capability_hash,
      capability,
    };
  }

  // ── requestAccess ───────────────────────────────────────────────

  function requestAccess(
    input: AccessRequestInput,
    opts?: { now?: Date },
  ): VaultAccessResult {
    const { capability, sdl_paths, pack_hash } = input;

    // Direct pass-through. The Vault enforces:
    //   - Token verification (expiry, replay, revocation, derivation)
    //   - SDL path validation and resolution
    //   - Scope containment checks
    //   - Deterministic ordering of results
    return v.requestAccess(
      {
        capability_token: capability,
        sdl_paths,
        pack_ref: pack_hash,
      },
      opts,
    );
  }

  // ── revokeConsent ───────────────────────────────────────────────

  function revokeConsent(input: SignedConsentInput): void {
    if (input.consent.action !== 'revoke') {
      throw new Error('revokeConsent requires a revoke consent.');
    }
    // The Vault checks the candidate's signature, binds the revocation to the
    // stored consent it names, and records it before returning.
    v.applyConsent(input.consent);
  }

  // ── Public interface ────────────────────────────────────────────

  return {
    registerPack,
    prepareConsent,
    grantConsent,
    mintCapability,
    requestAccess,
    revokeConsent,
  };
}
