import type { RevocableSubjectType, RevocationStatus } from './revocation-types';
import { revocationLookupFailedStatus, revocationLookupTimeoutStatus, verifiedNotRevokedStatus, revokedStatus } from './revocation-policy';
import { REVOCATION_TELEMETRY_EVENTS, emitRevocationTelemetry, type RevocationTelemetryHook } from './revocation-telemetry';

export type RevocationSubjectRef = {
  subjectId: string;
  subjectType: RevocableSubjectType;
};

/**
 * The only shape a material caller may use to determine revocation. Synchronous because every
 * revocation source in this repo today is an in-process registry; it always returns a
 * `RevocationStatus`, never throws, never returns a bare boolean or `null` — that structural
 * guarantee is what makes the "error -> not revoked" anti-pattern unrepresentable at the type
 * level.
 */
export type RevocationCheckPort = (subject: RevocationSubjectRef) => RevocationStatus;

/**
 * Minimal shape a revocation source must satisfy to be wrapped as a canonical port. Matches
 * `capability/registries/RevocationRegistry` (`isRevoked`/`revoke`) without importing it, so the
 * protocol layer stays free of a dependency on the capability-token subsystem.
 */
export type BooleanRevocationRegistry = {
  isRevoked(subjectId: string): boolean;
};

/**
 * Wraps a synchronous boolean registry (e.g. the capability-hash `InMemoryRevocationRegistry`)
 * as a canonical `RevocationCheckPort`. This is the fix for the anti-pattern described in the
 * sprint: any exception thrown by the underlying registry is caught here and mapped to
 * `unknown` (blocking), never to `false`/`null`/"not revoked".
 */
export function createRegistryRevocationCheck(
  registry: BooleanRevocationRegistry,
  opts?: { sourceVersion?: string; telemetry?: RevocationTelemetryHook }
): RevocationCheckPort {
  return ({ subjectId, subjectType }) => {
    const now = new Date();
    emitRevocationTelemetry(opts?.telemetry, REVOCATION_TELEMETRY_EVENTS.CHECK_STARTED, { subjectId, subjectType });

    let revoked: boolean;
    try {
      revoked = registry.isRevoked(subjectId);
    } catch {
      const status = revocationLookupFailedStatus({ subjectId, subjectType, now });
      emitRevocationTelemetry(opts?.telemetry, REVOCATION_TELEMETRY_EVENTS.CHECK_FAILED, {
        subjectId,
        subjectType,
        errorCode: status.errorCode,
      });
      return status;
    }

    if (typeof revoked !== 'boolean') {
      const status = revocationLookupFailedStatus({ subjectId, subjectType, now });
      emitRevocationTelemetry(opts?.telemetry, REVOCATION_TELEMETRY_EVENTS.CHECK_UNKNOWN, {
        subjectId,
        subjectType,
        errorCode: status.errorCode,
      });
      return status;
    }

    if (revoked) {
      const status = revokedStatus({
        subjectId,
        subjectType,
        revocationId: subjectId,
        reasonCode: 'REVOKED',
        revokedAt: now.toISOString(),
        now,
      });
      emitRevocationTelemetry(opts?.telemetry, REVOCATION_TELEMETRY_EVENTS.CHECK_REVOKED, { subjectId, subjectType });
      return status;
    }

    const status = verifiedNotRevokedStatus({ subjectId, subjectType, now, sourceVersion: opts?.sourceVersion });
    emitRevocationTelemetry(opts?.telemetry, REVOCATION_TELEMETRY_EVENTS.CHECK_NOT_REVOKED, { subjectId, subjectType });
    return status;
  };
}

/**
 * The capability model's registry (capability/registries/RevocationRegistry) answers two
 * subject types: `capability_grant` by capability_hash and `consent_grant` by consent_hash.
 * Any other subject type is `unknown` (fail closed), as are thrown or non-boolean answers.
 */
export type CapabilityModelRevocationRegistry = {
  isRevoked(capabilityHash: string): boolean;
  isConsentRevoked(consentHash: string): boolean;
};

export function createCapabilityRevocationCheck(
  registry: CapabilityModelRevocationRegistry,
  opts?: { sourceVersion?: string; telemetry?: RevocationTelemetryHook }
): RevocationCheckPort {
  const capabilities = createRegistryRevocationCheck({ isRevoked: (id) => registry.isRevoked(id) }, opts);
  const consents = createRegistryRevocationCheck({ isRevoked: (id) => registry.isConsentRevoked(id) }, opts);
  return (subject) => {
    if (subject.subjectType === 'capability_grant') return capabilities(subject);
    if (subject.subjectType === 'consent_grant') return consents(subject);
    return revocationLookupFailedStatus({ subjectId: subject.subjectId, subjectType: subject.subjectType });
  };
}

/** Always returns `unknown`. Use as an explicit, visible default for call sites that have not
 * yet been wired to a real revocation source — never silently substitute "not revoked". */
export const ALWAYS_UNKNOWN_REVOCATION_CHECK: RevocationCheckPort = ({ subjectId, subjectType }) =>
  revocationLookupFailedStatus({ subjectId, subjectType });

/** Returns a pre-resolved status regardless of the subject asked about. Intended for tests and
 * for call sites that already resolved the status upstream and just need to satisfy the port
 * shape — the explicit `RevocationStatus` argument keeps the decision visible in the caller. */
export function createStaticRevocationCheck(status: RevocationStatus): RevocationCheckPort {
  return () => status;
}

/**
 * Forward-looking async wrapper for a future DB/network-backed revocation source. Not wired to
 * any production caller today (every registry in this repo is synchronous/in-memory) but
 * implemented and tested now so a real adapter can be dropped in without redesigning the
 * fail-closed contract. A timeout, a rejection, or a malformed resolution all become `unknown`.
 */
export function withRevocationTimeout(
  check: (subject: RevocationSubjectRef) => Promise<RevocationStatus>,
  timeoutMs: number
): (subject: RevocationSubjectRef) => Promise<RevocationStatus> {
  return async (subject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<RevocationStatus>((resolve) => {
      timer = setTimeout(() => {
        resolve(revocationLookupTimeoutStatus({ subjectId: subject.subjectId, subjectType: subject.subjectType }));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([check(subject), timeout]);
      return result;
    } catch {
      return revocationLookupFailedStatus({ subjectId: subject.subjectId, subjectType: subject.subjectType });
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  };
}
