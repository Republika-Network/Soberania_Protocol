---
"@aoc-runtime/consent-runtime": patch
"@aoc-runtime/capability-runtime": patch
---

Timestamps are validated before they are compared. `ConsentRuntime` (`issuedAt`, `expiresAt`, `revokedAt`, the caller's `at`) and `CapabilityRuntime` (`expiresAt`, the caller's `now`) now validate timestamps instead of comparing them as strings. Every timestamp must now be an ISO-8601 date-time string and is compared by instant. A present but unreadable `revokedAt` denies as revoked, an unreadable `expiresAt` as expired, an unreadable `issuedAt` makes the grant unusable, and an unreadable `at`/`now` denies the evaluation. `isGrantActive` applies the same rules. Providers must serialise timestamps as ISO-8601 UTC strings; nothing else is accepted. The packaging gate's plain-Node smoke tests now cover `Date`, epoch-number and malformed values through the built entry points.

Root runtime modules (not versioned packages):

- The HMAC capability token-use path is disabled. `authorizeWithCapability` (`protocol/consent/capability-authorize.ts`) never allows: a token that passes every check is denied with the new reason code `CAPABILITY_PATH_DISABLED`, and the function is no longer exported from the `protocol/consent` barrel or the root index. `enforceCapabilityAccess` (`runtime/enforcement`) lost its `soft` mode — a request without a token is denied `CAPABILITY_MISSING`, a request with one is denied `CAPABILITY_DENIED` — and is exported from no runtime surface; `EnforcementMode` is `'strict'` only and `createRuntimeServer` refuses a soft configuration. Hosted `POST /data/access` and `POST /payout/execute` requests that name both principals are therefore denied. `scripts/check-runtime-export-governance.mjs` enforces all of this and now runs inside `check:aoc-boundaries` (CI and `validate:release`).
- `frontend/app/src/lib/runtimeClient.ts` no longer embeds a development API key. The hosted API key is a principal-bound secret that must not be compiled into a browser bundle, so the client is created without a credential and every call fails closed until a server-side session or proxy supplies one; only the runtime base URL may come from `VITE_AOC_RUNTIME_BASE_URL`.
