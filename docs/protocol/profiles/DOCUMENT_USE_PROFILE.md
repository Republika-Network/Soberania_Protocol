# Document-Use Profile — `soberania.document-use/1`

**Status:** PROPOSED (FV-P1, corrected by FV-P1.1). Not ratified, not part of the frozen integration contract,
not exported by `@aoc/protocol`. **Applies to:** `@aoc/protocol@0.2.0-rc.3`. **Fixtures:**
[`examples/fileverse-portable-asset/generate.ts`](../../../examples/fileverse-portable-asset/generate.ts),
tested by `tests/contracts/fv-document-use-fixture.test.ts`.

A profile is a convention over existing Protocol artifacts. This one says how an owner declares, over a
document that originated in Fileverse, which uses a receiving platform may make of it — using only the
published `SovereignManifestV1`, `LicenseTermsClaim` and `SovereigntyPortabilityBundleV1`. It adds no type,
no export and no schema to Protocol.

## What this profile is not

```
document-use/1 terms   ≠ enforcement
document-use/1 terms   ≠ DRM, or any control over decrypted or copied content
a conforming evaluator ≠ something that exists today
a verified bundle      ≠ an authorized operation
a valid signature      ≠ authority to declare terms
a Fileverse reference  ≠ proof that Fileverse holds, or ever held, the document
```

Nothing in this repository evaluates these terms or enforces a decision. Every rule below is labelled:
**implemented** names the rc.3 function (or Frontera RSDK-01 behaviour) that already checks it;
**normative** is what a future receiver-side evaluator (planned in Frontera, FV-P2 onwards) must do to claim
conformance; **gap** marks what nothing checks yet. A normative rule is never a statement that it is checked.

## 1. Asset binding

| Element | Profile rule | Status |
|---|---|---|
| Asset identity | `sovereignAssetId` minted with `mintSovereignAssetId`. Never derived from Fileverse identifiers or content. | implemented |
| Content binding | `contentIdentity` is SHA-256 of the **exact exported bytes** the receiver is given (for the fixtures, UTF-8 Markdown). Not the Fileverse IPFS CID, which identifies ciphertext. | implemented (`computeContentIdentity`; `verifySovereignManifest` with `contentBytes`) |
| Expected asset | **Normative:** the receiver always states which asset it was asked to act on and refuses any bundle, manifest or claim about another. | **gap** in rc.3: its verifiers take no expected subject. The bundle builder and parser only refuse artifacts whose subject differs from the bundle's own. RSDK-01 refuses another asset **only when the caller passes `expectedSovereignAssetId`**; the parameter is optional there and mandatory under this profile. |
| Content required | **Normative:** the receiver supplies the content bytes whenever the manifest declares a `contentIdentity`. | rc.3: without bytes, `contentDigest` is `not_performed` and `valid` stays `true`. RSDK-01: implemented (`CONTENT_BYTES_REQUIRED`). |

### Fileverse external reference

A document-use/1 reference is **exactly** this object, with no other field:

```ts
externalReference = {
  namespace: 'fileverse',
  id: 'gnosis:<portalAddress>/<fileId>',
}
// id must match /^gnosis:0x[0-9a-f]{40}\/(0|[1-9][0-9]{0,77})$/
//   portalAddress: lowercase hex; fileId: decimal, no leading zero, at most 78 digits (uint256)
```

- **Allowlist, not denylist (normative):** a reference is admitted only in that form. Any other shape is
  refused, never sanitized. That includes a `locator`, an extra field, uppercase hex, another chain or
  namespace, and any `%`, `#`, `?`, `&`, `=` or whitespace. The character set leaves no room for a
  share-link key (`#key=`) or its percent-encoded form (`%23key%3D`).
- **No locator in v1.** A Fileverse URL is the usual carrier of the `#key=` decryption fragment, and a
  locator would make a synthetic fixture look like a real document. A later version may add one under the
  same allowlist discipline.
- The reference names an origin. It is opaque to Protocol, never dereferenced, and is not an alternate
  identity. That the referenced file exists, or matches these bytes, is **not** established by anything here.
- **Enforced by the fixture builder** (`assertFileverseReference`, `buildFileverseExternalReference`), **not by
  Protocol**: `buildSovereignExternalReference` accepts any non-blank strings.
