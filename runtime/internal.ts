/**
 * Internal Runtime Surface
 *
 * These exports are for internal platform/runtime composition only.
 * They are not part of the semver-stable SDK contract.
 */

export * from './governance';
export * from './distributed';
export * from './capabilities';
export * from './attestations';
export * from './execution-fabric';

export * from './policy';

export * from './memory';

/**
 * SECURITY NOTE — HMAC capability path disabled (SOBE-SEC-03J).
 *
 * `createRuntimeServer` lives here (out of the stable `./index` surface) because the
 * HMAC capability-token path it gated `POST /data/access` and `POST /payout/execute` with
 * (`protocol/consent/capability-authorize.ts`) has no revocation check, no single-use and a
 * non-constant-time compare. That path is now disabled: `authorizeWithCapability` never
 * allows, `enforceCapabilityAccess` always denies and has no soft mode, and neither is
 * exported from any surface (the `./enforcement` re-export below carries types only). A
 * hosted request that names both principals is therefore denied.
 *
 * See docs/security/revocation/14-independent-review.md and 15-final-hardening.md.
 */
export { createRuntimeServer } from './api/server';
export * from './enforcement';
