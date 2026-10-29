# Sovereign Status Profile — `soberania.sovereign-status/1`

**Status:** PROPOSED (FV-P4B). Not ratified, not part of the frozen integration contract, not exported by
`@aoc/protocol`. **Applies to:** `@aoc/protocol@0.2.0-rc.3`. **Reference verifier:** Frontera's
`verifySovereignStatus` (`@aoc-enterprise/sovereign-receiver-verification`).

A sovereign status is a statement, signed by an asset's registrant, about the asset *now*: whether it is
`active` or `withdrawn`, which manifest and which terms the registrant declares current, and where the
statement sits in the registrant's own sequence. It is built only from published rc.3 primitives
(`signSovereignPayload`, `verifySovereignSignature`, `deriveSovereignKeyId`, `aoc-canonical-json/1`). It adds
no type, no export, no proof format and no schema to Protocol.

## What this profile is not

```
a valid status signature   ≠ the latest status
a verified status          ≠ freshness, or proof that nothing revoked it later
assetStatus: active        ≠ an authorization, a permit or a capability
validUntil                 ≠ an operational freshness policy
sequence + previous digest ≠ global knowledge of the latest state
a status                   ≠ control over content already decrypted, copied or exported
```

A signature proves that a key signed particular bytes. It does not, by itself, establish that those bytes
represent the latest valid state. This profile defines what a status says and how its authenticity, authority,
binding and validity window are checked. Whether a presented status is the newest one is a separate question
that needs a trusted history (a receiver high-water mark, FV-P4C) or an independent witness, and this profile
does not answer it.

## 1. Payload

Every field is required and no other is allowed, at any level.

| Field | Type | Rule |
|---|---|---|
| `schemaVersion` | `'soberania.sovereign-status/1'` | exact; anything else is unsupported |
| `purpose` | `'soberania.sovereign-status.assertion'` | exact; the payload's domain tag (§3) |
| `sovereignAssetId` | string | a valid `SovereignAssetId` |
| `issuer` | string | the asset's registrant (§2), compared exactly |
| `manifestDigest` | string | the `manifestDigest` of the manifest the issuer declares current |
| `assetStatus` | `'active'` \| `'withdrawn'` | |
| `currentTerms` | `{ claimId, claimDigest }` \| `null` | the terms claim the issuer declares current; `null` when none are |
| `sequence` | number | a safe integer ≥ 1 |
| `previousStatusDigest` | string \| `null` | `null` exactly when `sequence` is 1; otherwise the previous status's digest |
| `issuedAt` | string | canonical UTC timestamp |
| `validUntil` | string | canonical UTC timestamp |

- **Digests** (`manifestDigest`, `claimDigest`, `previousStatusDigest`) are lowercase hex SHA-256 with no
  prefix, which is how rc.3 computes `manifestDigest`, a signed claim's `digest` and a proof's
  `payloadHash`.
- **Timestamps** use the `aoc-canonical-json/1` form `YYYY-MM-DDTHH:MM:SS[.f{1,9}]Z`, with real calendar
  dates. They are compared as instants, exactly to the nanosecond.
- **A status's digest** is its proof's `payloadHash`: SHA-256 of the payload's `aoc-canonical-json/1`
  serialization, which verification recomputes.
- **`withdrawn` is unambiguous:** a withdrawn status has `currentTerms: null`. A withdrawn status that names
  current terms is malformed.
- **`active` with `currentTerms: null`** means the asset stands but no terms are current: the previous terms
  are revoked and none replace them.
- **Superseding terms** is an `active` status whose `currentTerms` names the new claim.

## 2. Authority

