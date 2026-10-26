---
"@aoc-runtime/vault-runtime": patch
---

Root runtime modules (not versioned packages): content ownership comes from a trusted, deployment-scoped authority, never from pack submission.

- `vault/contentOwnership.ts` defines the contract: `ContentOwnershipAuthority` (read side, one trust domain, `lookup(content_id)` → `owned | unknown | unavailable`), `ContentOwnershipProvisioning` (write side, applies custodian-signed `ContentOwnershipAssertion`s: `provision` creates a binding, `transfer` replaces a named current owner; nothing is reassigned implicitly), and `ContentOwnershipStore` (the persistent backing store a deployment provides, with atomic compare-and-set and a `get` that throws when it cannot answer). `CustodialContentOwnershipAuthority` implements both sides over a store; `InMemoryContentOwnershipStore` is for tests and single-process development only.
- A vault is created with `trustDomain` and `contentOwnership` (both or neither; the authority must answer for that domain). Without them it refuses every pack and denies every access with `OWNERSHIP_UNAVAILABLE`. `storePack` keeps the subject proof on pack manifests and additionally requires every listed content id to be attributed to the pack's subject in the vault's domain; unknown, other-owner and unavailable all refuse, so submitting first establishes nothing. `requestAccess` re-checks ownership per field before any token is consumed (`CONTENT_NOT_OWNED`), so a transferred content id stops releasing from existing packs.
- The vault-local "first authenticated registration wins" rule is removed.
- `createHRKeyAdapter` takes `{ vault?, trustDomain?, contentOwnership? }` (a bare `Vault` is still accepted); without an authority its vault refuses packs.
- New vault error codes: `CONTENT_NOT_OWNED`, `OWNERSHIP_UNAVAILABLE`.
