// Types only. `enforceCapabilityAccess` (HMAC capability enforcement, disabled and always
// denying since SOBE-SEC-03J) is deliberately not re-exported from here or from any runtime
// surface; `scripts/check-runtime-export-governance.mjs` fails if it is added back.
export type { CapabilityEnforcementResult, CapabilityRequestContext, EnforcementMode } from './enforceCapability';
