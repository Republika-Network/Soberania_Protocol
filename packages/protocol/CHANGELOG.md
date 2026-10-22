# @aoc/protocol

## 0.2.0-rc.3

### Minor Changes

- Security (SOBE-SEC-01, N1): issuer binding is always evaluated for the issuer the signed content names.

  `verifySovereignManifest` and `verifySignedSovereignClaim` accept an optional `issuer`, and
  AOC.VERIFIABILITY accepts an optional `issuerId`. These values previously replaced the issuer named
  in the signed manifest (`registrant`) or claim (`issuer`) as the identity the binding check resolved.
  They are now an expected issuer: they can narrow the acceptable identity, never replace it.

  - The issuer resolved and bound is always the signed one: a string, or a `CanonicalPrincipalRef`'s
    `id`.
  - An expected issuer that is not exactly equal to it — including when the signed content names no
    issuer — makes `issuerBinding` `unverified` with `ISSUER_BINDING_UNVERIFIED` and
    `ISSUER_BINDING_ISSUER_MISMATCH`, so `valid` is `false`. The `VerificationKeyResolver` is not
    consulted in that case.
  - Without an expected issuer, behaviour is unchanged.

  Compatibility: this is a caller-visible semantic change, classified minor. A caller that passed an
  `issuer` / `issuerId` different from the signed one now gets `unverified` instead of a binding for the
  value it passed. The comparison is exact: values differing only in case, whitespace or Unicode
  normalization do not match. A blank or non-string expected issuer is now a mismatch for the library
  functions (previously an empty string reported `not_performed`); AOC.VERIFIABILITY already rejected a
  blank `issuerId` as malformed input. No export, type, field or reason code is added or removed.

  Treat a result as authenticating its issuer only when `checks.issuerBinding` is `'verified'`; `valid`
  alone reports that every check that ran passed, and `issuerBinding` is `not_performed` when no
  resolver is supplied or no issuer can be resolved.

## 0.2.0-rc.2

### Minor Changes

- 2402b3a: Security (SOBE-SEC-01): make manifest and claim issuer binding cryptographic.

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

## 0.2.0-rc.1

### Patch Changes

- b5ced70: Fix a canonical-JSON defect that produced colliding cryptographic material for a class of numbers.

  `canonicalizeJSON` applied its trailing-zero normalization — `numberString.replace(/0+$/, '')` — to
  the whole `Number.prototype.toString()` output whenever that output contained a `.`. For a number
  rendered in exponential notation, the trailing zero being stripped belonged to the **exponent**:

  ```
  canonicalizeJSON(7.9e-10)   ->  "7.9e-1"
  canonicalizeJSON(7.9e-100)  ->  "7.9e-1"
  ```

  Two values ninety orders of magnitude apart produced identical canonical bytes and therefore
  identical SHA-256 material. The canonical form did not round-trip either: `"7.9e-1"` parses back as
  `0.79`. Any hash or signature computed over a value in this class committed to something other than
  the value it was given.

  The affected class is narrow — a fractional mantissa in exponential notation whose exponent ends in
  `0` — which is why it survived the existing golden-vector suite: `1e-10` and `0.79` are both
  unaffected, and every hand-written fixture landed outside it. It was found by Live Data Rail, which
  differentially fuzzed the shipped `0.2.0-rc.0` artifact against its own independent implementation
  while adopting the package, and reported it as UG-003.

  The normalization step is **removed**, not narrowed. It was dead for its stated purpose:
  `Number.prototype.toString()` already emits the shortest decimal string that reads back as the same
  double (ECMA-262 selects the fewest digits for which `Number(s) === x`), so it never produces a
  trailing fractional zero. The only inputs the step could ever alter were the ones it corrupted.
  Finite numbers now render via `toString()` verbatim.

  Behaviour outside the affected class is byte-identical, and this is measured rather than asserted:
  the public export map (`a67d65b1…`, 15 keys) and the runtime symbol set (`53ce2a00…`, 259 symbols)
  are unchanged, the full suite passes with no committed golden hash moving, and the existing numeric
  golden vectors (`3.14`, `1.5`, `0.1`, `0.1 + 0.2`, `9007199254740991`, `1e21`) all still hold.

  `-0` continues to render as `"0"` and remains indistinguishable from `0` in canonical form. That is
  pre-existing documented behaviour, deliberately left alone: changing it would change the bytes of
  every already-signed payload containing `-0`, and making `-0` distinguishable would be a separate,
  breaking profile decision.

  A blocking regression gate — `crypto/__tests__/canonicalize-numeric-fidelity.test.ts` — enforces the
  general invariant that makes this whole class of defect impossible rather than just this instance of
  it: **every finite number must canonicalize to a form that parses back to the same value.** It
  covers the reported cases as golden vectors, a full sweep of every decimal exponent the format
  allows, a seeded 50,000-case battery, subnormals, and explicit no-collision checks.

  `@aoc/protocol@0.2.0-rc.0` is **burned**. Its bytes (`sha256:dbe8a08f…`) are vendored and
  checksum-pinned by three internal consumers, so the repaired source could not be packed under that
  identity: doing so would replace an immutable candidate's identity under its own version and
  silently invalidate every downstream pin. Its release manifest, SBOM, consumer lock and RC artifact
  evidence are **unmodified**. The repair therefore ships as the next `rc` candidate, cut under
  founder authorization (P0-CANON-02) and derived by Changesets rather than hand-written.

  The frozen `aoc.cross-repository-integration` contract takes a **patch `contractVersion` bump** to
  follow the successor's identity — `protocol.version`, `distribution.candidateIdentity` and
  `distribution.artifactName` all name the candidate. The **export set does not change**, so under
  `changeControl` this is `editorialOrMetadataOnly`: a patch Changeset and a patch contractVersion,
  not a minor and certainly not a major. `protocol.exportMapDigest` is unchanged.

  No registry publication, no dist-tag, no `npm publish`, no git tag, no GitHub Release, no
  `private: false` flip, and no stable `0.2.0`. The successor is an **internal tarball** in the sense
  `PRERELEASE_POLICY.md` defines: built from a known commit and handed directly to a consumer,
  verified by checksum, never fetched from a registry. Downstream repositories are not repinned here;
  each is its own increment. See `docs/release/RELEASE_CANDIDATE_READINESS.md` §8–§9.

## 0.2.0-rc.0

### Minor Changes

