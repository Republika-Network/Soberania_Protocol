# 13 — Final Verdict

> **This document was written by the same sprint it evaluates and its claims were unverified at
> the time. An independent adversarial review was performed afterward — see
> [`14-independent-review.md`](14-independent-review.md) for the corrected readiness verdict,
> which supersedes the "PR Readiness" and "Remaining Risks" sections below. The rest of this
> document (root cause, fix description, scope) held up under independent verification and is
> left as originally written.**

## Was there a real fail-open bug?

Yes — but not the shape the sprint brief hypothesized (no `catch { return data?.reason ?? null }`
against a live DB, because no revocation check in this repo performed real I/O before this
sprint). The actual bug: revocation checking was an **optional callback** on evaluation options
(`isRevoked?: (x) => boolean`), and the two production API entry points that mattered most —
`POST /enforcement/evaluate` and `POST /execution/authorize` — parsed that callback out of a JSON
request body. A JSON payload can never carry a function, so `isRevoked` was unconditionally
`undefined` for every real caller, and the state machines silently treated an absent check as "not
revoked" rather than "unknown". Proven and fixed end-to-end: see
`runtime/api/__tests__/routesRevocation.test.ts`.

**Severity: P0.** It was an active, unauthenticated bypass of revocation checking on the two most
security-relevant entry points in the protocol layer, reachable by any caller who could hit those
routes.

## Scope of impact

Every caller of `evaluateEnforcement`/`authorizeExecution`/`evaluateCapabilityState`/
`evaluateConsentState` — concretely: `runtime/api/routes.ts` (`/enforcement/evaluate`,
`/execution/authorize`), `runtime/sdk/client.ts` (local mode), and every internal caller in
`protocol/capability/capability-machine.ts`, `protocol/consent/consent-machine.ts`,
`protocol/capability/capability-mint.ts`. A second, independent instance of the same class of bug
existed in `aoc/capabilities/core/evaluateCapabilityAccess.ts`'s market-maker trust check.

## Fix applied

A canonical `protocol/revocation/` module (`RevocationStatus` tri-state, `RevocationCheckPort`,
fail-closed policy resolver, telemetry) that every material evaluation function now requires as a
**mandatory, non-optional** parameter — making the omission a compile error instead of a silent
runtime default. Wired end-to-end into the real API boundary (`runtime/api/routes.ts`) against the
canonical capability-hash registry. See `03`–`05` for the model, `10` for proof.

## State

- Fail-open bug: **fixed and regression-tested** at every layer that has a real implementation
  today (capability-hash and consent-hash subjects).
- Atomic, idempotent revocation write path: **implemented** for the one concrete write path this
  codebase has (`ControlPlaneService.revokeGrant`), honestly scoped to in-memory guarantees (see
  `06`, `07`).
- Billing-safety override: **verified and preventively gated** (see `08`).
- CI gate: **implemented and verified to actually fail on regression** (see `10`).
- DB-backed integration tests: **not claimed** — no database exists to test against (see `10`).
- Cascade to delegations/execution grants/credentials: **not implemented** — no hierarchy exists
  connecting those subject types in this codebase (see `06`).

## Remaining risks (not fixed this sprint, by design — see scope discipline below)

| Risk | Where | Why not fixed now |
|---|---|---|
| `protocol/consent/capability-authorize.ts`'s HMAC capability-token format has no revocation check at all | `runtime/enforcement/enforceCapability.ts`, `runtime/api/server.ts` | Its only consumer (`server.ts`) doesn't compile/run today for unrelated pre-existing reasons; patching a revocation check into a code path with no working caller and no test coverage would be unverifiable |
| `packages/capability-runtime` / `packages/shared-types`'s `CapabilityRef` has no `revokedAt` field | `packages/authorization-runtime` | Separate publishable package; widening its public contract is a larger, independently-scoped change outside "internal ports/adapters" |
| No real persistence for any revocation subject | Whole `runtime/controlPlane.ts` / `protocol/*` state | Explicitly out of scope to fabricate (would violate "no declares tests DB-backed si no se ejecutaron" and "no crees componentes vacíos") |
| No cascade from identity/passport revocation to dependent capabilities already minted | `protocol/capability` | No reverse index/hierarchy exists to cascade through. (Consent → capability is now covered by key: a revoked `consent_grant` denies every token that references it — see `03`, `06`.) |
| Revocation registries are single-process (`InMemoryRevocationRegistry`); hosted cores and vaults each hold their own | `runtime/api/routes.ts` `RuntimeCore.revocationRegistry`, `vault/vault.ts` | A multi-instance deployment must inject a shared store behind `RevocationRegistry` that reads its own writes and throws when it cannot answer; no such backend exists or is tested here, so multi-instance revocation safety is not claimed |
| 26 pre-existing, unrelated test suites remain excluded from CI (memory engine, execution-fabric lifecycle types, hosted-runtime tests referencing unbuilt features) | Various | Confirmed pre-existing and unrelated to revocation via isolated test runs; fixing them is a separate, large, unrelated effort |
| Suspended/Superseded/Compromised are not distinct `RevocationStatus` states | `protocol/revocation` | No subject type in this codebase distinguishes them from plain expiry/revocation today |

## PR readiness

**Ready for an independent PR**, scoped to exactly the file list in this sprint's diff (see the
final chat report's "Code Changes" table for the full list). No unrelated subsystem was
refactored; the two auxiliary fixes (`node:crypto` import, `tsconfig.test.json` exclude) are
narrowly scoped and independently justified (see `11-migration-and-compatibility.md`), not scope
creep.

## Next sprint recommendation

**AOC-REVOCATION-01 — Persistent Canonical Revocation Store.** Build the real store this sprint
deliberately didn't fabricate: a Postgres/Supabase schema for `agent_identity`, `agent_passport`,
`delegation`, and `execution_grant` revocation records (append-only, RLS-scoped by
tenant/trust-domain), a `CanonicalRevocationService` backed by a real transaction/RPC replacing
`ControlPlaneService`'s in-memory `Map`, and DB-backed integration tests (RLS denial, cross-tenant
access, cascade rollback under a real transaction, concurrent revoke under real row locking) — the
exact test classes this sprint documented as absent in `10-test-evidence.md`. This is the
prerequisite for real cascade (§06's biggest gap) and for the `Suspended`/`Superseded`/
`Compromised` states this sprint left unmodeled. Do not attempt Enterprise billing integration,
multi-repo extraction, or SDK publication before this lands — per the ADR's own migration
constraints ("existing revocation paths must be made fail-closed first" — done this sprint —
"existing direct DB writes must be routed through the canonical service" — not yet possible until
the DB exists).
