import { HostedRuntimeClient } from '../../../../runtime/sdk/client';

/**
 * Hosted runtime client for the browser console.
 *
 * The hosted runtime authenticates callers with a principal-bound API key sent in the
 * `x-api-key` header. That key is a secret: it selects the principals the caller may act
 * for, its rate-limit tier and whether it is an administrator. A browser bundle cannot
 * hold such a key — anything compiled into it, including `VITE_*` variables, is readable
 * by every visitor — so this module deliberately configures no credential. The hardcoded
 * development key that used to live here (SOBE-SEC-03, D1) is gone and nothing replaces
 * it client-side.
 *
 * Behaviour while unconfigured: every runtime call rejects with the SDK's
 * "HostedRuntimeClient remote mode requires apiKey." error (fail closed). The startup
 * compatibility handshake is skipped so the page does not raise an unhandled rejection
 * on load. Supplying per-user credentials needs a server-side session or proxy; that is
 * a deployment decision, not something this client can solve.
 *
 * Only the runtime's base URL may come from the environment. It is not a secret; the
 * SDK default is the local development address.
 */
const configuredBaseUrl = import.meta.env.VITE_AOC_RUNTIME_BASE_URL?.trim();

export const RUNTIME_CLIENT_CREDENTIAL_STATUS = 'unconfigured' as const;

export const runtimeClient = new HostedRuntimeClient({
  ...(configuredBaseUrl ? { baseUrl: configuredBaseUrl } : {}),
  validateCompatibilityOnInit: false,
});