- ab2ac6e: Stabilize the public shapes of `ScopedAccessRequest` and `AuditEventEnvelope` after their first
  real cross-repo consumption by AOC Enterprise (see PR #74 in `AOC-Enterprise`, which validated
  against the real tarball from PR #314 and documented three contract gaps).

  - **`ScopedAccessRequest`**: no shape change. Confirmed via git history that `requestedScope` is and
    has always been the sole canonical scope field — there is no `scope`/`action` predecessor to keep
    compatible. Added a facade parity assertion (`tests/contracts/symbol-parity.test.ts`) and
    declaration-level shape tests (`tests/contracts/audit-envelope-and-scoped-access-shape.test.ts`)
    that were previously missing.
  - **`AuditEventEnvelope`**: additive, backwards-compatible new optional fields — `occurredAt`,
    `subject: ResourceRef`, `correlationId: CanonicalId`, `reasonCodes: readonly string[]`, and
    `schemaVersion: string`. Existing required fields (`eventId`, `eventType`, `emittedAt`, `payload`)
    and the optional `actorId` are unchanged. These fields give downstream consumers with richer,
    product-specific audit event shapes (e.g. Enterprise's `event_id`/`occurred_at`/`subject_id`/
    `requester_id`/`request_id`/`reason`) a canonical, portable target to map onto without inventing
    incompatible shapes locally.
  - **`@aoc/audit-sdk`**: fixed `auditEventSchemaExample`, a pre-existing, unreferenced constant whose
    `required` field list (`schemaVersion`, `actor`, `action`, `resource`, `timestamp`,
    `tenantIsolation`) never matched the real `AuditEventEnvelope` shape since it was introduced. It now
    reflects the real required fields.
  - **`AocIdentityClaims`** (imported by AOC Enterprise but never exported by Protocol) is explicitly
    documented as an Enterprise-owned concept, not added to Protocol — see
    `docs/protocol/PUBLIC_API.md` "Governance decisions" for the full rationale. No Protocol code
    change follows from this; Enterprise's migration off the import is separate, Enterprise-side work.

  No exports were removed or renamed. No breaking changes. Not published.

- 0ed38d4: Add the canonical Sovereignty Capability registry as a new
  `@aoc/protocol/sovereignty-capabilities` subpath. Protocol now owns the
  identities, versions and discovery of the eight Sovereignty Capabilities —
  Identity, Integrity, Provenance, Portability, Interoperability, Verifiability,
  Licensing & Terms and Governance Compatibility — as stable
  `aoc:sovereignty-capability:<slug>` ids with explicit capability versions and a
  read-only, deterministic enumeration, plus `isSovereigntyCapabilityVersion` as the
  authoritative structural rule for a capability version. Additive only: no existing export changed,
  and the legacy capability grant/token models are untouched.
- 73b259a: Add the eighth and last production Sovereignty Capability capsule —
  `AOC.GOVERNANCE_COMPATIBILITY` — to `@aoc/protocol/sovereignty-capabilities`,
  together with a new `@aoc/protocol/governance-compatibility` subpath carrying the
  sovereign governance handoff it projects and validates.

  This closes the canonical eight-mineral architecture: eight canonical
  definitions, eight production capsules, no ninth mineral.

  SM-09 let an issuer say, machine-readably, what it declares about a sovereign
  subject. What was still missing was the last step: a way for a system that is not
  AOC to take custody of that sovereign state and govern it — and, just as
  importantly, a place for AOC Protocol to _stop_. SM-10 supplies exactly one new
  document for that, and refuses to supply anything beyond it.

  ## New subpath: `@aoc/protocol/governance-compatibility`

  `SOVEREIGN_GOVERNANCE_HANDOFF_SCHEMA_VERSION` (`aoc-sovereign-governance-handoff/1`)
  and `SovereignGovernanceHandoffV1`: exactly six top-level fields, in a closed
  envelope.

  | Field                     | Contract                                  | Owner                                    |
  | ------------------------- | ----------------------------------------- | ---------------------------------------- |
  | `schemaVersion`           | `'aoc-sovereign-governance-handoff/1'`    | this subpath                             |
  | `canonicalizationProfile` | `CANONICAL_JSON_PROFILE`                  | `@aoc/protocol/canonical`                |
  | `subject`                 | `SovereignSubjectRef`                     | `@aoc/protocol/identity` (SM-02)         |
  | `resource`                | `ResourceRef`                             | `@aoc/protocol/contracts`                |
  | `representation`          | `SovereigntyPortabilityBundleV1`          | `@aoc/protocol/portability` (SM-06)      |
  | `semantics`               | `SovereigntyInteroperabilityDescriptorV1` | `@aoc/protocol/interoperability` (SM-07) |

  Everything except the envelope is an existing contract, reused rather than
  re-declared: there is no `GovernedSubject`, `GovernedResourceRef`,
  `GovernanceBundleV1` or second semantic descriptor. An unknown top-level field —
  `policy`, `decision`, `grant`, `owner`, `authority`, `status`, `approval`,
  `governanceReady` — makes the handoff invalid, enforced by rejecting _any_
  unrecognized key rather than by denylisting the governance concepts somebody
  might try to add.

  There is deliberately no `handoffId`, `generatedAt`, `handoffDigest` or
  `signature`. The handoff is a deterministic projection of an existing subject,
  not a new sovereign object: the same representation and tenant produce a
  byte-identical canonical handoff every time, _when_ a projection happened lives in
  the SM-03 evidence, and integrity or proof over the document is explicit
  composition with `AOC.INTEGRITY` and `AOC.VERIFIABILITY` over its canonical
  serialization.

  Also exported: `buildSovereignGovernanceResourceRef`,
  `tryBuildSovereignGovernanceHandoffV1`, `buildSovereignGovernanceHandoffV1`,
  `validateSovereignGovernanceHandoffV1`, `isValidSovereignGovernanceHandoffV1`,
  `sovereignGovernanceSubjectsEqual` and
  `SOVEREIGN_GOVERNANCE_COMPATIBILITY_REASON_CODES`.

  ## `SOVEREIGN_GOVERNED_RESOURCE_KIND` becomes Protocol-owned

  ```
  resource.kind       = 'aoc:sovereign-asset'
  resource.id         = subject.sovereignAssetId
  resource.tenantId   = the caller's explicit governance context, if any
  resource.attributes = structurally absent in v1
  ```

  One kind for every subject — byte document, physical painting, plot of land,
  external token, AI agent, API resource, alien-system object — and
  `subject.externalReference.namespace` is opaque, so no branch reads it. The id is
  the sovereignty anchor, never a manifest digest, `ContentIdentity.digest`,
  external-reference id, locator, CID, provider id, database id, token address or
  registry record id: a subject that changes provider, locator, bytes or manifest
  version is still the same sovereign subject, and a grant keyed to a transient
  representation would silently detach the moment that representation changed.

  APV-02 froze the identical value as a _temporarily_ vertical-owned
  `PROTOCOLIZED_RESOURCE_KIND`, stating that promotion to Protocol becomes
  appropriate once a second, generic producer of sovereign-resource references
  appears. SM-10 is that producer, so there is now one authoritative definition. The
  dependency direction is unchanged: Asset Protocolization may consume Protocol,
  never the reverse; APV's stricter required tenancy stays a vertical constraint,
  while generic `tenantId` here is optional, preserved verbatim when supplied,
  rejected when blank, and never inferred or defaulted.

  The one pre-existing in-Protocol spelling of the same wire value — the SM-03
  evidence audit-envelope projection — now references the constant instead of
  repeating the literal.

  ## New capsule: `AOC.GOVERNANCE_COMPATIBILITY`

  Two operations, and no third:

  ```
  prepare-governance-handoff    representation (+ optional tenant) → handoff
  validate-governance-handoff   candidate document                 → validation report
  ```

  `prepare-governance-handoff` works with **no** invocation subject and returns the
  existing subject the representation arrived with; an explicitly supplied subject
  must match it exactly, and a mismatch fails without producing a document. Its
  input accepts no `actor`, `principal`, `action`, `scope`, `policy`, `authority`,
  `grant`, `decision`, `owner` or credential field, and its output carries the
  handoff and nothing else — no `ready`, `governable`, `complete` or `sufficient`
  flag, because Protocol cannot know what artifacts exist beyond the ones it was
  handed or what a policy it has never seen requires.

  An invalid _candidate_ under `validate-governance-handoff` is an ordinary
  **successful** execution reporting `valid: false`, the pattern Integrity,
  Interoperability, Verifiability and Licensing & Terms already established; no
  subject is fabricated from an unreadable one. A mismatching explicit subject over
  a _valid_ handoff is an attribution failure instead.

  Validation re-derives the canonical SM-07 descriptor from the handoff's own
  representation with SM-07's pure helper and compares it under
  `aoc-canonical-json/1`, so a descriptor that is individually well-formed and about
  the same subject but describes a _different_ bundle is rejected with
  `GOVERNANCE_COMPATIBILITY_SEMANTICS_MISMATCH`. Nothing is ever repaired.

  ## Governance compatible is not governed

  ```
  governance compatible ≠ governed
  handoff               ≠ decision
  resource reference    ≠ grant
  license terms         ≠ policy
  claim                 ≠ authority
  signature             ≠ authority
  registrant            ≠ owner
  authority             ≠ decision
  decision              ≠ enforcement
  structural validity   ≠ policy sufficiency
  ```

  A structurally valid handoff may carry zero claims, no licence terms, unsigned
  artifacts, contested standings, a `Permission` and a `Restriction` over the same
  action, and proofs that do not hold — every one a legitimate sovereign state
  governance may need _in order to_ decide.

  `invokeSovereigntyCapability` is not called anywhere in the mineral: the SM-06
  bundle validator and the SM-07 descriptor helper are reused as pure libraries, so
  one prepare produces exactly one evidence record rather than a hidden chain of
  them, and a caller may prepare a handoff directly without running
  Interoperability first. Nothing verifies a signature, resolves a key, binds an
  issuer, resolves a contested standing, picks a winner between contradictory
  clauses, turns a `Permission` into a grant or scope, a `Restriction` into a deny
  or an `Obligation` into a compliance status. No `PolicyDecision`,
  `ScopedAccessRequest`, `CapabilityToken`, `CapabilityGrant`, `ConsentGrant`,
  `Delegation`, `CanonicalCapability`, `CanonicalAuthority` or `CanonicalDecision`
  is constructed, and no owner or authority is inferred from a registrant, a claim
  issuer, a licence issuer or a valid signature. There is no network, filesystem,
  database, cache, chain, provider SDK, global registry, import-time side effect,
  randomness or clock, and no new runtime dependency — `@aoc/protocol` still has
  none.

  `SovereigntyPortabilityBundleV1`, the SM-07 profile and descriptor schema and the
  core `aoc.sovereignty` vocabulary are all unchanged: the handoff _wraps_
  Portability, and no `governance-handoff` artifact kind exists, so a handoff can
  never contain a representation containing a handoff. SM-10 adds no semantic
  vocabulary of its own.

  ## Coverage

  244 suites / 2317 tests green. All three packed-tarball consumer fixtures
  (`typescript-cjs`, `javascript-cjs`, `typescript-esm`) run the full eight-mineral
  flow against the installed artifact and hand the resulting handoff to a small
  external consumer that reads the resource, the semantics and the claims — and
  returns no allow and no deny, because it is not a policy engine and neither is
  anything upstream of it. Each fixture also tampers with `resource.id` and with the
  descriptor and confirms a successful execution reporting `valid: false`.

- 7244690: Add the first two production Sovereignty Capability capsules — `AOC.IDENTITY` and
  `AOC.INTEGRITY` — to `@aoc/protocol/sovereignty-capabilities`. SM-01 defined
  _what_ the eight sovereignty minerals are, SM-02 defined _what_ can receive
  sovereignty and SM-03 defined _how_ a capability is consumed; two of the eight
  are now real implementations of that socket rather than canonical descriptors
  beside disconnected primitives.

  New: `createIdentitySovereigntyCapabilityImplementation` and
  `createIntegritySovereigntyCapabilityImplementation`, their input/output
  contracts (`IdentitySovereigntyCapabilityInput` / `…Output`,
  `IntegritySovereigntyCapabilityInput` / `…Output` and the operation members),
  their public validators (`validateIdentitySovereigntyCapabilityInput`,
  `isValidIdentitySovereigntyCapabilityInput` and the Integrity equivalents), the
  stable reason-code maps `IDENTITY_SOVEREIGNTY_CAPABILITY_REASON_CODES` and
  `INTEGRITY_SOVEREIGNTY_CAPABILITY_REASON_CODES`, and
  `INTEGRITY_SOVEREIGNTY_CAPABILITY_OPERATIONS`.

  Identity creates a sovereign identity: it mints a new `SovereignAssetId`,
  associates an optional open-world external reference, binds an optional
  _precomputed_ `ContentIdentity`, records the registrant, and returns the
  resulting `SovereignSubjectRef` plus a canonical `SovereignManifestV1`. It
  requires no subject on the invocation and returns the one it created; an
  invocation that already names a subject is an ordinary failed outcome
  (`IDENTITY_SUBJECT_ALREADY_EXISTS`) rather than a second mint. Integrity wraps
  the existing `computeContentIdentity`, `verifyContentIdentity` and
  `computeManifestDigest` primitives behind three closed operations, works over
  bytes with no sovereign identity at all, and never mints one.

  No new semantics were invented underneath: `mintSovereignAssetId`,
  `buildSovereignManifestV1`, the SM-02 subject/reference validators and the three
  integrity primitives are reused verbatim, and there is no second hash, digest or
  canonicalization implementation.

  Deliberate boundaries. Identity never computes or verifies a `ContentIdentity`
  and Integrity never creates identity, so the two compose through their public
  output and input without either depending on the other. Identity does not sign:
  its output is a `SovereignManifestV1`, never a `SignedSovereignManifest`, because
  signature and issuer binding are Verifiability's contract — an unsigned manifest
  is a canonical record, not cryptographic proof. Identity asserts no ownership;
  `registrant` records who submitted a registration and nothing more. An Integrity
  digest mismatch is reported as a _successful_ check whose result is invalid
  (`CONTENT_DIGEST_MISMATCH`), never as a failed execution, so "the capability
  misbehaved" and "the assertion does not hold" stay distinguishable. Neither
  capsule performs network, provider, chain, registry or storage I/O, handles key
  material, or introduces provenance, lineage, licensing, governance, policy,
  grant, pricing or tokenization semantics.

  Additive only: no existing export changed, the canonical inventory remains eight
  and read-only, capability versions are unchanged at `1.0.0`, both capsules derive
  their advertised ref from the SM-01 registry rather than a literal, no module has
  import-time side effects, and no global implementation registry is introduced —
  a capsule is still passed explicitly to `invokeSovereigntyCapability`. The
  remaining six minerals are not production capsules. Both flows, and their
  composition under one shared correlation id, are verified from a real `npm pack`
  tarball by all three `test-consumers/` fixtures, using no fake implementation and
  no Enterprise package.

- cf03788: Add the fifth production Sovereignty Capability capsule — `AOC.INTEROPERABILITY` — to
  `@aoc/protocol/sovereignty-capabilities`, together with the self-describing
  sovereign profile, representation descriptor, consumer support declaration and
  compatibility evaluator on a new `@aoc/protocol/interoperability` subpath.

  SM-06 made a sovereign representation portable: it can leave one runtime as
  canonical JSON and be reconstructed elsewhere as the same representation. But a
  receiving system holding that JSON could read its field names and still not know
  what any of them _mean_, which of its semantics that system understands, or
  whether it could safely consume it. SM-07 closes that gap without translating,
  dropping or adjudicating anything.

  ## New subpath `@aoc/protocol/interoperability`

  **The canonical profile.** `AOC_SOVEREIGNTY_INTEROPERABILITY_PROFILE_V1` at
  `aoc-sovereignty-interoperability-profile/1` — a frozen, deterministic,
  provider-neutral document naming the profile id
  (`aoc:interoperability-profile:sovereignty-portability`), the profile version
  (`1.0.0`), the wire media type
  (`application/vnd.aoc.sovereignty-portability+json`), the SM-06 bundle schema,
  the `aoc-canonical-json/1` profile, the artifact kinds, the claim semantics and
  the semantic vocabulary. A consumer can read every negotiable fact from it
  without inspecting AOC source code.

  The profile version is deliberately not the npm package version: the package
  version moves whenever any part of `@aoc/protocol` changes, while the semantics
  an external system negotiates against must move only when those semantics do.
  The representation constants are imported from SM-06 and the canonical JSON
  profile rather than re-typed, so the profile cannot describe a bundle schema the
  bundle no longer uses. `AOC_SOVEREIGNTY_PORTABILITY_MEDIA_TYPE` is an AOC
  Protocol media-type identifier and claims no IANA registration.

  **The canonical sovereignty semantic vocabulary.**
  `AOC_SOVEREIGNTY_CORE_SEMANTIC_VOCABULARY` — ten terms under the
  `aoc.sovereignty` namespace covering Sovereign Subject, Sovereign Asset
  Identity, External Reference, Content Identity, Sovereign Manifest, Origin
  Assertion, Authorship Assertion, Derivation Assertion, Claim Standing and
  Portable Sovereign Representation, grouped into Identity, Integrity, Provenance
  and Portability categories. Built from the **existing**
  `CanonicalSemanticVocabulary`, `CanonicalSemanticCategory` and
  `CanonicalSemanticTerm` contracts — no parallel semantic model is introduced —
  and behaviour-free by construction: it states meanings and resolves, scores,
  evaluates and decides nothing. Every id is a stable Protocol constant; nothing
  is minted at import time.

  **The representation descriptor.** `SovereigntyInteroperabilityDescriptorV1` at
  `aoc-sovereignty-interoperability-descriptor/1`, describing one _concrete_
  bundle: the manifest and claim artifact kinds present, the historical manifest
  versions carried, the underlying claim types, the standing statuses, and the
  semantic concepts a consumer must understand. It duplicates no bundle payload,
  and carries deliberately no `descriptorId` and no `describedAt` — describing the
  same bundle twice produces the same value, and _when_ a description happened is
  recorded in the SM-03 invocation evidence. Semantic requirements are extracted
  from `CanonicalSemanticRef` as `namespace` + `termRef`: concept identity, never
  the ref's occurrence id, so two differently-identified refs to one concept
  deduplicate to one requirement.

  **The consumer support declaration.**
  `SovereigntyInteroperabilityConsumerSupportV1` at
  `aoc-sovereignty-interoperability-support/1`, supplied explicitly by the
  receiving system. Never inferred from a user-agent, package name, runtime or
  provider, and never fetched from a well-known URL, DID document, registry or
  DNS. It carries no consumer identity, because _who_ is asking changes nothing
  about the answer. Its validator fails closed on unknown vocabulary and on
  duplicate entries rather than silently cleaning a machine-readable contract;
  callers normalize their own input through
  `buildSovereigntyInteroperabilityConsumerSupportV1`.

  **The compatibility report.**
  `SovereigntyInteroperabilityCompatibilityReportV1` at
  `aoc-sovereignty-interoperability-report/1`, with an enumerated
  `compatible` / `partially-compatible` / `incompatible` status. Core requirements
  (profile identity and version, media type, bundle schema, canonicalization
  profile) are distinguished from feature requirements (artifact kinds, claim
  types, standing statuses, semantic concepts): a missing core requirement is
  incompatible, a missing feature is partial. Gaps are reported as explicit,
  deterministically sorted lists with stable reason codes — never as a score, a
  percentage or a confidence value, because a consuming system cannot act
  responsibly on a number. Profile versions match exactly; no "closest version" is
  chosen, and generic JSON support is never read as semantic support.

  ## New on `@aoc/protocol/sovereignty-capabilities`

  `createInteroperabilitySovereigntyCapabilityImplementation` with two operations
  — `describe-bundle` and `assess-compatibility` — and their typed input/output
  unions, validators and reason codes.

  `describe-bundle` works with **no** invocation subject, which is load-bearing: a
  receiving application usually has no local record of a subject that arrived from
  somewhere else. It returns the subject the bundle already carried; nothing is
  minted. An explicitly supplied subject is checked for exact SM-02 equality and
  never reconciled.

  An incompatible or partial compatibility report is an ordinary **successful**
  execution. The caller asked whether a consumer can consume a representation, and
  Interoperability determined the answer; "no" is a successful assessment, exactly
  as an Integrity check that correctly reports a digest mismatch has successfully
  checked. Capability failure is reserved for input that cannot be read at all: a
  malformed bundle, descriptor or support declaration, an unsupported operation,
  or a subject mismatch.

  ## Boundaries

  `SovereigntyPortabilityBundleV1` is **unchanged**. Its six-field contract gained
  no `interop`, `profile`, `mediaType`, `descriptor` or `compatibility` field:
  Interoperability operates beside the portability bundle, never inside it.

  Enforced by source-scanning tests, Interoperability never mints an identity,
  never signs or verifies, never computes or repairs a digest, never creates
  provenance, and never invokes the AOC.PORTABILITY capsule — it reuses the
  Portability bundle _contract_ and validator, which is contract reuse rather than
  hidden capability execution, so composing minerals stays the caller's decision.
  It reaches no filesystem, network, database, provider or Enterprise code,
  introduces no mutable profile or adapter registry, and carries no trust score,
  policy decision or ownership semantics. It branches on no subject namespace,
  asset type or business domain: a physical property, an external token, an
  autonomous agent, an API resource and a subject from an unknown system all
  describe through exactly the same architecture.

  `partially-compatible` never authorizes data loss. There is no
  `stripUnsupportedArtifacts`, no `downgradeBundle`, no
  `convertToSupportedSubset` and no `bestEffortImport`: after a partial report the
  bundle, its canonical wire form and the descriptor are byte-for-byte what they
  were, and an unsupported `Derivation` is reported as unsupported rather than
  rewritten into `ClaimType.Custom` or discarded.

  No external standard is implemented in any form — no W3C VC, DID, C2PA, SPDX,
  CycloneDX, JSON-LD, Open Badges, XACML, Rego or Cedar adapter, mapping or
  dependency. Those are mappings _between_ AOC semantics and someone else's, and
  they presuppose the stable self-describing statement of what AOC semantics are
  that this capsule establishes. Regulated-sector profiles are deferred on the
  same basis.

  221 suites / 1665 tests / 3 snapshots green, `protocol:rc:check` 21/21, and all
  three packed-tarball consumer fixtures verify the first five-mineral flow:
  Integrity, Identity, Provenance, Portability, transport, Portability again, then
  Interoperability describing what arrived and reporting full, partial and
  incompatible consumption against three declared support sets.

  Additive only: the canonical inventory remains eight and read-only, capability
  versions are unchanged at `1.0.0`, and no global implementation or profile
  registry is introduced. The profile, vocabulary, descriptor and compatibility
  report are Interoperability _artifacts_, not a ninth mineral — there is no
  `AOC.COMPATIBILITY`, `AOC.TRANSLATION`, `AOC.SCHEMA` or `AOC.SEMANTICS`.

- 82217cf: Add the seventh production Sovereignty Capability capsule — `AOC.LICENSING_TERMS` —
  to `@aoc/protocol/sovereignty-capabilities`, together with a new
  `@aoc/protocol/licensing` subpath carrying the structured, portable sovereign
  license terms model it declares and validates.

  SM-08 let an independent party check whether the proof attached to a sovereign
  artifact holds. But a subject that can be identified, measured, attributed,
  moved, described and verified still could not say, in a form a machine can read,
  what its issuer _declares_ may be done with it. The low-level claim architecture
  already had the right primitive — `AuthorityClaimKind.License` has existed since
  the manifest layer was written, and SM-05 deliberately left it outside the formal
  Provenance capsule for exactly this mineral — but a generic `AuthorityClaim`
  requires only a free-text `statement`, which is not enough for a production
  Licensing & Terms capability. SM-09 adds the missing structure without adding a
  single new claim type.

  ## New subpath: `@aoc/protocol/licensing`

  `SOVEREIGN_LICENSE_TERMS_SCHEMA_VERSION` (`aoc-sovereign-license-terms/1`) and
  `SovereignLicenseTermsV1`: a required audience, an optional issuer-supplied
  `effectiveAt`, and a required, non-empty, order-preserving list of clauses.

  | Field         | Shape                               | Notes                                                                          |
  | ------------- | ----------------------------------- | ------------------------------------------------------------------------------ |
  | `audience`    | `Public` \| `Principal` \| `Custom` | required; `Public` means a public _audience_, never public domain              |
  | `effectiveAt` | `CanonicalTimestamp?`               | when the issuer says terms begin applying; **never** defaulted from `issuedAt` |
  | `rules`       | `SovereignLicenseTermsRuleV1[]`     | non-empty, dense, caller-ordered                                               |

  Each clause carries a caller-supplied local `id`, an effect
  (`Permission`/`Restriction`/`Obligation`), an open-world action reference, and a
  required non-blank `statement`.

  `LicenseTermsClaim` is a **specialized `AuthorityClaim`** with
  `metadata.kind === AuthorityClaimKind.License` and `metadata.terms`.
  `buildLicenseTermsClaim` reuses `buildAuthorityClaim`, and
  `validateLicenseTermsClaim` reuses `validateAuthorityClaim` for the shared base
  rules rather than restating them.

  **No `ClaimType.License` was added**, `CanonicalClaim` is not forked, and there is
  no `LicenseClaimBase`, `TermsClaimBase`, `PermissionClaimBase` or
  `RestrictionClaimBase`. `ClaimType.Authorization` is deliberately not the
  representation either: it means "principal P is authorized to perform action A",
  a conclusion about an actor, while a licensing declaration is a premise somebody
  else may later reason from. Collapsing them would make every stored declaration
  read as an evaluated verdict.

  **Effects are `Permission`/`Restriction`/`Obligation`, not `Allow`/`Deny`.** Those
  two words name the output of a runtime decision, and a vocabulary that used them
  would invite every reader to treat a declaration as a verdict.

  **Actions are open-world.** A `(namespace, termRef)` concept pair, never a URL and
  never dereferenced. Inside the Protocol-owned `aoc.licensing` namespace a term
  must be one of this version's canonical action concepts — `aoc.licensing:comercial-use`
  is a typo worth rejecting — while `example.real-estate:lease`,
  `example.api:invoke`, `example.ai:fine-tune`, `example.token:transfer` and
  `future-system:quantum-copy` are preserved exactly and never claimed to be
  understood. A sovereign subject may be a document, an API, an AI agent, a parcel
  of land, an external token or something nobody has modelled yet, and a closed
  global action enum would make every one of those a Protocol change.

  **Closed structures, open metadata.** Every SM-09-owned structure — the terms
  document, each audience variant, each clause, each action reference — uses
  exact-key validation, so `automaticRoyaltyRate` fails closed rather than being
  accepted and silently ignored. `AuthorityClaim.metadata` as a whole stays open;
  that extensibility predates SM-09.

  **A new `aoc.licensing` semantic vocabulary**, built from the existing
  `CanonicalSemanticTerm`/`Category`/`Vocabulary` contracts — no second semantic
  framework — carrying the declaration and effect concepts plus a non-exhaustive
  core of eleven action concepts. The SM-07 core `aoc.sovereignty` vocabulary is
  **not** appended to: licensing concepts live in their own namespace precisely so a
  later mineral shipping cannot change what the interoperability profile advertises.

  ## New on `@aoc/protocol/sovereignty-capabilities`

  `createLicensingTermsSovereigntyCapabilityImplementation({ clock? })` with three
  operations and their typed input/output unions, validator and reason codes:

  | Operation                     | Input                                                                | Output                                         |
  | ----------------------------- | -------------------------------------------------------------------- | ---------------------------------------------- |
  | `declare-license-terms`       | issuer, statement, audience, rules, optional dates and evidence refs | one `LicenseTermsClaim`                        |
  | `validate-license-terms`      | an `unknown` candidate                                               | `valid` + stable reasons                       |
  | `contest-license-terms-claim` | a licensing claim + a reason                                         | the claim, unchanged, + a `Contested` standing |

  `declare-license-terms` requires `invocation.subject` and accepts no
  `sovereignAssetId` of its own, so a claim can never disagree with the invocation
  it was made under; it mints nothing and requires no bytes, no `ContentIdentity`
  and no manifest digest, which is what lets a building, a parcel of land, an API
  resource, an AI agent and an external token receive terms exactly as a file does.

  **Invalid candidate vs unreadable request.** Validating `{}` is an ordinary
  **successful** execution reporting `valid: false` — the capability answered the
  question. A malformed _declare_ request is a failed execution with no partial
  claim. Validation also runs with **no** invocation subject at all, attributing a
  valid candidate's own subject and never fabricating one for an unreadable
  candidate.

  ## Boundaries

  **No evaluation, in any form.** There is no `evaluate-license`,
  `is-action-permitted`, `is-action-restricted`, `isAllowed`, `isDenied`,
  `authorize-use`, `canUse`, `canDistribute`, `canDerive` or `check-obligation`
  operation, and no condition language to write one with — no `and`/`or`/`not`,
  operator, expression tree, CEL, Rego, Cedar, JSON Logic or XACML. Clause
  statements are inert data and are never parsed into policy.

  **No precedence.** A document may declare a `Permission` and a `Restriction` over
  the identical action; both are recorded and Protocol says only "the issuer
  declared both". Restriction does not beat permission, the latest claim does not
  win, signed does not beat unsigned, a verified issuer does not beat an unverified
  one, and principal-specific does not beat public. A subject may carry many
  contradictory declarations from many issuers and nothing resolves which is
  "current". `supersede-license-terms` is deliberately not implemented in v1.

  **No wall clock.** `issuedAt`, `effectiveAt` and `expiresAt` are declaration data.
  Nothing compares them to now, so there is no `isActive`, `isCurrentlyEffective`,
  `isExpiredNow` or `isNotYetEffective`, and no `StandingStatus.Active` or
  `.Expired` is ever created. `effectiveAt` is never defaulted from `issuedAt`, and
  `CanonicalClaim.expiresAt` is the one expiration field — the terms document has no
  second one. No ordering between the three is enforced, so a backdated correction
  and a retroactive licence stay expressible.

  Enforced by source-scanning tests, the capsule never signs (no private key,
  secret key, seed, mnemonic or KMS field exists in its input contract in any
  spelling), never verifies, never mints identity, never creates an `OriginClaim`,
  authorship claim or `DerivationClaim`, never inherits terms across a derivation
  edge, never reads a manifest's `registrant` as the licensing issuer, and produces
  no `owner`, `legalOwner`, `copyrightOwner` or `titleHolder` field and no transfer
  operation. It contains no price, currency, royalty rate, fee, revenue share,
  payment schedule, wallet or settlement address, no `calculateRoyalty`,
  `splitRevenue`, `invoice` or `meterUsage`, and no billing, tax or jurisdiction
  engine — a payment expectation is expressible as an `Obligation` over an external
  action concept plus a statement, with the instrument referenced through
  `evidenceRefs`, and nothing is calculated or settled. There is no encryption,
  watermarking, playback control, kill switch or copy prevention, no SPDX, Creative
  Commons, ODRL, RightsML or NFT-licence mapping, no filesystem, network, database,
  chain, provider, registry or resolver, no Enterprise or Asset Protocolization
  import, and no branch on subject namespace, media type, asset type or business
  domain — even `CommercialUse`, `Derive` and `Attribute` trigger no distinct
  production behaviour.

  ## Composition with the six existing minerals

  **Portability is unchanged.** `SovereigntyPortabilityBundleV1` keeps exactly six
  fields and gained no `licenses`, `terms` or `permissions` field: a
  `LicenseTermsClaim` is an `AuthorityClaim`, so the existing `claims` array carries
  it — unsigned as `kind: 'claim'`, signed as `kind: 'signed-claim'`. No
  `kind: 'license'` was invented. Round trips preserve claim id, subject, issuer,
  audience, rule order, external action concepts, `effectiveAt`, `expiresAt`,
  `semanticRefs` and `evidenceRefs` byte for byte.

  **Interoperability is unchanged.** Generated `semanticRefs` are ordinary
  `CanonicalSemanticRef`s with deterministic `<claimId>:semantic:<n>` ids,
  deduplicated by concept identity and ordered canonically, so the existing SM-07
  descriptor discovers licensing semantics — including external ones — with no
  descriptor schema change and no profile bump. A consumer supporting every
  licensing concept is `compatible`; one missing a single action concept is
  `partially-compatible`, and nothing is dropped, downgraded or rewritten.

  **Verifiability composes without Licensing signing anything.** The existing
  `signClaim` signs a `LicenseTermsClaim`, and the real `AOC.VERIFIABILITY` capsule
  verifies it. Tampering with a rule effect, statement, audience or action after
  signing is detected as a digest/signature failure, and Licensing repairs nothing.

  **Cryptographic validity is not terms validity**, and both directions are tested:
  an issuer can sign a structurally malformed terms document, so "signature valid"
  alongside "terms invalid" is an ordinary representable pair rather than a
  contradiction. A signed claim that verifies also stays byte-identical through
  contestation, so _cryptographically valid_ and _`Contested`_ coexist.

  **Provenance keeps its boundary.** A declaration creates no provenance claim, and
  terms never travel along a derivation edge: a child recorded as derived from a
  parent carrying terms receives none of them, and a `Permission`/`Derive` clause
  declares that deriving is permitted while saying nothing about the child's terms.

  ## Privacy

  Terms are frequently principal-specific or commercially sensitive, so the generic
  SM-03 evidence stays payload-free: capability, version, invocation id,
  timestamps, outcome, optional correlation id and optional subject — never the
  rules, statements, audience, claim or semantic refs.

  232 suites / 2056 tests / 3 snapshots green, `protocol:rc:check` 21/21, and all
  three packed-tarball consumer fixtures verify the first seven-mineral flow:
  Integrity measures the bytes, Identity mints the subject and manifest, Provenance
  records the derivation, Licensing & Terms declares structured permissions,
  restrictions and obligations over it, a TEST-ONLY issuer signs the resulting claim
  through the existing low-level primitives, Portability exports and a second
  runtime imports the canonical bundle, Interoperability discovers the licensing
  semantics and reports both full and partial compatibility, and Verifiability
  independently checks the transported proof — proving a valid signature, a
  fail-closed result for terms tampered with in transit, a signed-but-malformed
  document that is cryptographically valid and semantically invalid at once, and a
  valid signature coexisting with a `Contested` standing.

  Additive only: the canonical inventory remains eight and read-only, capability
  versions are unchanged at `1.0.0`, and no global implementation registry is
  introduced. Structured terms, the licensing vocabulary and the rule model are
  Licensing & Terms _semantics_, not a ninth mineral — there is no `AOC.LICENSE`,
  `AOC.RIGHTS`, `AOC.PERMISSION`, `AOC.RESTRICTIONS`, `AOC.ROYALTIES` or `AOC.DRM`.
  Governance Compatibility remains the one mineral with no production capsule, and
  nothing here anticipates its handoff.

- 5ed0670: Add the fourth production Sovereignty Capability capsule — `AOC.PORTABILITY` — to
  `@aoc/protocol/sovereignty-capabilities`, together with the canonical sovereign
  portability bundle on a new `@aoc/protocol/portability` subpath. SM-04 made
  Identity and Integrity real implementations of the SM-03 socket and SM-05 added
  Provenance; Portability now joins them, and the gap it closes is that a
  subject's sovereign representation previously existed only as live runtime
  objects inside whichever application created it.

  New subpath `@aoc/protocol/portability`:
  `SOVEREIGNTY_PORTABILITY_BUNDLE_SCHEMA_VERSION`
  (`aoc-sovereignty-portability-bundle/1`), `SovereigntyPortabilityBundleV1`, the
  manifest artifact union (`PortableSovereignManifestArtifact` over
  `{ kind: 'manifest' }` and `{ kind: 'signed-manifest' }`), the claim artifact
  union (`PortableSovereignClaimArtifact` over `{ kind: 'claim' }` and
  `{ kind: 'signed-claim' }` around `PortableSovereignClaim` =
  `OriginClaim | AuthorityClaim | DerivationClaim`), their closed kind
  vocabularies and accessors `portableManifestOf` / `portableClaimOf`,
  `buildSovereigntyPortabilityBundleV1` and its non-throwing
  `tryBuildSovereigntyPortabilityBundleV1`,
  `validateSovereigntyPortabilityBundleV1` / `isValidSovereigntyPortabilityBundleV1`,
  the artifact type guards, `serializeSovereigntyPortabilityBundle`,
  `parseSovereigntyPortabilityBundle`, and the stable
  `SOVEREIGNTY_PORTABILITY_REASON_CODES` map.

  New on `@aoc/protocol/claims`: the first runtime structural validators for
  `CanonicalStanding` — `validateCanonicalStanding` / `isValidCanonicalStanding`
  and `CanonicalStandingValidationResult`. The type was previously type-only, and
  a bundle that carries standing records across an external trust boundary needs
  to be able to check them. They validate shape only: no dispute is adjudicated,
  no timestamps are ordered and no `claimRef` is resolved.

  New on `@aoc/protocol/sovereignty-capabilities`:
  `createPortabilitySovereigntyCapabilityImplementation`, its input/output unions
  and per-operation contracts, `PORTABILITY_SOVEREIGNTY_CAPABILITY_OPERATIONS`
  (`export-bundle`, `import-bundle`), the stable
  `PORTABILITY_SOVEREIGNTY_CAPABILITY_REASON_CODES` map — which spreads in the
  bundle-level codes so one defect has one code on every surface — and
  `validatePortabilitySovereigntyCapabilityInput` /
  `isValidPortabilitySovereigntyCapabilityInput`.

  The bundle is a _representation_, not a new sovereign object. It has six
  envelope fields and deliberately no `bundleId` (the subject's identity is
  already `SovereignAssetId`), no `exportedAt` (an automatic timestamp would make
  the same sovereign state serialize differently every time; when an export
  happened is recorded truthfully in the SM-03 invocation evidence), no bundle
  digest, hash, checksum or signature, no provider, storage pointer, bucket,
  region, tenant, source-application or destination-application field, no content
  bytes, no completeness flag, and no licence, ownership, custody, policy or
  governance semantics. The subject is the SM-02 `SovereignSubjectRef` itself
  rather than a parallel portable subject model, and
  `externalReference.locator` is preserved verbatim but never dereferenced,
  required, or treated as identity or transport.

  Determinism is a contract, not an accident. Envelope arrays are copied and
  canonically ordered — manifests by `manifestVersion` ascending, claims by
  underlying claim `id`, standings by `id` — with duplicates on all three keys
  rejected so the order is total. Caller arrays are never mutated, and nested
  artifacts are never rewritten: `evidenceRefs` are not sorted, `authorityClaims`
  inside a historical manifest are not reordered, statements, locators and proof
  timestamps are untouched, and embedded manifest claims are not extracted or
  deduplicated against the bundle's own claim list. Canonical import
  normalization is envelope ordering only. The result is that an equivalent
  artifact set in any input order produces one canonical serialization, and
  repeated export/import cycles produce byte-identical output with no drift.

  Serialization is the existing `aoc-canonical-json/1` and nothing else: no
  second canonicalizer, no pretty-printed canonical form, and no ZIP, TAR, CBOR,
  MessagePack, protobuf, custom extension, compression or encryption.
  `parseSovereigntyPortabilityBundle` is an explicit external trust boundary that
  fails closed with a stable reason rather than a leaked `JSON.parse` exception —
  including on an unsupported _future_ bundle schema and on an unknown artifact
  kind, both rejected rather than best-effort imported or silently skipped, since
  for a sovereignty transport a failed import is strictly better than a quietly
  lossy one. Unrecognized fields in the structures SM-06 owns and rebuilds are
  reported rather than dropped; nested artifacts are carried by reference and
  never rebuilt. Structural validity is reported as `valid`, never `verified`.

  Boundaries are deliberate. Portability never mints a `SovereignAssetId` —
  `export-bundle` requires an existing subject (`PORTABILITY_SUBJECT_REQUIRED`)
  and `import-bundle` returns the existing subject that arrived in the bundle. It
  never signs or verifies: supplied `SignedSovereignManifest` and `SignedClaim`
  material is preserved exactly, so a structurally transportable but
  cryptographically invalid artifact transports successfully and is judged later
  by whoever is entitled to. It never computes a `ContentIdentity` or a manifest
  digest, and never repairs a supplied `manifestDigest`. It creates no provenance
  — transport history is not sovereign provenance — leaves a `Contested` standing
  contested, and never reactivates a manifest lifecycle state. It transfers no
  ownership, title, rights, custody or authority. It reaches nothing outside
  itself: no filesystem, network, provider, chain, registry, database or
  Enterprise dependency, no key material or credential, and no recursive ancestor
  expansion — a `DerivationClaim` naming sources A and B transports those
  references intact without fetching or building bundles for them.

  Import is not persistence. No `SovereignAssetRegistry` is injected, and that is
  not only principle: `register` takes a `SignedSovereignManifest` while
  AOC.IDENTITY produces unsigned ones, so defining import as "call register"
  would have made signing a precondition of portability. Import means the
  canonical AOC representation was accepted and reconstructed in memory; storing
  it is the consumer's infrastructure decision. `import-bundle` therefore works
  with **no** invocation subject, which is the ordinary case for a bundle
  arriving from elsewhere, and a subject supplied explicitly must match the
  bundle's exactly (`PORTABILITY_SUBJECT_MISMATCH`) rather than being reconciled.

  Integrity over a bundle is explicit mineral composition rather than a hidden
  field: serialize the bundle, then invoke AOC.INTEGRITY over the UTF-8 bytes.
  All three `test-consumers/` fixtures verify from a real `npm pack` tarball that
  this holds across a transport — the wire string and its `ContentIdentity` are
  identical before and after import — and the strongest fixture runs the first
  four-mineral flow end to end: Integrity measures bytes, Identity mints the
  subject and manifest, Provenance asserts an origin and contests it, Portability
  exports the canonical bundle, and a second runtime holding only the JSON string
  reconstructs the same subject, manifest, claim and standing. No fake
  implementation, no source import, no Enterprise package, no database and no
  provider.

  Additive only: no existing export changed, the canonical inventory remains
  eight and read-only, capability versions are unchanged at `1.0.0`, the capsule
  derives its advertised ref from the SM-01 registry rather than a literal, no
  module has import-time side effects, and no global implementation registry is
  introduced. The portability bundle is a Portability _contract_, not a ninth
  mineral. SM-06 establishes one canonical AOC wire representation and a
  versioned schema so it can be safely imported at all; whether a non-AOC system
  can understand, map or translate those semantics is AOC.INTEROPERABILITY's
  question, and no external-standard mapping exists here.

- 07f82e2: Add the third production Sovereignty Capability capsule — `AOC.PROVENANCE` — to
  `@aoc/protocol/sovereignty-capabilities`, together with the first first-class
  derivation relationship and lineage semantics in `@aoc/protocol/manifest`.
  SM-04 made Identity and Integrity real implementations of the SM-03 socket;
  Provenance now joins them, and the major semantic gap it closes is derivation
  lineage, which the Protocol previously had no machine-identifiable way to
  express.

  New on `@aoc/protocol/claims`: the additive `ClaimType.Derivation` member. No
  existing `ClaimType` value was removed, renamed or re-spelled.

  New on `@aoc/protocol/manifest`: `DerivationClaim`, `DerivationRelationKind`
  (`DerivedFrom`, `TransformedFrom`, `CombinedFrom`, `ExtractedFrom`,
  `GeneratedFrom`, `Custom`) with `DERIVATION_RELATION_KINDS`,
  `BuildDerivationClaimInput`, `buildDerivationClaim`, and the structural
  validators `validateDerivationClaim` / `isValidDerivationClaim` plus
  `validateOriginClaim` / `isValidOriginClaim` and `validateAuthorityClaim` /
  `isValidAuthorityClaim` for the pre-existing claim types. Lineage traversal
  arrives as `traceSovereignLineage` with `SovereignLineageTrace`,
  `SovereignLineageNode`, `SovereignLineageEdge`, `SovereignLineageDirection`,
  `SOVEREIGN_LINEAGE_DIRECTIONS`, `SOVEREIGN_LINEAGE_TRACE_SCHEMA_VERSION`
  (`aoc-sovereign-lineage-trace/1`), `DEFAULT_SOVEREIGN_LINEAGE_MAX_DEPTH` and
  its input validators.

  New on `@aoc/protocol/sovereignty-capabilities`:
  `createProvenanceSovereigntyCapabilityImplementation`, its input/output unions
  and per-operation contracts, `PROVENANCE_SOVEREIGNTY_CAPABILITY_OPERATIONS`
  (`declare-origin`, `declare-authorship`, `record-derivation`,
  `contest-provenance-claim`, `trace-lineage`), the stable
  `PROVENANCE_SOVEREIGNTY_CAPABILITY_REASON_CODES` map, and
  `validateProvenanceSovereigntyCapabilityInput` /
  `isValidProvenanceSovereigntyCapabilityInput`.

  Lineage lives in the claim layer, not the manifest. `SovereignManifestV1`
  gained **no** `parentId` and no derivation field of any kind: a manifest field
  would force a tree, make multi-parent composition inexpressible, turn a
  contestable assertion into an identity field, and conflate manifest evolution
  (the same subject at version 2) with asset derivation (a different subject made
  from this one). A `DerivationClaim`'s `subject` is the child and its asserted
  sources travel in metadata, so a subject can carry zero, one or many derivation
  assertions from issuers who disagree. Sources are named by `SovereignAssetId`
  and never by locator, provider, external reference, `ContentIdentity` or
  manifest digest, so an edge survives provider migration and re-encoding.

  Boundaries are deliberate. Provenance requires an existing subject and mints
  none (`PROVENANCE_SUBJECT_REQUIRED`); it needs no bytes, `ContentIdentity` or
  manifest digest, so a building or an API resource receives provenance exactly
  like a file does. It never signs or verifies — `signClaim`, `verifySignedClaim`
  and the manifest signing primitives are unchanged, still public, and remain
  Verifiability's contract; the claims returned here are unsigned canonical
  records. It never mutates a manifest, and contesting a claim returns a
  `Contested` `CanonicalStanding` beside the untouched original rather than
  deleting it, changing manifest state, or deciding who is right. Nothing is
  inherited along a derivation edge: no licence, rights, obligations, authority,
  authorship, evidence refs or governance policy. Equal `ContentIdentity` creates
  no lineage and lineage implies no equal `ContentIdentity`. The formal capsule
  exposes only `declare-authorship` with the kind fixed to `Authorship`; the
  low-level `buildAuthorityClaim` still offers `License`, `Rights` and `Custom`,
  which stay out of this capsule so the Licensing & Terms boundary holds. No
  network, provider, chain, registry, database or filesystem access, and no key
  material — `assertedOrigin` is stored as data and never dereferenced.

  `trace-lineage` is a pure function over caller-supplied claims: there is no
  global lineage database, graph service or external graph dependency. Traversal
  is iterative and visited-set guarded, ordering is deterministic (by depth, then
  `SovereignAssetId`), `maxDepth` truncation is reported through `truncated`
  rather than presented as a complete lineage, and a cycle in the supplied data
  is reported as `cycleDetected` on a **successful** analysis. Cycle detection is
  a real back-edge search, so ordinary multi-parent diamonds are not mistaken for
  loops. A single `record-derivation` rejects direct self-reference and claims
  nothing about global acyclicity, and contested claims are not silently removed
  from a trace — Protocol preserves history rather than hiding it.

  Additive only: no existing export changed, the canonical inventory remains
  eight and read-only, capability versions are unchanged at `1.0.0`, the capsule
  derives its advertised ref from the SM-01 registry rather than a literal, no
  module has import-time side effects, and no global implementation registry is
  introduced. Derivation is a Provenance semantic, not a ninth mineral. All flows
  — Identity → Provenance composition, multi-parent derivation, ancestor and
  descendant traversal, and contestation — are verified from a real `npm pack`
  tarball by all three `test-consumers/` fixtures, using no fake implementation
  and no Enterprise package.

- c79e752: Complete the public Sovereign Asset Core package boundary with canonical
  SovereignAssetId parsing, version-preserving registry resolution, and a packed
  external-consumer acceptance flow covering identity, content hashing,
  canonicalization, manifest signing, resolution, verification, and tamper
  detection.
- d70d525: Add the common Sovereignty Capability invocation and evidence spine to
  `@aoc/protocol/sovereignty-capabilities`. SM-01 defined _what_ the eight
  sovereignty minerals are and SM-02 defined _what_ can receive sovereignty;
  Protocol can now also express _how one is consumed_, through a single generic
  contract that carries any of the eight from request to result to portable
  evidence.

  New: `SovereigntyCapabilityRef` (a portable canonical id + explicit capability
  version, derived from the SM-01 registry via `toSovereigntyCapabilityRef` /
  `getSovereigntyCapabilityRef` / `getSovereigntyCapabilityRefByKey`);
  `SovereigntyCapabilityInvocationId` and `mintSovereigntyCapabilityInvocationId`
  (`aoc:sovereignty-capability-invocation:<uuid>`, independent of capability,
  subject, correlation, input and timestamp);
  `SovereigntyCapabilityInvocation<TInput>` with its builder and validator;
  `SovereigntyCapabilityImplementation<TInput, TOutput>` and the explicit
  success/failure `SovereigntyCapabilityExecutionOutcome<TOutput>`;
  `SovereigntyCapabilityResult<TOutput>`;
  `SovereigntyCapabilityInvocationEvidenceV1`; `invokeSovereigntyCapability`; and
  the typed `SovereigntyCapabilityInvocationError`.

  The subject is deliberately optional at the common layer, so an
  Identity-shaped invocation can begin before any `SovereignAssetId` exists and
  return the one it creates, an Integrity-shaped invocation can consume raw bytes
  with no sovereign identity at all, and an existing `SovereignSubjectRef` —
  including an open-world external reference from a namespace Protocol has never
  heard of — travels through unchanged. Capability input is never canonicalized,
  copied or inspected by this layer, so binary and non-JSON payloads remain
  legitimate.

  Evidence is portable, canonicalizes under `aoc-canonical-json/1`, and carries
  the exact capability id and version, the invocation id, timestamps, optional
  correlation id and subject, the outcome and any stable reason codes — and never
  the raw input, the raw output, bytes, credentials, exception text or stack
  traces. It is a statement that an invocation occurred, not proof that the
  implementation was trustworthy or that any claim it made is true; unsigned
  invocation evidence is not cryptographic proof. Persistence reuses the existing
  Protocol-owned `AuditEventSink`/`AuditEventEnvelope` rather than adding a second
  logging architecture, and is genuinely optional: with no sink configured the
  result still carries the full evidence record.

  Additive only: no existing export changed, the canonical inventory remains eight
  and read-only, no global implementation registry is introduced, and no
  production implementation of any capability ships in this change — SM-04 owns
  the first real Identity and Integrity capsules. No Enterprise policy, grant,
  authorization, enforcement or billing semantics enter the invocation path.

- b1b4056: Decouple sovereign identity from content integrity and add the universal
  sovereign subject reference. `@aoc/protocol/identity` now exports
  `SovereignSubjectRef` (`sovereignAssetId` plus an optional
  `externalReference`) and `SovereignExternalReference`
  (`namespace` + opaque `id` + optional passive `locator`), with minimal
  open-world validation, `buildSovereignExternalReference`,
  `isValidSovereignSubjectRef`, `sovereignExternalReferencesEqual` and
  `toSovereignSubjectRef`. `SovereignManifestV1` now extends
  `SovereignSubjectRef`, so `externalReference` is signed manifest material,
  and `contentIdentity` became optional: a sovereign subject with no
  byte-addressable representation — an AI agent, an API resource, an external
  token, a physical-asset reference, an object in a namespace Protocol has
  never heard of — is a first-class subject that no longer has to fabricate a
  digest to be registered. Integrity is unchanged when declared (same sha256
  semantics, wrong bytes still fail); a manifest that declares none reports
  `contentDigest: 'not_performed'` rather than a fabricated result, even when
  the caller supplies bytes. Additive under `aoc-sovereign-manifest/1`: every
  existing content-backed manifest builds, signs, verifies and resolves
  exactly as before, no existing export changed, and Protocol still performs
  no network activity — locators are signed metadata, never dereferenced.
- 3304abd: Add the sixth production Sovereignty Capability capsule — `AOC.VERIFIABILITY` — to
  `@aoc/protocol/sovereignty-capabilities`, together with the additive
  `verifySignedSovereignClaim` reporting helper on `@aoc/protocol/manifest`.

  SM-07 let a receiving system determine what an arriving sovereign representation
  _means_. But understanding what an artifact claims to be says nothing about
  whether the proof attached to it holds. AOC Protocol already owned strong
  cryptographic primitives — `SovereignProof`, `SignedSovereignManifest`,
  `SignedClaim`, `verifySovereignManifest`, `verifySignedClaim`,
  `verifySovereignSignature` — but no capability exposed them through the common
  SM-03 socket, so an independent consumer could not ask the question through the
  same contract every other mineral answers through. SM-08 closes that gap without
  adding a single line of new cryptography.

  ## New on `@aoc/protocol/sovereignty-capabilities`

  `createVerifiabilitySovereigntyCapabilityImplementation({ verificationKeyResolver? })`
  with three operations and their typed input/output unions, validators and reason
  codes:

  | Operation                | Target                                                       | Report                                                                |
  | ------------------------ | ------------------------------------------------------------ | --------------------------------------------------------------------- |
  | `verify-signed-manifest` | `SignedSovereignManifest`                                    | structure, manifest digest, signature, content digest, issuer binding |
  | `verify-signed-claim`    | `SignedClaim` over an Origin, Authorship or Derivation claim | claim structure, claim digest, signature, issuer binding              |
  | `verify-sovereign-proof` | any canonicalizable payload + a `SovereignProof`             | valid/invalid with a stable reason                                    |

  Every check is reported individually. A verification never collapses to one
  boolean, and a check that was not attempted is reported as `not_performed`
  rather than folded into an optimistic result.

  **Verification-first, deliberately.** There is no `generate-key-pair`,
  `sign-manifest`, `sign-claim` or `sign-payload` operation. The SM-03 invocation
  input is a generic transport shared by every capability, and turning it into a
  carrier for `privateKeyPem`, seed phrases, KMS secrets or wallet secrets would
  solve the wrong problem. No private key field exists in the input contract in
  any spelling, nothing in the capsule calls `generateSovereignKeyPair`, and
  nothing in it signs. All signing primitives remain public and unchanged, and are
  exactly what the test suites and all three packed consumer fixtures use to
  produce the artifacts they then verify. A managed signer/KMS abstraction is
  deferred rather than invented to fill the gap.

  **No content bytes.** `verify-signed-manifest` accepts none, so
  `checks.contentDigest` is honestly `not_performed` even for a manifest that
  carries a real `ContentIdentity`. Accepting bytes would make the mineral
  boundary read "Verifiability secretly performs Integrity"; a caller wanting both
  runs AOC.INTEGRITY over the bytes and AOC.VERIFIABILITY over the signed
  manifest, correlating them with one `correlationId`. Nothing ever turns
  `not_performed` into `valid`.

  **Optional, three-state issuer binding.** The Protocol-owned
  `VerificationKeyResolver` is _injected_, never discovered — no global lookup, no
  mutable registry, no ambient default. Without one the binding is
  `not_performed`; a resolver returning no descriptor or a different `keyId` gives
  `unverified` and an invalid verification; a resolver that throws is a failed
  execution with `VERIFIABILITY_KEY_RESOLUTION_FAILED`, exactly one attempt, no
  retry and no leaked exception text, message, stack or credential. "Not checked"
  and "checked and did not bind" stay distinct facts. Signature validity and
  issuer binding are independent dimensions, and all four combinations are
  expressible.

  **Invalid artifact vs unreadable invocation.** A bad signature, a digest
  mismatch, a malformed claim, an unsupported proof algorithm or canonicalization
  profile, a non-canonicalizable payload and an unverified binding are all
  ordinary **successful** executions with `verification.valid === false` — the
  machine answered the question, and the answer was "no", exactly as an Integrity
  digest mismatch has successfully checked. Capability failure is reserved for
  input that cannot be read at all: an unknown operation, a missing target, a
  subject that is not the artifact's, or a resolver fault.

  ## New on `@aoc/protocol/manifest`

  `verifySignedSovereignClaim` — the additive companion to
  `verifySovereignManifest`, reporting `claimStructure`, `claimDigest`,
  `signature` and a three-state `issuerBinding` as separate outcomes. It reuses
  `verifySignedClaim` for the digest and signature and the existing
  `validateOriginClaim` / `validateAuthorityClaim` / `validateDerivationClaim`
  validators for the structure, preserving their reason codes verbatim. This is
  what makes an important case expressible: an issuer can cryptographically sign
  malformed data, so `claimStructure: 'invalid'` alongside `signature: 'valid'`
  is an ordinary outcome rather than a contradiction or a crash.
  `VerifiableSovereignClaim` is a type alias over the three existing canonical
  claim interfaces — not a second claim model.

  Purely additive: `verifySignedClaim`, `verifySovereignManifest`,
  `verifySovereignSignature`, `signClaim`, `signSovereignManifest`,
  `signSovereignPayload` and `generateSovereignKeyPair` are all unchanged in
  signature and semantics.

  ## Boundaries

  No new cryptography. `aoc-canonical-json/1` + SHA-256 + Ed25519 remain the only
  profile: no secp256k1, ECDSA, RSA, BLS, P-256, Keccak, SHA-3, multihash,
  `personal_sign`, EIP-712 or chain signature format is interpreted, and there is
  no second canonicalizer, SHA implementation, Ed25519 verifier or base64url
  decoder anywhere in the capsule.

  Enforced by source-scanning tests, Verifiability never signs, generates or
  stores a key, never accepts content bytes, never mints an identity, never
  creates provenance, never reads or writes claim standing, never creates a
  `CanonicalVerification` record, never widens `VerificationStatus`, never
  requires a `VerificationProvider`, and never invokes another capsule. It
  performs no revocation lookup, no certificate-chain or PKI validation, no DID
  resolution and no key-validity-window policy; it emits no allow/deny decision,
  no trust, confidence or risk score, and no ownership, licence or legal-authority
  field. It reaches no filesystem, network, database, chain, wallet, provider or
  Enterprise code, introduces no global key registry or trusted key store, and
  branches on no subject namespace, asset type or business domain — an alien
  namespace, a property registry, an external token system, an AI agent and an API
  resource all produce byte-identical reports.

  Nothing is mutated: no public key normalized, no `keyId` rewritten, no
  `payloadHash` repaired, no signature replaced, no artifact re-signed and no
  canonicalized rewrite returned as a "fixed" artifact. A broken proof stays
  broken. The verification report is deterministic and carries no `verifiedAt`,
  `reportId` or `verificationId` — _when_ a verification ran is the SM-03
  evidence's job — and the report itself is never signed, so no recursion exists.

  The generic SM-03 evidence carries no key material, signature, payload hash,
  manifest digest, signed artifact, resolver descriptor or verification report:
  only capability, version, invocation id, timestamps, outcome, optional
  correlation and optional subject.

  `SovereigntyPortabilityBundleV1` is **unchanged** — its six-field contract
  gained no verification field — and the SM-07 profile and descriptor are
  unchanged too. A descriptor reports that a `signed-claim` is _present_; it never
  reports that the signature holds, and it did not start doing so because a capsule
  now exists.

  ## Epistemic boundaries

  A passing signature establishes, at most, that the holder of the private key
  matching the proof's public key signed this canonical payload — plus, when
  `issuerBinding` is `verified`, that the caller's resolver binds that key id to
  the asserted issuer. It establishes nothing about historical truth, legal
  ownership, authorization, licence validity, key revocation status, trust or what
  any system should do next. A signed `DerivationClaim` verifying proves the
  issuer asserted the derivation, never that it happened; a cryptographically
  valid claim can be `Contested` at the same moment, and a test proves both facts
  coexist with neither adjudicating the other.

  224 suites / 1795 tests / 3 snapshots green, `protocol:rc:check` 21/21, and all
  three packed-tarball consumer fixtures verify the first six-mineral flow:
  Integrity measures the bytes, Identity mints the subject and manifest, Provenance
  records the derivation, a TEST-ONLY issuer signs both artifacts through the
  existing low-level primitives, Portability exports and a second runtime imports
  the canonical bundle, Interoperability detects the signed artifacts, and
  Verifiability independently checks them — proving a valid signature, an honestly
  unperformed content check, a bound and a wrongly-bound issuer key, and a
  fail-closed invalid result for an artifact tampered with in transit.

  Additive only: the canonical inventory remains eight and read-only, capability
  versions are unchanged at `1.0.0`, and no global implementation or key registry
  is introduced. Cryptographic proof and signature semantics are Verifiability
  _semantics_, not a ninth mineral — there is no `AOC.CRYPTOGRAPHY`,
  `AOC.SIGNATURE`, `AOC.TRUST`, `AOC.PROOF` or `AOC.KEYS`.

### Patch Changes

- 18a5493: Add canonical credential contracts for RFC-005 trust model portability and explainability.
- 1b26d97: Ship the frozen cross-repository integration contract as package metadata, and add a producer for the
  installable release-candidate artifact (P0-PKG-01).

  **No public export was added, removed or renamed.** `exports` is byte-identical to the previous
  release; protocol semantics and build output are unchanged. This is a packaging and evidence change
  only, hence `patch`.

  PMFreak's verified Founder journey still consumes repository-local source copies
  (`"@aoc/protocol": "file:src/aoc/protocol"`), which proves the code composes but proves nothing about
  the three layers composing as independently packaged repositories. This closes the Protocol third of
  that gap.

  - **`integration-contract.json` now ships at the root of the tarball** as unexported metadata — the
    same class as `LICENSE` and `NOTICE`. It records the frozen contract
    `aoc.cross-repository-integration@1.0.0`: package identity, the complete contracted export set with
    stability classes, allowed and forbidden install forms, and the obligations a consuming repository
    takes on. A consumer reads it by path in CI (`node_modules/@aoc/protocol/integration-contract.json`)
    to verify offline that what it installed is the surface it agreed to depend on.
    `@aoc/protocol/integration-contract.json` deliberately does **not** resolve as a module specifier.
  - **`npm run protocol:rc:artifact`** produces the installable candidate into the git-ignored
    `dist-rc/`: the reproducible tarball, a ready-to-vendor `protocol-consumer.lock.json` (repository,
    commit, version, SHA-256/SHA-512, npm integrity, contract version, verified export list),
    `SHA256SUMS`, and consumer install/verify instructions. It refuses to emit anything unless two
    consecutive packs are byte-identical and the contract inside the tarball matches the tree.
  - **`npm run check:integration-contract`** enforces the freeze: the contract's declared export set
    must equal the package's export keys in both directions, identity fields must match
    `packages/protocol/package.json`, every contracted code export must be classified in
    `docs/protocol/PUBLIC_API.md`, and the contract must remain shipped **and remain unexported**. It
    runs inside `protocol:rc:check`, `protocol:release:check` and `validate:release`.
  - **`npm run fingerprint:public-surface`** emits a deterministic digest of the export map, the
    resolved export targets and the entire build output, so "the public surface did not move" is a
    comparable value rather than a claim.
  - A fourth consumer fixture (`test-consumers/contract-verification`) installs the real tarball,
    verifies the contract from a real install, resolves all contracted exports, and asserts that
    undeclared subpaths — including the contract file's own specifier — still do not resolve.

  Not published. `packages/protocol/package.json` remains `"private": true`, no registry is configured,
  and no tag or GitHub Release exists.

- af99aed: Add canonical registry interface contracts for RFC-005 trust model portability and explainability.
- 94a1983: Add canonical principal, reference source, and scope reference contracts for the RFC-005 trust model. Deprecate the legacy minimal Claim shape in favor of CanonicalClaim.
- dd38d37: Add canonical proof envelope contracts for the RFC-005 trust model.
- 7049fad: Make `@aoc/protocol` externally consumable and verify it end-to-end as a packaged dependency:

  - Add package metadata required for a real publish decision (`license`, `repository`, `homepage`,
    `bugs`, `engines`), a package-local `LICENSE`, and a canonical root `"."` export (plus
    `"./package.json"`) alongside the existing `contracts`/`errors`/`claims`/`adapters`/`runtime-registry`
    subpaths. No existing export was removed, renamed, or changed shape.
  - Add `packages/protocol/README.md` documenting installation, usage, the public export table, and the
    CommonJS/ESM compatibility that was actually tested (not just declared).
  - Add `test-consumers/{typescript-cjs,javascript-cjs,typescript-esm}` and
    `scripts/validate-protocol-consumer.mjs` (wired to `npm run protocol:consumer:check`), which install
    a real `npm pack` tarball into isolated fixtures and compile/execute them against every public
    subpath, including the runtime-bearing `claims` and `runtime-registry` symbols.
  - Extend `scripts/validate-publishability.mjs` with package-metadata completeness checks and align CI
    (`ci.yml` Node version, `publishability.yml` now also runs `protocol:consumer:check`).
  - Update `docs/versioning-and-stability.md` and add `docs/protocol/PUBLIC_API.md`,
    `docs/release/PACKAGE_DISTRIBUTION_STRATEGY.md`, and
    `docs/integration/CONSUMER_MIGRATION_GUIDE.md`.

  This is packaging-only: no contract semantics changed, nothing was published, and
  `packages/protocol/package.json` remains `"private": true`.

- d92b84b: Add canonical semantic vocabulary contracts for RFC-005 explainability and interoperability.
