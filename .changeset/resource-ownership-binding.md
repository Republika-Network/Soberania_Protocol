---
"@aoc-runtime/consent-runtime": minor
"@aoc-runtime/provider-interfaces": minor
"@aoc-runtime/capability-runtime": minor
"@aoc-runtime/pmfreak-adapter": minor
---

A valid signature or capability grants authority over a resource only when its subject is independently established as that resource's owner.

Breaking changes:

- `ConsentRuntime` requires `resourceOwnership: ResourceOwnershipProvider` (new in `@aoc-runtime/provider-interfaces`: `ownerOf(capability) → actor id | undefined`, from the deployment's own records). A grant is honoured only when its subject is that owner; a correctly signed grant by anyone else, or unknown ownership, denies. Subject, signer, owner and delegate are checked separately. `@aoc-runtime/pmfreak-adapter` takes `resourceOwnership` in its provider bundle. No default provider ships.
- `CapabilityRuntime` matches namespaces on canonical paths only (`canonicalNamespacePath` exported): an absolute path with no empty, `.` or `..` segments and no trailing slash except the root. Any other requested or scope path matches nothing, so traversal never reaches a sibling or parent namespace.

Root runtime modules (not versioned packages):

- Pack manifests carry the subject's detached proof (`signPackManifest`, `verifyPackManifestProof`; statement `pack-manifest/v1`). The vault refuses unsigned packs and, within its own authenticated records, a pack listing content already registered by another subject. An optional `ContentOwnershipAuthority` can be injected to decide content ownership from outside the vault; none ships. `getStore()` returns a frozen snapshot.
- `protocol/capability` no longer exports `evaluateCapabilityAccess`; the same scope arithmetic is `projectCapabilityScopeMatch`, an explicitly non-authoritative projection used by the enforcement engine after consent and revocation checks.
