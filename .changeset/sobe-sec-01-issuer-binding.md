---
"@aoc/protocol": minor
---

Security (SOBE-SEC-01): make manifest and claim issuer binding cryptographic.

`verifySovereignManifest` and `verifySignedSovereignClaim` reported `issuerBinding: 'verified'` when
the resolved descriptor's `keyId` equalled the proof's `keyId` — a string comparison. The signature
itself was checked against the proof's own `publicKey`, and nothing tied that key to the `keyId` it
was presented under. A proof signed by any Ed25519 key could therefore claim a registered issuer's
`keyId` and be reported as issuer-verified.

Binding now requires, in addition to a valid signature:

- the proof's `keyId` to equal `deriveSovereignKeyId(proof.publicKey)` — the existing convention, the
  SHA-256 of the exact SPKI PEM text, now exported from `@aoc/protocol/manifest`;
- the descriptor's `keyId` and `issuer` to match the proof and the resolved issuer;
- the descriptor's `algorithm`, when present, to be `ed25519`;
- the descriptor's `publicKeyJwk`, when present, to be a public Ed25519 OKP key equal to the proof's
  key.

Each failure reports `ISSUER_BINDING_UNVERIFIED` plus a specific reason
(`ISSUER_BINDING_SIGNATURE_INVALID`, `…_ISSUER_MISMATCH`, `…_ALGORITHM_UNSUPPORTED`,
`…_KEY_ID_NOT_DERIVED`, `…_KEY_ID_MISMATCH`, `…_JWK_UNSUPPORTED`, `…_KEY_MISMATCH`).

`verifySovereignSignature` now accepts only a public key in its canonical Ed25519 SPKI PEM encoding —
byte-for-byte the text Node exports for that key, which is what `generateSovereignKeyPair` produces.
Previously a non-Ed25519 key (for example P-256 or Ed448) labelled `algorithm: 'ed25519'` could
produce a valid signature result, and a valid key followed by trailing text — including appended
private-key PEM — was accepted, giving one key unlimited key ids.

Verification now works from a single snapshot of its input (SOBE-SEC-01.1). Each proof field is read
once and must be a string; the manifest or claim is canonicalized once, and the digest, signature,
structure, content-identity and issuer checks all examine those same canonical bytes. Previously an
object whose getters or proxy traps answered differently on repeated reads could show one key to the
signature check and another to issuer binding, or have a signed manifest attest content it never
committed to. `verifySignedClaim` reads each field once in the same way. Malformed or unreadable
inputs (missing proof, non-string fields, throwing accessors) now fail closed instead of throwing.

AOC.VERIFIABILITY now attributes evidence from the same capture it verifies (SOBE-SEC-01.2).
Previously the capsule read the signed manifest or claim once to derive the evidence subject and the
issuer to bind, then handed the caller's original object to the verifier, which read it again. An
object answering differently on each read could therefore have a genuine signature reported `valid`
— and issuer-`verified` — under a subject or issuer the signed bytes never named. The capsule now
captures its input and the invocation subject once, derives subject and issuer from the manifest or
claim rebuilt from its canonical bytes, and hands that same capture to the verifier.
`invokeSovereigntyCapability` likewise reads the invocation envelope once, so the subject it validates,
the one the implementation sees and the one recorded in evidence are the same. A claim that cannot be
canonicalized is now reported through the capsule the way such a manifest already was
(`VERIFIABILITY_PAYLOAD_NOT_CANONICALIZABLE`). Unreadable input (throwing getters or proxy traps) is
rejected or reported invalid instead of surfacing as an implementation fault.

Compatibility of the envelope capture: implementations now receive a frozen copy of the invocation
carrying only the documented envelope fields (`input` is still the caller's value, by reference), so
an implementation that relied on the envelope's object identity, wrote to it, or read undocumented
fields from it must stop doing so. The subject is rebuilt from its canonical JSON, so a subject that
carries non-JSON data (an `undefined` or function-valued extra field) or exposes `sovereignAssetId`
only through a prototype getter is now rejected at preflight with `INVALID_INVOCATION_SUBJECT`.

No wire-format change: signed bytes, `payloadHash`, proof fields and schema versions are unchanged,
and every proof produced by `generateSovereignKeyPair` keeps its key id and still verifies, including
after a JSON round trip. Byte-exact PEM is now required: proofs whose `keyId` is not derived from
their key, descriptors whose `issuer` differs from the resolved issuer, and PEM text altered in
transit (CRLF-converted, re-wrapped, whitespace-padded) are rejected. Without a resolver,
`issuerBinding` remains `not_performed`: a valid signature still proves only that the holder of
`proof.publicKey` signed the payload.