- **Synthetic fixtures:** every fixture reference uses the portal address
  `0x00000000000000000000000000000000000f1e01`, chosen to be recognisably fake. It is never looked up, and
  nothing here claims or checks that no contract exists at it.

## 2. Holder identity and authority

- **Registrant:** the manifest's `registrant` is the holder's principal id (a string in the fixtures).
  Protocol records it as who registered the asset, not as a proven legal owner.
- **Identity (implemented):** `verifySovereignManifest` / `verifySignedSovereignClaim` with a
  `VerificationKeyResolver` give `issuerBinding: 'verified'` only when a key the resolver pinned for the
  signed issuer produced the signature, and the proof's `keyId` is derived from its own public key
  (SOBE-SEC-01). A key naming the registrant without being pinned is `unverified`; a forged `keyId` is
  `ISSUER_BINDING_KEY_ID_NOT_DERIVED`.
- **Normative:** the receiver always passes a pinned resolver and requires `issuerBinding === 'verified'`
  explicitly. rc.3's `valid` is not enough: without a resolver the binding is `not_performed` and `valid` stays
  `true`. RSDK-01 already rejects `not_performed`.
- **Authority (normative, gap):** a receiver applies only terms whose issuer **is** the registrant of the
  current verified manifest (RSDK-01's `currentIssuer`). A signature, even one bound to a trusted key, proves
  who signed. It does not prove that the signer may declare terms for the asset. A resolver may legitimately
  pin many principals, each as itself.
  **Gap:** rc.3 compares a claim's issuer with an expected one only when the caller passes the opt-in
  `issuer` option. RSDK-01 does not pass it for claims, and by default nothing relates the terms issuer to the
  manifest registrant. The `third-party-terms` fixture pins this: a trusted non-registrant's terms verify
  fully, in rc.3 and in RSDK-01.
- **Key pinning** is out of band in this version. Delegation, key rotation and key validity windows are not
  defined (rc.3 does not evaluate `validFrom`/`validUntil`).
- **Creator, holder, custodian:** the creator may be recorded with an `originClaim`; the holder is the
  registrant; Fileverse appears only as the origin named by `externalReference`, never as an authority.

## 3. Actions and the obligated action

| Concept | Kind | `SovereignLicenseActionRef` |
|---|---|---|
| Read the document | action | `{ namespace: 'aoc.licensing', termRef: 'aoc.licensing:access' }` |
| Export the document out of the receiving platform | action | `{ namespace: 'soberania.document', termRef: 'soberania.document:export' }` |
| Modify protected terms | action | `{ namespace: 'soberania.document', termRef: 'soberania.document:modify-protected-terms' }` |
| Obtain the owner's approval before modifying protected terms | obligated action | `{ namespace: 'soberania.document', termRef: 'soberania.document:owner-approval.modify-protected-terms' }` |

The approval term is an ordinary **action concept** placed under an `Obligation`. That is the idiom Protocol
itself documents for requirements: an `Obligation` "over an external action concept" (`licensing/terms.ts`, on
payment expectations). It is not a special condition field, and Protocol gives it no behaviour. In
document-use/1:

- **The link** between `owner-approval.modify-protected-terms` and `modify-protected-terms` comes **only from
  this table**. An evaluator must not parse the `termRef` to derive it, just as Protocol never parses a
  `statement`.
- **Scope:** the obligation concerns `modify-protected-terms` only. It never affects `access` or `export`.
- **Who is obligated:** the audience (the receiver) must obtain the approval. The owner is not obligated.

## 4. Rule semantics (normative, not implemented)

For an action *A* and the single applicable terms document *T* (preconditions in §5 met), a conforming
evaluator returns exactly one of `ALLOWED`, `DENIED` or `WITHHELD`, applying these steps in order:

1. **Unknown concept:** a rule in *T* names a concept outside §3's table, so every action is `DENIED`. *A*
   itself outside the three actions is `DENIED`. A receiver must not silently ignore a requirement it cannot
   interpret.
2. **Misplaced effect:** a `Permission` or `Restriction` over the obligated action, or an `Obligation` over
   any of the three actions, has no meaning in v1, so every action is `DENIED`.
3. **Restriction wins:** a `Restriction` over *A* gives `DENIED`, whatever else *T* says about *A*.
4. **No permission:** no `Permission` over *A* gives `DENIED`. Nothing is permitted by default, and the
   audience never implies a permission.
5. **Approval required:** *A* is `modify-protected-terms`, *T* holds an `Obligation` over
   `owner-approval.modify-protected-terms`, and no valid approval evidence is presented, so `WITHHELD`.
   The approval evidence format is **not defined** by this version. It is expected to come from Frontera's
   approval authority (CORE-05) and to be bound to the operation. Until it exists, a conforming evaluator can
   only answer `WITHHELD` here and never upgrades it to `ALLOWED`.
6. **Otherwise** (a `Permission`, no `Restriction`, no unmet obligation), the answer is `ALLOWED`. In
   particular, a `Permission` over `modify-protected-terms` *without* the approval obligation is `ALLOWED`:
   that is the owner's choice.

`WITHHELD` is this profile's name for a decision paused on approval. Its mapping to Frontera's
`approval_required` / governed-action `withheld` is future work, and nothing here produces either value.

### Conflicts

- **Within one terms document:** step 3 settles any `Permission`/`Restriction` pair. Duplicate rules with the
  same effect are equivalent.
- **Between documents:** if more than one applicable terms claim exists for the asset, every action is
  `DENIED` until exactly one is applicable. rc.3 has no "current terms" resolver, and this profile does not
  invent one.
- **Between authorities:** only registrant-issued terms are applicable (§2), so a third party's terms can
  neither widen nor narrow them, however validly signed.

### Time

- **Expired:** `expiresAt` ≤ evaluation time, so every action is `DENIED`.
- **Not yet effective:** `effectiveAt` > evaluation time, so every action is `DENIED`.
- **Gap:** rc.3 deliberately evaluates neither field (`licensing/validation.ts`), and RSDK-01 reads no clock
  (`freshness: 'not_evaluated'`). An expired claim verifies, and the `expired-terms` fixture pins that.

### Audience (normative)

How each `SovereignLicenseTermsAudience` kind is matched against the receiver (founder decision, FV-P3.1):

- **`Principal`:** the terms are addressed to exactly that principal. A receiver matches only when its own
  trusted identity equals `principal` exactly: no case folding, trimming, prefix or pattern matching.
- **`Public`:** the terms are addressed to any receiver. This does **not** mean the document is publicly
  accessible, and it authorizes no operation. A receiver under a `Public` audience is still subject to every
  rule (`Permission`, `Restriction`, `Obligation`), to the time bounds, to the asset binding and to
  eligibility, and must still present a trusted identity. No audience turns a `Restriction` into a
  `Permission`.
- **`Custom`:** not interpreted by this profile version, so every action is `DENIED`.

The fixtures use a `Principal` audience. Frontera's FV-P3 evaluator covers the `Public` cases.

## 5. Receiver preconditions (normative)

A receiver may declare an asset **eligible for evaluation** only when *all* of the following hold. If any
fails, every action is `DENIED`, as it is on any evaluator error or timeout. `ALLOWED` is never a default, a
fallback, or a cached answer for a different asset, action or terms digest.

| # | Precondition | rc.3 | RSDK-01 (Frontera) | Status |
|---|---|---|---|---|
| 1 | Bundle text is byte-identical to its `aoc-canonical-json/1` serialization | parser accepts non-canonical text | `BUNDLE_NOT_CANONICAL` | exists (RSDK-01) |
| 2 | Manifest `manifestStructure`, `manifestDigest`, `signature` all `valid` | `verifySovereignManifest` | yes | exists |
| 3 | Claim `claimStructure`, `claimDigest`, `signature` all `valid` | `verifySignedSovereignClaim` | yes | exists |
| 4 | `validateLicenseTermsClaim(claim).valid` | available, separate call | not called | **FV-P2+** |
| 5 | A pinned `VerificationKeyResolver` is always supplied | optional | required | exists (RSDK-01) |
| 6 | `issuerBinding === 'verified'` for manifest and claim, checked explicitly | reported; `valid` tolerates `not_performed` | `not_performed` rejected | exists (RSDK-01) |
| 7 | `contentDigest === 'valid'` whenever `contentIdentity` is declared | `not_performed` without bytes | `CONTENT_BYTES_REQUIRED` | exists (RSDK-01) |
| 8 | `expectedSovereignAssetId` always supplied | no parameter | optional parameter | **receiver configuration** (FV-P2+) |
| 9 | Bundle subject, manifest and claim all name that asset | builder/parser: subject consistency | `SUBJECT_MISMATCH` when #8 is supplied | exists, conditional on #8 |
| 10 | Terms issuer = registrant of the current verified manifest | opt-in `issuer` option | not checked for claims | **gap, FV-P2+** |
| 11 | Exactly one applicable `LicenseTermsClaim` | — | — | **gap, FV-P2+** |
| 12 | Terms in effect (`effectiveAt`, `expiresAt`) at evaluation time | not evaluated | not evaluated | **gap, FV-P2+** |
| 13 | Audience is this receiver (receiver identity out of band) | — | — | **gap, FV-P2+** |
| 14 | Consumer support declared as in §7, result `compatible` | `assessSovereigntyInteroperabilityCompatibility` | `INTEROPERABILITY_*` | exists |

"Exists" means a published function or RSDK-01 check performs it today. It does not mean any receiver is
wired to run it. Rows 4 and 8–13 are what a document-use/1 receiver adds on top of RSDK-01.

## 6. Profile identification

- **Out of band in v1.** The receiver is configured to treat a given bundle as document-use/1.
  `SovereignLicenseTermsV1` has no field that could carry a profile id (its keys are exactly `schemaVersion`,
  `audience`, `effectiveAt`, `rules`). This profile does not overload one.
- **`statement` is not a contract.** It is human-readable text, recorded verbatim and never parsed, so a
  profile id written there means nothing. The fixtures deliberately do not write one there.
- **Unrecognised content:** §4 step 1 refuses any concept outside the table, and an RSDK-01 receiver that has
  not declared a concept gets `INTEROPERABILITY_PARTIAL` (§7). Both refuse unknown terms. Neither detects a
  profile *version*, and automatic version detection is out of scope for FV-P1.

## 7. Transport and receiver compatibility

- The bundle is a `SovereigntyPortabilityBundleV1` holding the `signed-manifest` and the `signed-claim` for
  the terms. **Transport is not verification:** `parseSovereigntyPortabilityBundle` checks structure and
  subject consistency only, and a bundle carrying tampered terms parses. Every signed artifact must be
  verified after parsing (§5).
- **Consumer support for RSDK-01** (`buildDocumentUseConsumerSupport()` in the fixtures). Validated against the
  RSDK-01 source in `Republika-worktrees/FV/frontera` with both the workspace `src` and the vendored
  `aoc-protocol-0.2.0-rc.3.tgz`:

  ```ts
  buildSovereigntyInteroperabilityConsumerSupportV1({
    profile: { id: 'aoc:interoperability-profile:sovereignty-portability', acceptedVersions: ['1.0.0'] },
    mediaTypes: ['application/vnd.aoc.sovereignty-portability+json'],
    representationSchemaVersions: ['aoc-sovereignty-portability-bundle/1'],
    canonicalizationProfiles: ['aoc-canonical-json/1'],
    artifactKinds: ['signed-manifest', 'signed-claim'],
    claimTypes: ['Authorship'],        // a LicenseTermsClaim travels as an Authorship claim
    standingStatuses: [],
    semanticTerms: [
      // AOC_LICENSING_DECLARATION_TERM_IDS, attached by Protocol to every terms claim
      { namespace: 'aoc.licensing', termRef: 'aoc.licensing:license-terms-declaration' },
      { namespace: 'aoc.licensing', termRef: 'aoc.licensing:permission-rule' },
      { namespace: 'aoc.licensing', termRef: 'aoc.licensing:restriction-rule' },
      { namespace: 'aoc.licensing', termRef: 'aoc.licensing:obligation-rule' },
      // §3 actions and obligated action
      { namespace: 'aoc.licensing', termRef: 'aoc.licensing:access' },
      { namespace: 'soberania.document', termRef: 'soberania.document:export' },
      { namespace: 'soberania.document', termRef: 'soberania.document:modify-protected-terms' },
      { namespace: 'soberania.document', termRef: 'soberania.document:owner-approval.modify-protected-terms' },
    ],
  })
  ```

  With the usual `claimTypes: ['Origin']` and no semantic terms, RSDK-01 rejects every document-use/1 bundle
  with `INTEROPERABILITY_PARTIAL` before any signature is checked. Omitting any single term above, the
  obligated approval action included, also makes the bundle only partially compatible. The contract tests
  pin both.
- Because `claimType` is `Authorship`, an evaluator must recognise terms by `metadata.kind === 'License'`
  and `validateLicenseTermsClaim`, not by claim type.

## 8. Revocation and freshness — limits

**Not implemented, and nothing in this version provides it.**

- rc.3 manifests do not chain, and a bundle may omit newer versions. A receiver cannot tell that the terms it
  holds were superseded or withdrawn, or that an older, more permissive terms claim was replayed.
- `CanonicalStanding` (including `Revoked`) is unsigned and grants or blocks nothing.
- A future version is expected to add an owner-signed status statement with a monotonic sequence and a
  `validUntil`, refused when stale. The behaviour when connectivity is missing would be the owner's declared
  maximum staleness, failing closed. This is **draft direction only, not a normative part of this profile**.
  The statement is now proposed as [`soberania.sovereign-status/1`](SOVEREIGN_STATUS_PROFILE.md) (FV-P4B).
  That profile defines the signed status and how one status is verified. Freshness and replay detection stay
  out of it, so every limit in this section still holds.
- Until then, revocation stops nothing: a receiver holding a valid bundle keeps a valid bundle.

## 9. Guarantees

**What rc.3 verification provides today, verified by the fixture tests, when the receiver supplies a pinned
resolver and the content bytes and checks every result field explicitly:**
- A portable asset identity bound to exact document bytes and a Fileverse-shaped origin.
- Detection of any change to signed terms or manifests made by someone who does not hold a pinned key:
  - a mutation that keeps the original proof breaks the digest and the signature;
  - a mutation re-signed with another key breaks the issuer binding, and that binding exists **only** with a
    pinned resolver.
- Rejection of a key that impersonates the registrant, and of a forged `keyId`.
- A canonical, byte-stable portable representation that survives transport and re-verifies.

Signatures and digests alone do not establish that the signer had authority over the asset (§2), that the
terms are current (§8), or that they are in effect (§4 Time).

**What it does not provide:**
- Any decision or enforcement: `ALLOWED`, `DENIED` and `WITHHELD` are not computed anywhere yet.
- Expiry, expected-subject, issuer-authority, single-terms, revocation or freshness checks inside Protocol.
- Any control over content once decrypted, copied, screenshotted or exported through a path that does not
  consult a conforming evaluator.
- Proof that the registrant holds legal rights, or that Fileverse holds the referenced document.
- Any statement that Fileverse, or any platform, is certified or conforms.

## 10. Fixtures

### Matrix

Results with the §7 consumer support, a pinned resolver, content bytes and `expectedSovereignAssetId`. RSDK-01
results were observed with both the workspace `src` and the vendored rc.3 tarball, from a scratch harness
outside both repositories, not from this repository's tests.

| Case | Manifest (rc.3) | Terms (rc.3) | RSDK-01 | Profile requires | Detected today |
|---|---|---|---|---|---|
| `valid-active` | valid | valid | verified | eligible for evaluation | — |
| `tampered-terms` | valid | invalid (`CLAIM_DIGEST_MISMATCH`, `CLAIM_SIGNATURE_INVALID`) | rejected | reject | yes |
| `wrong-asset` | valid | valid | rejected (`SUBJECT_MISMATCH`); **verified** without `expectedSovereignAssetId` | reject | only with #8 (§5) |
| `foreign-issuer` (impersonation) | invalid (`ISSUER_BINDING_KEY_ID_MISMATCH`) | invalid (same) | rejected | reject | yes, with a resolver |
| `third-party-terms` | valid | valid, binding `verified` | **verified** | reject | **no** (gap §2) |
| `expired-terms` | valid | valid | **verified** | reject | **no** (gap §4 Time) |

### Reproducibility

The generator mints fresh keys and asset ids on every call, so no private key ever exists outside one
process, and the tests compare against declared expectations, never stored signatures.
`toPublicTestVectors()` turns one fixture set into plain data:
- canonical bundle texts;
- content bytes;
- pinned `{ issuer, keyId }` pairs;
- expectations.

That data contains no private material and re-verifies on its own (the tests prove it). Shared vectors between
Soberanía and Frontera can therefore be signed bundles plus public key ids, exported once. Persisting such a
set, and where, is a separate decision outside FV-P1. A private signing key is never persisted to make
fixtures deterministic.
