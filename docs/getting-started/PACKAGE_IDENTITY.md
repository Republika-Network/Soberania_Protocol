# Package identity, installation and migration

> **Preview: prepared for upcoming publication.** Nothing on this page is installable from a public
> registry today. `npm install @soberania-protocol/protocol` and `npm install @soberania-protocol/sdk`
> currently return 404. They will work only after a founder-approved release is published. Until then,
> use [§2 Install today](#2-install-today-from-a-tarball).

## 1. Names

| Today (workspace) | Approved public name | Status |
|---|---|---|
| `@aoc/protocol` | `@soberania-protocol/protocol` | Prepared, not published |
| `@aoc/sdk` | `@soberania-protocol/sdk` | Prepared, not published. The SDK is **optional**: the protocol never requires it. |

- **Subpaths do not change.** Only the package name in import specifiers changes. The subpaths are
  `/contracts`, `/errors`, `/claims`, `/adapters`, `/runtime-registry`, `/canonical`, `/identity`,
  `/manifest`, `/portability`, `/interoperability`, `/licensing`, `/governance-compatibility`,
  `/sovereignty-capabilities` and `/package.json`.
- **The rename is a new distribution identity.** Existing `@aoc/protocol` release candidates keep their
  names, tarballs and recorded checksums. They are never republished under the new name, and the
  evidence in `docs/release/evidence/` is not rewritten.
- **Protocol identifiers keep `aoc`.** Identifiers such as `aoc-canonical-json/1`, URI schemes and API
  symbols named `AOC_*` are part of the contract. They do not change with the package name.

## 2. Install today: from a tarball

The protocol is consumed as a checksummed tarball built from this repository. See
[QUICK_START §3](QUICK_START.md#3-install-today-from-a-tarball):

```bash
git clone https://github.com/Republika-Network/Soberania_Protocol.git
cd Soberania_Protocol
npm ci
npm run protocol:pack            # → aoc-protocol-<version>.tgz
# in your project:
npm install --save-exact ./aoc-protocol-<version>.tgz
```

Compare the tarball's SHA-256 with the value recorded for that version under `docs/release/evidence/`.

## 3. Install after publication (not yet available)

```bash
# NOT AVAILABLE YET: these packages do not exist on npm today.
npm install --save-exact @soberania-protocol/protocol@<version>
# optional, only if you use the SDK; install it together with the exact protocol version it peers on:
npm install --save-exact @soberania-protocol/protocol@<version> @soberania-protocol/sdk@<version>
```

The SDK declares the protocol as an **exact-version peer**. Check that only one copy of the protocol is
installed: `npm ls @soberania-protocol/protocol` must show a single version.

## 4. Migrating imports

```ts
// before
import { canonicalize } from '@aoc/protocol/canonical';
// after
import { canonicalize } from '@soberania-protocol/protocol/canonical';
```

1. Rewrite only the exact specifiers `@aoc/protocol` and `@aoc/sdk` and their subpaths. Do **not**
   rewrite other `@aoc/*` or `@aoc-runtime/*` names: they are separate packages and not part of this
   migration.
2. Migrate the imports and the dependency declaration in one change. The two names are different
   packages, so one dependency graph must not contain both.
3. Re-pin your lock files and checksums. A renamed package is a new tarball, so its SHA-256, SHA-512
   and npm `integrity` values all change.
4. Until you migrate, you may stay pinned to your existing `@aoc/protocol` tarball (`file:` dependency).

## 5. Never resolve legacy scopes from the public registry

This project does **not** control the `@aoc` or `@aoc-runtime` scopes on the public npm registry.
Treat any package published there under those names as untrusted.

- Keep legacy packages as `file:` tarballs, or map the scopes to a private registry you control:

  ```ini
  @aoc:registry=https://<your-private-registry>/
  @aoc-runtime:registry=https://<your-private-registry>/
  ```

- Do not publish a package with a regular or peer dependency on `@aoc/protocol` that would be resolved
  from the public registry.

## 6. Publication

Publication is not authorized yet. It requires a release decision, legal approval of the licensing
references and the release checklist in [`docs/release/`](../release/). This page will drop its preview
banner when the packages exist on npm.
