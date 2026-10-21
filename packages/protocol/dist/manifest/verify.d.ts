import type { VerificationKeyResolver } from '../adapters';
import type { AuthorityClaim, DerivationClaim, OriginClaim, SignedClaim } from './claims';
import type { SignedSovereignManifest } from './manifest';
export type CheckOutcome = 'valid' | 'invalid' | 'not_performed';
export type BindingOutcome = 'verified' | 'unverified' | 'not_performed';
export interface SovereignManifestVerificationChecks {
    readonly manifestStructure: CheckOutcome;
    readonly manifestDigest: CheckOutcome;
    readonly signature: CheckOutcome;
    readonly contentDigest: CheckOutcome;
    readonly issuerBinding: BindingOutcome;
}
export interface SovereignManifestVerificationResult {
    readonly valid: boolean;
    readonly checks: SovereignManifestVerificationChecks;
    readonly reasons: readonly string[];
}
export interface VerifySovereignManifestOptions {
    /**
     * Raw content bytes to verify against `manifest.contentIdentity`. Omit
     * to skip content verification honestly (not silently pass it). If the
     * manifest declares no `contentIdentity`, supplying bytes here cannot
     * make a content check happen: there is no declared commitment to
     * compare them against, and Protocol will not invent one (see
     * `contentDigest` below).
     */
    readonly contentBytes?: Uint8Array;
    /**
     * Optional key->principal binding check. Without this, `issuerBinding`
     * is honestly reported as `not_performed` rather than implied by a
     * passing signature check — a valid signature only proves the holder of
     * `proof.publicKey` signed the payload, not that `proof.publicKey`
     * belongs to any particular principal (see
     * `docs/architecture/sovereign-asset-core.md` § "Signature ≠ Truth of
     * the Signed Claim").
     */
    readonly verificationKeyResolver?: VerificationKeyResolver;
    /** Issuer id to resolve a verification key for, when `verificationKeyResolver` is supplied. Defaults to `manifest.registrant` if it is a string. */
    readonly issuer?: string;
}
/**
 * Independently verifies a `SignedSovereignManifest`. Never returns a bare
 * `true`/`false` — every attempted check is reported individually, and a
 * check that was never attempted is reported as `not_performed` rather
 * than folded silently into an optimistic overall result. `valid` reflects
 * whether every *attempted* check passed; checks that were not attempted
 * (e.g. no `contentBytes` supplied) do not by themselves make the result
 * invalid, but they are visible in `checks` so callers can decide whether
 * that is acceptable for their use case.
 */
export declare function verifySovereignManifest(signed: SignedSovereignManifest, options?: VerifySovereignManifestOptions): Promise<SovereignManifestVerificationResult>;
/**
 * The claim union AOC.VERIFIABILITY structurally verifies today: exactly the
 * canonical sovereign claim types that have real runtime validators
 * (`validateOriginClaim`, `validateAuthorityClaim`, `validateDerivationClaim`)
 * and that participate in the production mineral architecture.
 *
 * Deliberately not `CanonicalClaim` in general, for the same reason
 * `PortableSovereignClaim` is not: there is no canonical runtime validator for
 * every current and future `CanonicalClaim` variant, so advertising structural
 * verification of an arbitrary one would be advertising an understanding
 * Protocol does not have. `ClaimType.Custom` is not used as an escape hatch for
 * that gap, and a future additive version can widen this union once the
 * validators exist.
 *
 * It is declared here rather than imported from `@aoc/protocol/portability`
 * because the dependency runs the other way — `portability` imports `manifest`,
 * never the reverse — and duplicating the *claim shapes* is exactly what is
 * avoided: this is a type alias over the three existing claim interfaces, not a
 * second claim model.
 */
export type VerifiableSovereignClaim = OriginClaim | AuthorityClaim | DerivationClaim;
/**
 * The independent dimensions of a signed sovereign claim's verification.
 *
 * `claimStructure` and `signature` are deliberately separate and deliberately
 * independent: an issuer can cryptographically sign malformed data, so
 * `claimStructure: 'invalid'` alongside `signature: 'valid'` is an ordinary,
 * expressible outcome rather than a contradiction or a crash. Equally,
 * `claimDigest` and `signature` are separate because the proof signs the claim
 * payload, not the `SignedClaim.digest` field beside it — tampering with only
 * that field invalidates the digest check while leaving the signature intact.
 *
 * `claimStructure`, `claimDigest` and `signature` are always attempted — the
 * claim is the target, so there is nothing to decline to check. `issuerBinding`
 * is the only three-state check, because binding a key to an issuer requires
 * knowledge Protocol does not have offline.
 */
export interface SovereignClaimVerificationChecks {
    readonly claimStructure: CheckOutcome;
    readonly claimDigest: CheckOutcome;
    readonly signature: CheckOutcome;
    readonly issuerBinding: BindingOutcome;
}
export interface SovereignClaimVerificationResult {
    readonly valid: boolean;
    readonly checks: SovereignClaimVerificationChecks;
    readonly reasons: readonly string[];
}
export interface VerifySignedSovereignClaimOptions {
    /**
     * Optional key->issuer binding check, with exactly the semantics
     * `VerifySovereignManifestOptions.verificationKeyResolver` has: without it,
     * `issuerBinding` is reported as `not_performed` rather than implied by a
     * passing signature. A valid signature proves the holder of
     * `proof.publicKey` signed the claim, never that `proof.publicKey` belongs
     * to the asserted issuer.
     */
    readonly verificationKeyResolver?: VerificationKeyResolver;
    /** Issuer id to resolve a key for. Defaults to the claim's own `issuer`. */
    readonly issuer?: string;
}
/**
 * Independently verifies a `SignedClaim`, reporting each dimension separately.
 *
 * Additive companion to `verifySovereignManifest`, with the same shape and the
 * same honesty rules. The claim digest and Ed25519 signature are checked with
 * exactly `verifySignedClaim`'s rules and reason codes
 * (`CLAIM_DIGEST_MISMATCH`, `CLAIM_SIGNATURE_INVALID`), mapped onto explicit
 * check outcomes, but over one snapshot of the input shared with the
 * structure and issuer checks (SOBE-SEC-01.1). What this adds on top is the two
 * things a bare digest/signature check cannot answer on its own: whether the
 * signed artifact is a structurally valid canonical sovereign claim, and
 * whether the signing key binds to the asserted issuer.
 *
 * What a passing result establishes, at most: the holder of the private key
 * matching `proof.publicKey` signed this canonical claim, and — when
 * `issuerBinding` is `verified` — the supplied resolver binds that key id to
 * the asserted issuer. It does not establish that the assertion is
 * historically true, that the issuer had authority to make it, that ownership
 * or a licence exists, that the key has not been revoked, or that the claim is
 * uncontested. A cryptographically valid claim can be `Contested`, and this
 * function neither reads nor writes claim standing.
 */
export declare function verifySignedSovereignClaim(input: SignedClaim, options?: VerifySignedSovereignClaimOptions): Promise<SovereignClaimVerificationResult>;
//# sourceMappingURL=verify.d.ts.map