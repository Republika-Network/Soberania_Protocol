# Soberanía Protocol — Consent Object Specification

**Version:** 0.1.2
**Status:** Draft
**Layer:** Normative Specification
**Parent Documents:** Field Manifest Specification, Content Object Specification, Pack Object Specification

---

## Table of Contents

1. [Overview](#1-overview)
2. [Design Goals](#2-design-goals)
3. [Consent Object Definition](#3-consent-object-definition)
4. [Consent Scope Model](#4-consent-scope-model)
5. [Revocation Semantics](#5-revocation-semantics)
6. [Canonicalization Rules](#6-canonicalization-rules)
7. [Hashing Boundary](#7-hashing-boundary)
8. [Identifier Construction](#8-identifier-construction)
9. [Structural and Semantic Invariants](#9-structural-and-semantic-invariants)
10. [Security Considerations](#10-security-considerations)
11. [Examples](#11-examples)
12. [Non-Goals](#12-non-goals)
13. [Extensibility Rules](#13-extensibility-rules)
14. [Versioning Strategy](#14-versioning-strategy)
15. [Appendix A: Test Vectors](#appendix-a-test-vectors)
16. [Appendix B: JSON Schema](#appendix-b-json-schema)

---

## 1. Overview

### 1.1 Definition

A **Consent Object** is an immutable, cryptographically verifiable record that represents explicit authorization granted by a subject to a grantee over specified Soberanía protocol objects.

```
ConsentObject := {
  version,        // Protocol version
  subject,        // DID of the consenting party
  grantee,        // DID of the authorized party
  action,         // "grant" or "revoke"
  scope,          // Array of scope entries
  permissions,    // Array of permitted operations
  marketMakerId,  // Optional market-maker binding for derived capabilities
  issued_at,      // Timestamp of consent issuance
  expires_at,     // Expiration timestamp (optional)
  prior_consent,  // Reference to superseded consent (optional)
  consent_hash    // SHA-256 hash of canonical payload
}
```

### 1.2 What a Consent Object Represents

| Concept | Description |
|---------|-------------|
| **Authorization Record** | An explicit, auditable grant or revocation of access rights |
| **Subject Sovereignty** | The subject's deliberate act of permitting or denying access |
| **Portable Consent** | A self-contained authorization transferable across systems |
| **Temporal Boundary** | A time-bounded authorization with defined validity period |
| **Audit Trail Entry** | An immutable record for compliance and verification |

### 1.3 What a Consent Object Does NOT Represent

| Excluded Concept | Rationale |
|------------------|-----------|
| **Access Control Enforcement** | Consent Objects declare authorization; enforcement is implementation-specific |
| **Key Management** | Cryptographic key distribution is outside protocol scope |
| **Authentication State** | Session or authentication tokens are not consent |
| **Data Transformation** | Consent does not modify referenced objects |
| **Notification Mechanism** | Delivery of consent changes to parties is implementation-specific |

### 1.4 Design Principles

| Principle | Description |
|-----------|-------------|
| **Immutability** | Once created, a Consent Object MUST NOT be modified |
| **Self-Describing** | Contains all information needed for verification |
| **Cryptographic Binding** | Hash binds all fields into tamper-evident unit |
| **Subject Authority** | Only the subject MAY author valid consent |
| **Explicit Scope** | Authorization applies only to explicitly listed objects |
| **Temporal Precision** | Time bounds use unambiguous UTC timestamps |

### 1.5 Relationship to Protocol Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                     CONSENT LAYER                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Consent Object                         │   │
│  │  subject ─────► DID of data owner                       │   │
│  │  grantee ─────► DID of authorized party                 │   │
│  │  scope ───────► References to authorized objects        │   │
│  │  permissions ─► Permitted operations                    │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ authorizes access to
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      DATA LAYER                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Pack Object  │  │Content Object│  │Field Manifest│         │
│  │  pack_hash   │  │ content_hash │  │  field_hash  │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Design Goals

### 2.1 Primary Goals

| Goal | Description |
|------|-------------|
| **Explicit Authorization** | Consent MUST be an affirmative act, never implied |
| **Portability** | Consent Objects MUST be interpretable without external context |
| **Verifiability** | Any party MUST be able to verify consent integrity |
| **Auditability** | Complete consent history MUST be reconstructable |
| **Granularity** | Consent MUST support fine-grained object-level scope |

### 2.2 Secondary Goals

| Goal | Description |
|------|-------------|
| **Minimal Surface** | Include only essential fields for authorization |
| **Composability** | Multiple Consent Objects MAY apply to overlapping scopes |
| **Determinism** | Identical inputs MUST produce identical consent hashes |
| **Offline Verification** | Verification MUST NOT require network access |

---

## 3. Consent Object Definition

### 3.1 Field Summary

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | string | REQUIRED | Protocol version identifier |
| `subject` | string | REQUIRED | DID of the consenting party |
| `grantee` | string | REQUIRED | DID of the authorized party |
| `action` | string | REQUIRED | Authorization action type |
| `scope` | array | REQUIRED | Objects covered by this consent |
| `permissions` | array | REQUIRED | Permitted operations |
| `marketMakerId` | string | OPTIONAL | Canonical market-maker binding inherited by derived capabilities |
| `issued_at` | string | REQUIRED | ISO 8601 UTC timestamp |
| `expires_at` | string | OPTIONAL | ISO 8601 UTC timestamp or null |
| `prior_consent` | string | OPTIONAL | Hash of superseded consent or null |
| `consent_hash` | string | REQUIRED | SHA-256 hash of canonical payload |

### 3.2 Field Definitions

#### 3.2.1 version

| Property | Value |
|----------|-------|
| **Name** | `version` |
| **Type** | string |
| **Required** | REQUIRED |
| **Format** | Semantic version (`major.minor`) |
| **Constraints** | Pattern: `^[0-9]+\.[0-9]+$` |
| **Initial Value** | `"1.0"` |

**Description:** The protocol version governing this Consent Object's structure and semantics.

**Semantic Rules:**

1. Implementations MUST reject Consent Objects with unsupported version numbers.
2. Version `"1.0"` indicates conformance to this specification.
3. Minor version increments indicate backward-compatible additions.
4. Major version increments indicate breaking changes.

#### 3.2.2 subject

| Property | Value |
|----------|-------|
| **Name** | `subject` |
| **Type** | string |
| **Required** | REQUIRED |
| **Format** | Decentralized Identifier (DID) |
| **Constraints** | Pattern: `^did:[a-z0-9]+:[a-zA-Z0-9._%-]+$` |
| **Min Length** | 8 |
| **Max Length** | 2048 |

**Description:** The DID of the party granting consent. The subject is the authoritative owner of the data referenced in the scope.

**Semantic Rules:**

1. The subject MUST be the data owner.
2. The subject DID MUST be resolvable at verification time for signature verification.
3. A Consent Object is only valid when cryptographically signed by the subject.
4. The subject and grantee MAY be the same DID (self-consent).

#### 3.2.3 grantee

| Property | Value |
|----------|-------|
| **Name** | `grantee` |
| **Type** | string |
| **Required** | REQUIRED |
| **Format** | Decentralized Identifier (DID) |
| **Constraints** | Pattern: `^did:[a-z0-9]+:[a-zA-Z0-9._%-]+$` |
| **Min Length** | 8 |
| **Max Length** | 2048 |

**Description:** The DID of the party receiving authorization. The grantee is permitted to perform the specified operations on objects in scope.

**Semantic Rules:**

1. The grantee MUST be a valid, well-formed DID.
2. Authorization applies only to the specified grantee.
3. A grantee value of `"did:aoc:public"` indicates public access (no identity restriction).

#### 3.2.4 action

| Property | Value |
|----------|-------|
| **Name** | `action` |
| **Type** | string |
| **Required** | REQUIRED |
| **Format** | Enumerated value |
| **Constraints** | One of: `"grant"`, `"revoke"` |

**Description:** The authorization action this Consent Object represents.

**Semantic Rules:**

1. `"grant"` creates or extends authorization for the grantee.
2. `"revoke"` terminates previously granted authorization.
3. A `"revoke"` action MUST reference the prior consent via `prior_consent`.
4. Actions are idempotent; duplicate grants do not compound permissions.

#### 3.2.5 scope

| Property | Value |
|----------|-------|
| **Name** | `scope` |
| **Type** | array |
| **Required** | REQUIRED |
| **Format** | Array of Scope Entry objects |
| **Constraints** | MUST NOT be empty; minimum 1 entry |
| **Max Entries** | 10000 |

**Description:** The set of Soberanía protocol objects to which this consent applies.

**Semantic Rules:**

1. Each scope entry MUST reference exactly one Soberanía object.
2. Scope entries MUST be unique within a Consent Object.
3. Authorization applies only to objects explicitly listed.
4. An empty scope array is invalid; consent MUST have explicit targets.

See [Section 4: Consent Scope Model](#4-consent-scope-model) for scope entry structure.

#### 3.2.7 marketMakerId

| Property | Value |
|----------|-------|
| **Name** | `marketMakerId` |
| **Type** | string |
| **Required** | OPTIONAL |
| **Format** | lowercase identifier |
| **Constraints** | Pattern: `^[a-z0-9][a-z0-9._-]{0,127}$` |

**Description:** Optional binding to a specific market maker. This field lives on grant consents and, when present, becomes part of the derivation boundary for every child Capability Token.

**Semantic Rules:**

1. `marketMakerId` is the canonical consent/grant field name for market-maker binding.
2. Grant consents MAY omit `marketMakerId`; omitted means unbound and remains backward-compatible.
3. If present on a grant consent, every derived Capability Token MUST preserve the exact same value.
4. Revoke consents MUST NOT include `marketMakerId`.

#### 3.2.6 permissions

| Property | Value |
|----------|-------|
| **Name** | `permissions` |
| **Type** | array |
| **Required** | REQUIRED |
| **Format** | Array of permission strings |
| **Constraints** | MUST NOT be empty; minimum 1 entry |
| **Max Entries** | 100 |

**Description:** The operations the grantee is permitted to perform on objects in scope.

**Semantic Rules:**

1. Permissions MUST be drawn from the canonical protocol action vocabulary defined below.
2. Unknown permissions MUST cause structural validation to fail closed.
3. Permissions are additive; multiple grants combine permissions.
4. Permission strings MUST be lowercase alphanumeric with hyphens.
5. Permissions MUST NOT contain duplicates within a single Consent Object.
6. This specification defines exact string actions only; there is no wildcard, alias, or pattern matching semantics.

**Canonical Protocol Actions / Permissions:**

| Permission | Description |
|------------|-------------|
| `read` | Retrieve and view object content |
| `store` | Persist object to storage |
| `share` | Include object in further consent grants |
| `derive` | Create derivative objects referencing original |
| `aggregate` | Include object in aggregate computations |

These strings are the canonical action vocabulary used by consent builders, capability minting, structural validation, derivation checks, and runtime enforcement.

#### 3.2.8 issued_at

| Property | Value |
|----------|-------|
| **Name** | `issued_at` |
| **Type** | string |
| **Required** | REQUIRED |
| **Format** | ISO 8601 UTC timestamp |
| **Constraints** | Pattern: `^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$` |

**Description:** The UTC timestamp when this Consent Object was created.

**Semantic Rules:**

1. Timestamps MUST be in UTC (indicated by trailing `Z`).
2. Timestamps MUST NOT include fractional seconds.
3. The `issued_at` value MUST NOT be more than 300 seconds in the future relative to verification time.
4. Implementations SHOULD allow clock skew tolerance of ±300 seconds for past timestamps.

**Example:** `"2025-01-15T14:30:00Z"`

#### 3.2.9 expires_at

| Property | Value |
|----------|-------|
| **Name** | `expires_at` |
| **Type** | string or null |
| **Required** | OPTIONAL |
| **Format** | ISO 8601 UTC timestamp or null |
| **Constraints** | Pattern: `^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$` |
| **Default** | `null` |

**Description:** The UTC timestamp when this consent expires. A value of `null` indicates no expiration.

**Semantic Rules:**

1. If present and non-null, `expires_at` MUST be after `issued_at`.
2. Expired consent MUST NOT authorize operations.
3. A `null` value indicates indefinite validity until explicitly revoked.
4. Expiration is evaluated at operation time, not verification time.

**Example:** `"2026-01-15T14:30:00Z"`

#### 3.2.10 prior_consent

| Property | Value |
|----------|-------|
| **Name** | `prior_consent` |
| **Type** | string or null |
| **Required** | OPTIONAL |
| **Format** | SHA-256 hash (lowercase hexadecimal) |
| **Constraints** | Pattern: `^[a-f0-9]{64}$` |
| **Default** | `null` |

**Description:** The consent_hash of a previous Consent Object that this consent modifies or supersedes.

**Semantic Rules:**

1. For `"revoke"` actions, `prior_consent` MUST be non-null and reference the consent being revoked.
2. For `"grant"` actions, `prior_consent` MAY reference a consent being renewed or modified.
3. A `null` value indicates this is an original grant with no predecessor; `null` is invalid for revocations.
4. The referenced consent MUST have the same subject and grantee.

#### 3.2.11 consent_hash

| Property | Value |
|----------|-------|
| **Name** | `consent_hash` |
| **Type** | string |
| **Required** | REQUIRED |
| **Format** | SHA-256 hash (lowercase hexadecimal) |
| **Constraints** | Pattern: `^[a-f0-9]{64}$`; exactly 64 characters |

**Description:** The SHA-256 hash of the canonical payload, serving as the unique identifier for this Consent Object.

**Semantic Rules:**

1. The `consent_hash` MUST equal the SHA-256 hash of the canonical payload.
2. Hash verification failure indicates tampering or corruption.
3. The `consent_hash` field itself is excluded from the canonical payload.
4. Identical canonical payloads MUST produce identical consent hashes.

---

## 4. Consent Scope Model

### 4.1 Scope Entry Structure

A scope entry identifies a single Soberanía protocol object to which consent applies.

```
ScopeEntry := {
  type,   // Object type: "field", "content", or "pack"
  ref     // Object hash identifier
}
```

### 4.2 Scope Entry Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | Soberanía object type identifier |
| `ref` | string | REQUIRED | Hash reference to the object |

#### 4.2.1 type

| Property | Value |
|----------|-------|
| **Name** | `type` |
| **Type** | string |
| **Required** | REQUIRED |
| **Format** | Enumerated value |
| **Constraints** | One of: `"field"`, `"content"`, `"pack"` |

**Description:** The type of Soberanía protocol object being referenced.

**Type Mapping:**

| Type | Referenced Object | Hash Field |
|------|-------------------|------------|
| `"field"` | Field Manifest | `field_hash` |
| `"content"` | Content Object | `content_hash` |
| `"pack"` | Pack Object | `pack_hash` |

#### 4.2.2 ref

| Property | Value |
|----------|-------|
| **Name** | `ref` |
| **Type** | string |
| **Required** | REQUIRED |
| **Format** | SHA-256 hash (lowercase hexadecimal) |
| **Constraints** | Pattern: `^[a-f0-9]{64}$`; exactly 64 characters |

**Description:** The hash identifier of the referenced Soberanía object.

**Semantic Rules:**

1. The `ref` value MUST be a valid hash for the specified object type.
2. The referenced object SHOULD exist and be resolvable.
3. Consent applies to the exact object identified by the hash.
4. Hash collision (two objects with same hash) is cryptographically infeasible.

### 4.3 Scope Entry Ordering

1. Scope entries MUST be sorted for canonical representation.
2. Primary sort: by `type` in ascending lexicographic order.
3. Secondary sort: by `ref` in ascending lexicographic order.
4. Sorting MUST be applied before hash computation.

### 4.4 Scope Hierarchy

Consent to a Pack Object does NOT automatically grant consent to its constituent Content Objects or Field Manifests. Hierarchical consent MUST be explicit.

| Scope Configuration | Effect |
|---------------------|--------|
| Pack only | Access to pack metadata; content access requires separate consent |
| Content only | Access to content object; pack inclusion does not grant access |
| Field only | Access to field manifest; content using field requires separate consent |
| Pack + Content | Access to both pack structure and specified content |

---

## 5. Revocation Semantics

### 5.1 Revocation Model

Consent revocation is achieved by creating a new Consent Object with `action: "revoke"`. Revocation does not modify the original grant; it creates an auditable termination record.

### 5.2 Revocation Rules

1. A revocation Consent Object MUST have `action` set to `"revoke"`.
2. Revocation MUST reference the original consent via `prior_consent`.
3. The revoking subject MUST match the original consent subject.
4. The revocation grantee MUST match the original consent grantee.
5. Revocation scope SHOULD match or be a subset of the original scope.
6. Consent Objects with identical `issued_at` MUST NOT exist for the same (subject, grantee, scope entry) tuple.

### 5.3 Revocation Precedence

When evaluating authorization:

1. Find all Consent Objects matching (subject, grantee, scope entry).
2. Filter to non-expired consents based on `expires_at`.
3. Order by `issued_at` descending (most recent first).
4. The most recent applicable consent determines authorization status.
5. A `"revoke"` action terminates authorization; a `"grant"` action enables it.

### 5.4 Partial Revocation

1. Revocation MAY target a subset of a previous grant's scope.
2. Partial revocation creates a revocation consent with reduced scope.
3. Permissions not covered by revocation remain in effect.
4. Full revocation requires matching the entire original scope.

### 5.5 Revocation Timestamp

1. Revocation takes effect at the `issued_at` time of the revocation consent.
2. Operations authorized before revocation remain historically valid.
3. Backdating `issued_at` to retroactively revoke consent is NOT valid.

### 5.6 Reference Implementation Notes

1. A revoke consent revokes the consent identified by `prior_consent`, and with it every
   capability token that references that consent (`consent_ref`), however and wherever the token
   was produced. `revoke_target.capability_hash` names one such token for audit; it does not narrow
   the revocation, because tokens are bearer objects that any holder of the consent can mint again.
2. The implementation (`vault/vault.ts`, `capability/revocation.ts`) accepts a revocation only when
   it carries the subject's proof (§10.2), `prior_consent` names a stored grant consent with the
   same subject and grantee, `issued_at` is not earlier than that consent's, and a named token the
   implementation knows belongs to that consent. The revocation is recorded in the revocation
   registry before the call returns.
3. Authorization reads revocation from the registry only: once a consent is revoked, every
   evaluation denies regardless of the evaluation time a caller supplies. Rule 5.5(2) is an audit
   statement, not a way to re-admit requests by presenting an earlier time.
4. Partial revocation (§5.4) is not implemented: revoke consents carry an empty scope and withdraw
   the whole consent. Revoking a single token hash is an operator containment action, separate from
   subject revocation, and never revokes the consent.

---

## 6. Canonicalization Rules

### 6.1 Overview

Consent Objects MUST be canonicalized before hashing to ensure deterministic hash computation across implementations. Canonicalization follows RFC 8785 (JSON Canonicalization Scheme).

### 6.2 Canonical JSON Rules

#### 6.2.1 Object Key Ordering

1. Object keys MUST be sorted in ascending Unicode code point order.
2. Sorting applies recursively to nested objects.
3. The canonical key order for Consent Objects is:

```
action
expires_at
grantee
issued_at
permissions
prior_consent
scope
subject
version
```

4. Within scope entries, key order is: `ref`, `type`.

#### 6.2.2 Whitespace

1. No whitespace between tokens.
2. No trailing newlines.
3. No leading whitespace.

#### 6.2.3 String Encoding

1. UTF-8 encoding MUST be used.
2. Strings MUST be NFC normalized (Unicode Canonical Composition).
3. Control characters (U+0000 to U+001F) MUST use `\uXXXX` escapes.
4. Non-ASCII characters MUST be literal UTF-8 bytes (NOT escaped).
5. Solidus (`/`) MUST NOT be escaped.
6. Required escapes: `\"`, `\\`, `\b`, `\f`, `\n`, `\r`, `\t`.

#### 6.2.4 Array Ordering

1. The `scope` array MUST be sorted by (`type`, `ref`) before encoding.
2. The `permissions` array MUST be sorted in ascending lexicographic order.
3. Array element order affects the canonical form and hash.

#### 6.2.5 Null Values

1. Fields with `null` values MUST be included in the canonical payload.
2. Null is encoded as the literal `null` (no quotes).
3. Omitting optional null fields would change the hash.

### 6.3 Encoding Verification

To verify canonical encoding:

1. Parse the JSON payload.
2. Re-encode using canonical rules.
3. Compare byte-for-byte with original.
4. Mismatch indicates non-canonical encoding.

---

## 7. Hashing Boundary

### 7.1 Definition

The **hashing boundary** defines which fields participate in the canonical payload used for hash computation.

### 7.2 Included Fields

| Field | Included in Hash | Rationale |
|-------|------------------|-----------|
| `version` | YES | Protocol version affects semantics |
| `subject` | YES | Identity of consenting party |
| `grantee` | YES | Identity of authorized party |
| `action` | YES | Grant vs revoke is fundamental |
| `scope` | YES | What is being authorized |
| `permissions` | YES | What operations are permitted |
| `issued_at` | YES | Temporal binding |
| `expires_at` | YES | Expiration affects validity |
| `prior_consent` | YES | Chain of custody reference |
| `pricing` | YES, if present | Deterministic paid-use gate for grant consumption |
| `consent_hash` | NO | Cannot include self-reference |

### 7.3 Canonical Payload Structure

```
canonical_payload := {
  "action": action,
  "expires_at": expires_at,
  "grantee": grantee,
  "issued_at": issued_at,
  "permissions": sorted(permissions),
  "pricing": pricing,   // include only when present
  "prior_consent": prior_consent,
  "scope": sorted(scope),
  "subject": subject,
  "version": version
}
```

Note: Keys are in alphabetical order per canonicalization rules.

### 7.4 Hash Computation

```
function compute_consent_hash(consent):
  // Step 1: Construct canonical payload (exclude consent_hash)
  payload := {
    "action": consent.action,
    "expires_at": consent.expires_at,
    "grantee": consent.grantee,
    "issued_at": consent.issued_at,
    "permissions": sort_ascending(consent.permissions),
    "pricing": consent.pricing,  // include only when present
    "prior_consent": consent.prior_consent,
    "scope": sort_scope_entries(consent.scope),
    "subject": consent.subject,
    "version": consent.version
  }

  // Step 2: Apply deterministic encoding (RFC 8785)
  canonical_bytes := canonical_json_encode(payload)

  // Step 3: Compute SHA-256
  hash_bytes := SHA256(canonical_bytes)

  // Step 4: Encode as lowercase hexadecimal
  hash_string := lowercase_hex_encode(hash_bytes)

  RETURN hash_string  // 64 character string
```

### 7.4.1 Optional Grant Pricing

Grant consents MAY include an optional `pricing` object to express a deterministic protocol-level payment requirement for consuming capability access derived from that grant.

```json
{
  "pricing": {
    "model": "per_use",
    "amount": 25,
    "currency": "USD"
  }
}
```

Rules:

1. `pricing` MUST be omitted for `"revoke"` actions.
2. `model` currently only supports `"per_use"`.
3. `amount` MUST be a positive number.
4. `currency` MUST be a non-empty string.
5. If present, `pricing` MUST participate in canonical encoding and hash computation.
6. `pricing` defines a payment gate only; it is NOT billing, settlement, subscription logic, or payment processing.

### 7.5 Payload Boundary Invariants

```
INV-HASH-01: consent_hash = lowercase_hex(SHA-256(canonical_payload))
  "Consent hash MUST equal SHA-256 of canonical payload"

INV-HASH-02: consent_hash ∉ canonical_payload
  "Consent hash MUST NOT be included in its own computation"

INV-HASH-03: length(consent_hash) = 64
  "Consent hash MUST be exactly 64 hexadecimal characters"
```

---

## 8. Identifier Construction

### 8.1 Consent Identifier

The `consent_hash` serves as the canonical identifier for a Consent Object.

### 8.2 URI Form

Consent Objects MAY be referenced using the AOC URI scheme:

```
aoc://consent/v{major}/{minor}/0x{consent_hash}
```

**Components:**

| Component | Description | Example |
|-----------|-------------|---------|
| Scheme | Protocol identifier | `aoc` |
| Type | Object type | `consent` |
| Version | Major.minor version | `v1/0` |
| Hash | Prefixed consent hash | `0x{64 hex chars}` |

**Example:**

```
aoc://consent/v1/0/0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b
```

### 8.3 Identifier Properties

1. Identifiers MUST be case-insensitive for the hexadecimal portion.
2. Implementations MUST normalize to lowercase for comparison.
3. The `0x` prefix distinguishes hashes from other identifiers.
4. URI form includes version for forward compatibility.

---

## 9. Structural and Semantic Invariants

### 9.1 Structural Invariants

```
INV-STRUCT-01: typeof(consent.version) = string ∧ consent.version matches ^[0-9]+\.[0-9]+$
  "Version MUST be a semantic version string"

INV-STRUCT-02: typeof(consent.subject) = string ∧ consent.subject matches ^did:[a-z0-9]+:
  "Subject MUST be a valid DID"

INV-STRUCT-03: typeof(consent.grantee) = string ∧ consent.grantee matches ^did:[a-z0-9]+:
  "Grantee MUST be a valid DID"

INV-STRUCT-04: consent.action ∈ {"grant", "revoke"}
  "Action MUST be either grant or revoke"

INV-STRUCT-05: typeof(consent.scope) = array ∧ length(consent.scope) ≥ 1
  "Scope MUST be a non-empty array"

INV-STRUCT-06: typeof(consent.permissions) = array ∧ length(consent.permissions) ≥ 1
  "Permissions MUST be a non-empty array"

INV-STRUCT-07: consent.issued_at matches ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$
  "Issued timestamp MUST be ISO 8601 UTC format"
```

### 9.2 Semantic Invariants

```
INV-SEM-01: consent.expires_at = null ∨ consent.expires_at > consent.issued_at
  "Expiration MUST be after issuance if specified"

INV-SEM-02: ∀ entry ∈ consent.scope: entry.type ∈ {"field", "content", "pack"}
  "All scope entries MUST reference valid AOC object types"

INV-SEM-03: ∀ entry ∈ consent.scope: entry.ref matches ^[a-f0-9]{64}$
  "All scope references MUST be valid SHA-256 hashes"

INV-SEM-04: consent.action = "revoke" → consent.permissions = original_consent.permissions
  "Revocation SHOULD include the same permissions as the original grant"

INV-SEM-05: unique(consent.scope, (entry) => (entry.type, entry.ref))
  "Scope entries MUST be unique by (type, ref) pair"

INV-SEM-06: unique(consent.permissions)
  "Permissions MUST NOT contain duplicates"

INV-SEM-07: consent.action = "revoke" → consent.prior_consent ≠ null
  "Revocation MUST reference prior consent"
```

### 9.3 Consistency Invariants

```
INV-CON-01: consent.prior_consent ≠ null →
            referenced_consent.subject = consent.subject
  "Prior consent MUST have same subject"

INV-CON-02: consent.prior_consent ≠ null →
            referenced_consent.grantee = consent.grantee
  "Prior consent MUST have same grantee"

INV-CON-03: consent.prior_consent ≠ consent.consent_hash
  "Consent MUST NOT reference itself"
```

### 9.4 Determinism Invariants

```
INV-DET-01: ∀ Consent Objects C1, C2:
  (C1.version = C2.version ∧ C1.subject = C2.subject ∧
   C1.grantee = C2.grantee ∧ C1.action = C2.action ∧
   set(C1.scope) = set(C2.scope) ∧
   set(C1.permissions) = set(C2.permissions) ∧
   C1.issued_at = C2.issued_at ∧ C1.expires_at = C2.expires_at ∧
   C1.prior_consent = C2.prior_consent)
  → C1.consent_hash = C2.consent_hash

"Consents with identical fields MUST have identical hashes"

INV-DET-02: ∀ Consent Objects C1, C2:
  (C1.consent_hash ≠ C2.consent_hash ∧
   C1.subject = C2.subject ∧ C1.grantee = C2.grantee ∧
   ∃ entry: entry ∈ C1.scope ∧ entry ∈ C2.scope)
  → C1.issued_at ≠ C2.issued_at

"Distinct Consent Objects for same (subject, grantee, scope entry) MUST have distinct issued_at"
```

### 9.5 Immutability Invariants

```
INV-IMM-01: ∀ Consent Object C, time t1 < t2:
  C(t1) = C(t2)
  "Consent Objects MUST NOT change after creation"

INV-IMM-02: modification(consent) → new_consent_hash
  "Any change requires creating a new Consent Object"
```

---

## 10. Security Considerations

### 10.1 Threat Model

| Threat | Mitigation |
|--------|------------|
| **Consent Forgery** | Cryptographic signature by subject required |
| **Consent Tampering** | Hash integrity verification detects modification |
| **Replay Attacks** | Timestamp and prior_consent chain prevents replay |
| **Scope Expansion** | Explicit scope enumeration prevents implicit grants |
| **Unauthorized Revocation** | Subject identity verification required |

### 10.2 Signature Requirements

1. Consent Objects MUST be signed by the subject's private key.
2. Signature verification MUST succeed before authorization is granted.
3. Signature algorithm and format are outside this specification's scope.
4. Implementations MUST support signature verification without network access.

Reference implementation (`consent/proof.ts`, `consent/signing.ts`): the subject is an
Ed25519 `did:key`, and the verification key is resolved from the subject DID itself. The
signature is a detached `subject_proof` (`type: "AocSubjectConsentProof"`, `version: 1`,
`alg: "Ed25519"`, `statement: "consent-object/v1"`, `verification_method`, `content_hash`,
`signature`), excluded from the canonical payload so that `consent_hash` is unchanged. The
signed bytes are the canonical JSON of the proof header together with the full canonical consent
content and its SHA-256 hash. A consent without a valid proof is legacy data and MUST NOT
authorize access, minting, consumption or revocation. A revoke consent MUST be signed by the
subject of the revoked capability and name that capability's consent in `prior_consent`.

### 10.3 Hash Security

```
INV-SEC-01: collision_probability(SHA-256) < 2^-128
  "SHA-256 collision resistance provides sufficient security"

INV-SEC-02: consent_hash uniquely identifies consent
  "Hash serves as tamper-evident unique identifier"
```

### 10.4 Temporal Security

1. Clock synchronization affects consent validity evaluation.
2. Implementations MUST define acceptable clock skew tolerance.
3. Expired consents MUST NOT authorize new operations.
4. Historical operations remain valid per consent active at operation time.

### 10.5 Privacy Considerations

1. Consent Objects reveal authorization relationships.
2. Storage and transmission SHOULD use encrypted channels.
3. Consent hashes are pseudonymous but linkable.
4. Aggregation of consents may reveal sensitive patterns.

### 10.6 Invariant Enforcement

Implementations MUST enforce all structural and semantic invariants:

1. Reject Consent Objects failing structural validation.
2. Reject Consent Objects failing semantic validation.
3. Reject Consent Objects with invalid consent_hash.
4. Reject Consent Objects with invalid signatures.

---

## 11. Examples

### 11.1 Canonical Payload Example

```json
{"action":"grant","expires_at":"2026-01-15T14:30:00Z","grantee":"did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH","issued_at":"2025-01-15T14:30:00Z","permissions":["read"],"prior_consent":null,"scope":[{"ref":"a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2","type":"content"}],"subject":"did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK","version":"1.0"}
```

### 11.2 Basic Grant Example

```json
{
  "version": "1.0",
  "subject": "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
  "grantee": "did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH",
  "action": "grant",
  "scope": [
    {
      "type": "content",
      "ref": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2"
    }
  ],
  "permissions": ["read"],
  "issued_at": "2025-01-15T14:30:00Z",
  "expires_at": "2026-01-15T14:30:00Z",
  "prior_consent": null,
  "consent_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
}
```

### 11.3 Multi-Object Grant Example

```json
{
  "version": "1.0",
  "subject": "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
  "grantee": "did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH",
  "action": "grant",
  "scope": [
    {
      "type": "content",
      "ref": "1111111111111111111111111111111111111111111111111111111111111111"
    },
    {
      "type": "content",
      "ref": "2222222222222222222222222222222222222222222222222222222222222222"
    },
    {
      "type": "pack",
      "ref": "3333333333333333333333333333333333333333333333333333333333333333"
    }
  ],
  "permissions": ["read", "store"],
  "issued_at": "2025-01-15T14:30:00Z",
  "expires_at": null,
  "prior_consent": null,
  "consent_hash": "f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5"
}
```

### 11.4 Revocation Example

```json
{
  "version": "1.0",
  "subject": "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
  "grantee": "did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH",
  "action": "revoke",
  "scope": [
    {
      "type": "content",
      "ref": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2"
    }
  ],
  "permissions": ["read"],
  "issued_at": "2025-06-15T10:00:00Z",
  "expires_at": null,
  "prior_consent": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "consent_hash": "b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6"
}
```

### 11.5 Public Access Grant Example

```json
{
  "version": "1.0",
  "subject": "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
  "grantee": "did:aoc:public",
  "action": "grant",
  "scope": [
    {
      "type": "pack",
      "ref": "7777777777777777777777777777777777777777777777777777777777777777"
    }
  ],
  "permissions": ["read"],
  "issued_at": "2025-01-15T14:30:00Z",
  "expires_at": null,
  "prior_consent": null,
  "consent_hash": "c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8"
}
```

---

## 12. Non-Goals

The following are explicitly outside the scope of this specification:

| Non-Goal | Rationale |
|----------|-----------|
| **Access Control Enforcement** | Enforcement mechanisms are implementation-specific |
| **Key Management** | Cryptographic key lifecycle is a separate concern |
| **Transport Protocol** | How consents are transmitted is not specified |
| **Storage Requirements** | Where consents are persisted is implementation choice |
| **Discovery Mechanism** | How parties find relevant consents is not specified |
| **Delegation Chains** | Multi-hop delegation is deferred to future versions |
| **Conditional Consent** | Complex conditions beyond time bounds are not supported |
| **Consent Negotiation** | Request/response flows are application-level concerns |
| **Notification Systems** | Alerting parties to consent changes is not specified |
| **User Interface** | Consent presentation is application-specific |

---

## 13. Extensibility Rules

### 13.1 Extension Principles

1. Forward compatibility MUST be maintained within major versions.
2. Unknown fields MUST be preserved but ignored.
3. Unknown permissions MUST be ignored (not rejected).
4. Unknown scope types MUST cause validation failure.

### 13.2 Adding New Fields

**Minor Version (Backward Compatible):**

1. New OPTIONAL fields MAY be added outside the canonical payload.
2. Existing implementations MUST ignore unknown fields.
3. New fields MUST NOT change the semantics of existing fields.

**Major Version (Breaking Change):**

1. New REQUIRED fields require a major version increment.
2. Changes to canonical payload fields require a major version increment.
3. Removal of fields requires a major version increment.

### 13.3 Reserved Field Names

The following field name prefixes are reserved:

| Prefix | Purpose |
|--------|---------|
| `_` | Implementation-private metadata |
| `x-` | Vendor extensions |
| `aoc-` | Future Soberanía protocol use |

### 13.4 Vendor Extensions

1. Vendor extensions MUST use the `x-` prefix.
2. Extensions MUST NOT affect canonical payload computation.
3. Extensions MUST NOT alter core consent semantics.
4. Implementations MUST ignore unrecognized extensions.

---

## 14. Versioning Strategy

### 14.1 Version Format

Consent Objects use semantic versioning with two components:

```
version := major "." minor
major   := non-negative integer
minor   := non-negative integer
```

### 14.2 Version Semantics

| Version Change | Compatibility | Examples |
|----------------|---------------|----------|
| Minor increment | Backward compatible | New optional fields, new permissions |
| Major increment | Breaking change | Canonical payload changes, field removal |

### 14.3 Version Negotiation

1. Implementations MUST declare supported version range.
2. Consent Objects with unsupported versions MUST be rejected.
3. Higher minor versions within supported major SHOULD be accepted.
4. Unknown major versions MUST be rejected.

### 14.4 Deprecation Process

1. Deprecated features MUST be documented with target removal version.
2. Deprecated features MUST remain functional for at least one major version.
3. Removal of deprecated features requires major version increment.

---

## Appendix A: Test Vectors

### A.1 Canonical Encoding Test

**Input (formatted):**

```json
{
  "version": "1.0",
  "subject": "did:key:z6MkTest1",
  "grantee": "did:key:z6MkTest2",
  "action": "grant",
  "scope": [
    {"type": "content", "ref": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},
    {"type": "content", "ref": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}
  ],
  "permissions": ["store", "read"],
  "issued_at": "2025-01-01T00:00:00Z",
  "expires_at": null,
  "prior_consent": null
}
```

**Canonical payload (sorted, compact):**

Note: `scope` sorted by (type, ref); `permissions` sorted alphabetically.

```json
{"action":"grant","expires_at":null,"grantee":"did:key:z6MkTest2","issued_at":"2025-01-01T00:00:00Z","permissions":["read","store"],"prior_consent":null,"scope":[{"ref":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","type":"content"},{"ref":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","type":"content"}],"subject":"did:key:z6MkTest1","version":"1.0"}
```

### A.2 Scope Sorting Test

**Input scope (unsorted):**

```json
[
  {"type": "pack", "ref": "1111111111111111111111111111111111111111111111111111111111111111"},
  {"type": "content", "ref": "3333333333333333333333333333333333333333333333333333333333333333"},
  {"type": "content", "ref": "2222222222222222222222222222222222222222222222222222222222222222"},
  {"type": "field", "ref": "4444444444444444444444444444444444444444444444444444444444444444"}
]
```

**Canonical scope (sorted):**

```json
[
  {"ref": "2222222222222222222222222222222222222222222222222222222222222222", "type": "content"},
  {"ref": "3333333333333333333333333333333333333333333333333333333333333333", "type": "content"},
  {"ref": "4444444444444444444444444444444444444444444444444444444444444444", "type": "field"},
  {"ref": "1111111111111111111111111111111111111111111111111111111111111111", "type": "pack"}
]
```

### A.3 Permission Sorting Test

**Input permissions:** `["store", "read", "derive", "aggregate"]`

**Canonical permissions:** `["aggregate", "derive", "read", "store"]`

---

## Appendix B: JSON Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://aoc.protocol/schemas/consent-object/v1.0",
  "title": "AOC Consent Object",
  "description": "Schema for AOC Protocol Consent Object v1.0",
  "type": "object",
  "required": [
    "version",
    "subject",
    "grantee",
    "action",
    "scope",
    "permissions",
    "issued_at",
    "consent_hash"
  ],
  "properties": {
    "version": {
      "type": "string",
      "pattern": "^[0-9]+\\.[0-9]+$",
      "description": "Protocol version identifier"
    },
    "subject": {
      "type": "string",
      "pattern": "^did:[a-z0-9]+:[a-zA-Z0-9._%-]+$",
      "minLength": 8,
      "maxLength": 2048,
      "description": "DID of the consenting party"
    },
    "grantee": {
      "type": "string",
      "pattern": "^did:[a-z0-9]+:[a-zA-Z0-9._%-]+$",
      "minLength": 8,
      "maxLength": 2048,
      "description": "DID of the authorized party"
    },
    "action": {
      "type": "string",
      "enum": ["grant", "revoke"],
      "description": "Authorization action type"
    },
    "scope": {
      "type": "array",
      "minItems": 1,
      "maxItems": 10000,
      "items": {
        "$ref": "#/$defs/ScopeEntry"
      },
      "description": "Objects covered by this consent"
    },
    "permissions": {
      "type": "array",
      "minItems": 1,
      "maxItems": 100,
      "uniqueItems": true,
      "items": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9-]*$"
      },
      "description": "Permitted operations"
    },
    "issued_at": {
      "type": "string",
      "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$",
      "description": "ISO 8601 UTC timestamp of consent issuance"
    },
    "expires_at": {
      "oneOf": [
        {
          "type": "string",
          "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$"
        },
        {
          "type": "null"
        }
      ],
      "description": "ISO 8601 UTC timestamp of consent expiration"
    },
    "prior_consent": {
      "oneOf": [
        {
          "type": "string",
          "pattern": "^[a-f0-9]{64}$"
        },
        {
          "type": "null"
        }
      ],
      "description": "Hash of superseded consent"
    },
    "consent_hash": {
      "type": "string",
      "pattern": "^[a-f0-9]{64}$",
      "description": "SHA-256 hash of canonical payload"
    }
  },
  "additionalProperties": true,
  "$defs": {
    "ScopeEntry": {
      "type": "object",
      "required": ["type", "ref"],
      "properties": {
        "type": {
          "type": "string",
          "enum": ["field", "content", "pack"],
          "description": "AOC object type"
        },
        "ref": {
          "type": "string",
          "pattern": "^[a-f0-9]{64}$",
          "description": "Hash reference to the object"
        }
      },
      "additionalProperties": false
    }
  }
}
```

---

**End of Specification**

### Market Maker Registry Semantics

- `marketMakerId` MAY be validated against a registry.
- Implementations SHOULD fail closed if registry enforcement is enabled at runtime.
- Registry validation is orthogonal to structural validation and does not change the consent or capability schema.
