import { CANONICAL_JSON_PROFILE } from '../canonical';
/**
 * Ed25519 signing primitives native to `@aoc/protocol`.
 *
 * `@aoc/protocol` has zero runtime-package dependencies (see
 * `scripts/check-version-graph.mjs`'s `role === 'protocol'` rule and
 * `docs/release/RELEASE_CANDIDATE_READINESS.md`), so this module cannot
 * import `@aoc-runtime/crypto`'s `signPayload`/`verifyPayloadSignature`/
 * `GovernanceSignature` even though they are the existing production-real
 * Ed25519 implementation this slice was asked to "connect". Instead, this
 * module reimplements the *identical primitive pattern* natively:
 * Ed25519 sign/verify via Node's built-in `node:crypto` over the SHA-256
 * digest of the `aoc-canonical-json/1` serialization of the payload — the
 * exact same algorithm choices `crypto/engine.ts`'s `signPayload`/
 * `verifyPayloadSignature`/`stableHash` make, using the one authoritative
 * canonicalizer (now owned by `@aoc/protocol/canonical`, which
 * `crypto/canonicalize.ts` itself re-exports). No new cryptographic
 * algorithm is introduced. See
 * `docs/architecture/sovereign-asset-core.md` for the full rationale.
 */
export interface SovereignSigningKey {
    readonly keyId: string;
    readonly algorithm: 'ed25519';
    readonly publicKey: string;
}
export interface SovereignKeyPair {
    readonly signingKey: SovereignSigningKey;
    readonly privateKeyPem: string;
}
export interface SovereignProof {
    readonly algorithm: 'ed25519';
    readonly canonicalizationProfile: typeof CANONICAL_JSON_PROFILE;
    readonly keyId: string;
    readonly publicKey: string;
    readonly signature: string;
    readonly signedAt: string;
    readonly payloadHash: string;
}
/** Lowercase hex SHA-256 of an already-canonical serialization. */
export declare function digestCanonicalBytes(canonical: string): string;
/**
 * A proof's fields, each read exactly once from the caller's object and
 * validated to be a string. Verification works only from this frozen copy,
 * so a proof object whose getters or proxy traps answer differently on each
 * read cannot show one key to the signature check and another to issuer
 * binding.
 */
export interface SovereignProofSnapshot {
    readonly algorithm: string;
    readonly canonicalizationProfile: string;
    readonly keyId: string;
    readonly publicKey: string;
    readonly signature: string;
    readonly signedAt: string;
    readonly payloadHash: string;
}
/**
 * Returns `undefined` (fail closed) when `value` is not an object, any field
 * is not a string, or reading it throws (e.g. a hostile proxy trap).
 */
export declare function snapshotSovereignProof(value: unknown): SovereignProofSnapshot | undefined;
/**
 * The key identity convention: a `keyId` is the lowercase hex SHA-256 of the
 * exact SPKI PEM text of the public key. Because the digest commits to the
 * PEM text, and the PEM text determines the key, a `keyId` recomputed from a
 * proof's `publicKey` can only equal a registered `keyId` when the proof
 * carries that registered key. The text is hashed as-is (no re-encoding), so
 * every key id ever produced by `generateSovereignKeyPair` keeps its value.
 */
export declare function deriveSovereignKeyId(publicKeyPem: string): string;
/**
 * Compares the Ed25519 key in a proof's `publicKey` (SPKI PEM) with a JWK, by
 * canonical SPKI DER bytes. `'unsupported'` means the JWK is not a public
 * Ed25519 OKP key; `'mismatch'` covers a proof key that is not Ed25519 too.
 */
export declare function compareSovereignPublicKeyToJwk(publicKeyPem: string, jwk: unknown): 'match' | 'mismatch' | 'unsupported';
/**
 * Generates a fresh Ed25519 key pair for signing sovereign manifests/claims.
 * Test/fixture callers should label their generated keys clearly; production
 * composition must source real keys from its own key-management
 * infrastructure rather than silently falling back to a generated or
 * hard-coded test key.
 */
export declare function generateSovereignKeyPair(): SovereignKeyPair;
/**
 * Signs `payload` (any canonicalizable value) and returns a portable proof.
 * The signature covers the SHA-256 digest of the payload's
 * `aoc-canonical-json/1` serialization — any later mutation of the payload,
 * however small, changes `payloadHash` and invalidates the signature.
 */
export declare function signSovereignPayload(payload: unknown, privateKeyPem: string, signingKey: SovereignSigningKey, now?: Date): SovereignProof;
/**
 * Recomputes the payload digest and verifies the Ed25519 signature over it.
 * Returns `false` (fail closed) for any unsupported algorithm/profile,
 * digest mismatch, or cryptographic verification failure — including
 * malformed signature/key material that throws inside Node's `verify()`,
 * and any `publicKey` that is not an Ed25519 SPKI public key.
 *
 * A `true` result proves only that the holder of `proof.publicKey` signed the
 * payload. It says nothing about who that holder is; issuer binding is a
 * separate check (see `verifySovereignManifest`).
 */
export declare function verifySovereignSignature(payload: unknown, proof: SovereignProof): boolean;
/**
 * Verifies `proof` over an already-canonical serialization. Callers that also
 * digest or inspect the payload use this with the same canonical string, so
 * every check examines the very bytes the signature covers.
 */
export declare function verifySovereignSignatureOverCanonical(canonical: string, proof: SovereignProofSnapshot): boolean;
//# sourceMappingURL=proof.d.ts.map