- **Issuer:** in v1 only the asset's registrant may sign its status: the verified registrant of the current
  manifest (Frontera RSDK-01's `currentIssuer`). There is no delegation.
- **Key binding:** the receiver's pinned `VerificationKeyResolver`, asked for the registrant, must return a
  descriptor whose `issuer` is the registrant and whose `keyId` equals the proof's; the proof's `keyId` must be
  `deriveSovereignKeyId(proof.publicKey)`; a declared `algorithm` must be Ed25519. These are SOBE-SEC-01's
  issuer-binding invariants. A key that a status merely carries, or that is pinned for another principal,
  never signs for the registrant.
- **Key rotation** is out of band, as for manifests (`DOCUMENT_USE_PROFILE.md` §2). Unpinning a key makes
  every status it signed unverifiable, historical ones included.
- **Distributors are not authorities.** A mirror, CDN, storage service or Fileverse portal can carry a status
  but cannot vouch for it. It cannot forge one, but it can withhold a newer one.

## 3. Signing and domain separation

- **Signing:** `proof = signSovereignPayload(payload, privateKeyPem, signingKey)`. The proof is rc.3's
  `SovereignProof`, unchanged.
- **Transport:** the artifact is `{ status: payload, proof }`, serialized as `aoc-canonical-json/1`. A
  receiver accepts only that exact text: no whitespace, duplicate keys, reordered keys, escape variants or
  alternative number spellings. The signature is Node's unpadded base64url rendering of the 64 signature
  bytes. Other spellings of the same bytes are refused.
- **Unsigned proof fields:** `signedAt`, `keyId` and `publicKey` are not covered by the signature. `issuedAt`
  inside the payload is the signed time, and `proof.signedAt` is never relied on.
- **Domain separation lives in the payload.** rc.3's proof signs `sha256(aoc-canonical-json/1(payload))` with
  no external domain prefix, so the same primitive also signs manifests and claims. A status is kept apart
  from them by:
  - the exact `schemaVersion` and `purpose`, which are inside the signed bytes;
  - a closed schema that no manifest (`aoc-sovereign-manifest/1`) or claim satisfies;
  - the manifest and claim validators, which do not accept a status payload. rc.3's
    `validateSovereignManifestV1` and `verifySovereignManifest` throw on one rather than return a result,
    so a caller must treat a throw as a refusal.

  The separation is only as strong as those validators: every verifier must be exact. A proof format with a
  cryptographic domain prefix would be an additive Protocol change. It is not part of this version.

## 4. Sequence and history

- `sequence` orders the registrant's statuses for one asset. It is per `(sovereignAssetId, issuer)`, not per
  terms: superseding terms advances the same sequence.
- `previousStatusDigest` links each status to its predecessor. **It is declarative.** A verifier of one
  status checks only its form. Checking the link needs the predecessor, and detecting a missing, replayed or
  forked status needs a trusted history. That is FV-P4C, not this profile.
- **Transitions,** for a receiver that holds a trusted history:

  | From → to | v1 |
  |---|---|
  | `active` → `active`, same or other `currentTerms`, or `null` | allowed |
  | `active` → `withdrawn` | allowed |
  | `withdrawn` → anything | refused: withdrawal is terminal within one trusted history |

  A single-status verifier cannot see transitions, so it cannot enforce this table.
- **Equivocation:** two different statuses with the same sequence from the same registrant are a conflict. A
  receiver that sees both fails closed for the asset (FV-P4C).

## 5. Time and validity

For a host-supplied evaluation instant *t*, taken from the host's trusted clock and never from the status:

| Condition | Result |
|---|---|
| a timestamp is not canonical, or names an impossible date | refused |
| `issuedAt ≥ validUntil` | refused |
| `validUntil − issuedAt` > seven days | refused |
| *t* < `issuedAt` | refused (from the future) |
| *t* ≥ `validUntil` | refused (expired) |
| otherwise | within the status's own window |

There is no grace period and no millisecond rounding. **The seven-day bound limits the artifact. It is not
freshness:** a receiver's operational maximum age for a given action is a separate, stricter policy (FV-P4C).

## 6. Revocation

A registrant revokes by issuing a newer status: `currentTerms: null` revokes the terms, and `withdrawn` retires
the asset. An older status is never invalidated cryptographically. It stays authentic, and it keeps verifying
inside its own window. Therefore:

- **Revocation latency** is bounded by the `validUntil` of statuses already issued and by how fast receivers
  obtain the newer one.
- **A receiver that never saw the newer status** cannot detect the replay of an older, still-valid one. A
  shorter window narrows the exposure but cannot close it.
- **Offline, the window is the only bound.** A receiver that cannot reach the registrant or a witness can
  check a status against its own history, if it has one, and the status's own window. Nothing more. It
  cannot learn of a revocation it has not received.
- **Detection needs history or a witness:** a receiver with a trusted high-water mark refuses a lower
  sequence, and a witness lets it learn of statuses it never received. Neither is defined here.

## 7. Guarantees

**A conforming verifier of one status establishes, and only establishes:**
- **Authenticity:** the payload is exactly what the registrant's pinned key signed.
- **Authority:** the issuer is the expected registrant and the key is bound to it.
- **Form:** exact schema and purpose, closed structure, well-formed sequence and link, unambiguous
  `withdrawn`, one byte representation.
- **Binding:** the status names the asset and manifest the host verified, and the terms when the host asks.
- **Validity window:** *t* is inside `[issuedAt, validUntil)` and the window is at most seven days.

**It does not establish:**
- **Recency:** that the status is the latest, or that no later status revoked or superseded it.
- **Integrity of the history:** that the predecessor link is real, or that no status in between was withheld.
- **Authorization:** that any operation may run. `active` authorizes nothing.
- **Control over content:** over content already decrypted, copied, screenshotted or exported.
- **Certification:** of any platform, issuer or document.

## 8. Relationship to `soberania.document-use/1`

A document-use receiver can use a verified status to check that the terms it evaluated are the ones the
registrant declares current, by giving the verifier those terms as expected. That is a *binding* check
between one status and one terms claim. Whether the status itself is current is the freshness question in
§6, which this profile leaves to FV-P4C. `DOCUMENT_USE_PROFILE.md` §8 lists the limits that remain until
then.
