// Canonical identity note: runtime APIs preserve legacy wire fields while mapping to principal semantics.
//
// ControlPlaneService.revokeGrant is the canonical write path for execution-grant revocation in
// this runtime (see docs/security/revocation). It is:
//   - idempotent: an idempotency_key replays the original result instead of re-mutating state;
//   - stable on repeat: revoking an already-revoked grant returns the original revocation, it does
//     not move the revoked_at timestamp forward;
//   - atomic: the state transition + evidence write is a single synchronous block. Node.js runs
//     synchronous code to completion before yielding to any other task, so no concurrent call can
//     observe a partially-revoked grant — this is the in-memory equivalent of a DB transaction for
//     a store that has no persistence layer yet (see docs/security/revocation/06-cascade-design.md
//     for the documented limitation and upgrade path to a real transactional store);
//   - never blocked by billing/entitlement state: this file has no dependency on
//     runtime/usage or runtime/monetization, and none should ever be added to this path
//     (see docs/security/revocation/08-billing-safety-override.md, ADR §13).
import {
  REVOCATION_TELEMETRY_EVENTS,
  emitRevocationTelemetry,
  type RevocationTelemetryHook,
} from '../protocol/revocation';

export type AccessRequestStatus = 'pending' | 'approved' | 'denied';

export type AccessRequest = {
  request_id: string;
  subject_id: string;
  requester_id: string;
  dataset_id: string;
  purpose: string;
  requested_scope: string[];
  status: AccessRequestStatus;
  created_at: string;
  updated_at: string;
};

export type ConsentDecision = {
  decision: 'approve' | 'deny';
  reason_code: string;
  notes?: string;
};

export type GrantedAccess = {
  grant_id: string;
  request_id: string;
  subject_id: string;
  requester_id: string;
  dataset_id: string;
  scope: string[];
  granted_at: string;
  expires_at?: string;
  status: 'active' | 'revoked';
  revoked_at?: string;
  revocation_id?: string;
  revocation_reason_code?: string;
};

export type RevocationEvidenceRecord = {
  evidence_record_id: string;
  revocation_id: string;
  grant_id: string;
  subject_id: string;
  requester_id: string;
  reason_code: string;
  idempotency_key?: string;
  /** Owner of the authenticated authority that revoked the grant. */
  revoked_by: string;
  requested_at: string;
  completed_at: string;
};

/**
 * The authenticated party asking for the revocation (the hosted runtime derives it from the API
 * key, never from the request body). It may revoke a grant only if it is an admin or one of its
 * principals is that grant's subject or requester.
 */
export type RevokeGrantAuthority = {
  owner: string;
  principals: readonly string[];
  admin?: boolean;
};

export type RevokeGrantInput = {
  grant_id: string;
  subject_id?: string;
  requester_id?: string;
  reason?: string;
  idempotency_key?: string;
  authority: RevokeGrantAuthority;
};

export type RevokeGrantResult = {
  grant: GrantedAccess;
  revocationId: string;
  idempotentReplay: boolean;
  evidenceRecordId: string;
  completedAt: string;
};

export class AccessGrantNotFoundError extends Error {
  constructor(grantId: string) {
    super(`ACCESS_GRANT_NOT_FOUND:${grantId}`);
    this.name = 'AccessGrantNotFoundError';
  }
}

export class RevocationIdempotencyConflictError extends Error {
  constructor(idempotencyKey: string) {
    super(`IDEMPOTENCY_CONFLICT:${idempotencyKey}`);
    this.name = 'RevocationIdempotencyConflictError';
  }
}

export class AccessGrantRevocationUnauthorizedError extends Error {
  constructor(grantId: string) {
    super(`ACCESS_GRANT_REVOCATION_UNAUTHORIZED:${grantId}`);
    this.name = 'AccessGrantRevocationUnauthorizedError';
  }
}

export class AccessGrantRequesterMismatchError extends Error {
  constructor(grantId: string) {
    super(`ACCESS_GRANT_REQUESTER_MISMATCH:${grantId}`);
    this.name = 'AccessGrantRequesterMismatchError';
  }
}

export class AccessRequestNotFoundError extends Error {
  constructor(requestId: string) {
    super(`ACCESS_REQUEST_NOT_FOUND:${requestId}`);
    this.name = 'AccessRequestNotFoundError';
  }
}

export class AccessRequestSubjectMismatchError extends Error {
  constructor(requestId: string) {
    super(`ACCESS_REQUEST_SUBJECT_MISMATCH:${requestId}`);
    this.name = 'AccessRequestSubjectMismatchError';
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function fingerprintRevokeInput(input: RevokeGrantInput): string {
  // Must include every field that gates authorization (subject_id/requester_id), not just the
  // fields that change what gets written — otherwise a replay of a known idempotency_key with a
  // different (mismatched) subject_id would return the cached result without ever re-running the
  // subject-mismatch check below, since a cache hit short-circuits before that check runs.
  return JSON.stringify({
    grant_id: input.grant_id,
    reason: input.reason ?? null,
    subject_id: input.subject_id ?? null,
    requester_id: input.requester_id ?? null,
  });
}

/**
 * Idempotency keys are scoped to the authenticated revoker: the same key used by two different
 * callers names two different replays, so nobody can squat a key and block or read another
 * party's revocation. Within one revoker, the fingerprint still detects a reused key.
 */
function idempotencyScope(authority: RevokeGrantAuthority, idempotencyKey: string): string {
  return `${authority.owner}\u0000${idempotencyKey}`;
}

function hasAuthorityOver(authority: RevokeGrantAuthority, grant: GrantedAccess): boolean {
  if (authority.admin === true) return true;
  return authority.principals.includes(grant.subject_id) || authority.principals.includes(grant.requester_id);
}

export type CreateAccessRequestInput = Omit<AccessRequest, 'request_id' | 'status' | 'created_at' | 'updated_at'>;

export class ControlPlaneService {
  private readonly requests = new Map<string, AccessRequest>();
  private readonly grants = new Map<string, GrantedAccess>();
  private readonly revocationEvidence: RevocationEvidenceRecord[] = [];
  private readonly revocationIdempotency = new Map<string, { fingerprint: string; result: RevokeGrantResult }>();
  private revocationSequence = 0;

  constructor(private readonly telemetry?: RevocationTelemetryHook) {}

  createAccessRequest(input: CreateAccessRequestInput): AccessRequest {
    const request_id = `ar_${this.requests.size + 1}`;
    const created = nowIso();
    const request: AccessRequest = { ...input, request_id, status: 'pending', created_at: created, updated_at: created };
    this.requests.set(request_id, request);
    return request;
  }

  listRequestsBySubject(input: { subject_id: string; status?: AccessRequestStatus }): AccessRequest[] {
    return [...this.requests.values()].filter(
      (request) => request.subject_id === input.subject_id && (!input.status || request.status === input.status)
    );
  }

  decideAccessRequest(input: {
    request_id: string;
    subject_id?: string;
    decision: 'approve' | 'deny';
    reason?: string;
  }): { request: AccessRequest; decision: ConsentDecision; grant?: GrantedAccess } {
    const request = this.requests.get(input.request_id);
    if (!request) {
      throw new AccessRequestNotFoundError(input.request_id);
    }

    if (input.subject_id !== undefined && input.subject_id !== request.subject_id) {
      throw new AccessRequestSubjectMismatchError(input.request_id);
    }

    const decision: ConsentDecision = {
      decision: input.decision,
      reason_code: input.reason ?? (input.decision === 'approve' ? 'APPROVED' : 'DENIED'),
    };

    request.status = decision.decision === 'approve' ? 'approved' : 'denied';
    request.updated_at = nowIso();
    this.requests.set(request.request_id, request);

    if (decision.decision === 'deny') {
      return { request, decision };
    }

    const grant: GrantedAccess = {
      grant_id: `ga_${this.grants.size + 1}`,
      request_id: request.request_id,
      subject_id: request.subject_id,
      requester_id: request.requester_id,
      dataset_id: request.dataset_id,
      scope: request.requested_scope,
      granted_at: nowIso(),
      status: 'active',
    };
    this.grants.set(grant.grant_id, grant);
    return { request, decision, grant };
  }

  listActiveGrants(input: { subject_id?: string; requester_id?: string }): GrantedAccess[] {
    return [...this.grants.values()].filter(
      (grant) =>
        grant.status === 'active' &&
        (!input.subject_id || grant.subject_id === input.subject_id) &&
        (!input.requester_id || grant.requester_id === input.requester_id)
    );
  }

  /**
   * Canonical, idempotent, fail-closed-by-construction revocation write path. Security
   * containment: never gate this on billing/usage/entitlement state (ADR §13).
   */
  revokeGrant(input: RevokeGrantInput): RevokeGrantResult {
    const requestedAt = nowIso();
    emitRevocationTelemetry(this.telemetry, REVOCATION_TELEMETRY_EVENTS.COMMAND_STARTED, {
      operation: 'revokeGrant',
      grantId: input.grant_id,
      idempotencyKeyPresent: input.idempotency_key !== undefined,
    });

    if (
      !input.authority ||
      typeof input.authority.owner !== 'string' ||
      input.authority.owner === '' ||
      !Array.isArray(input.authority.principals)
    ) {
      emitRevocationTelemetry(this.telemetry, REVOCATION_TELEMETRY_EVENTS.COMMAND_FAILED, {
        operation: 'revokeGrant',
        grantId: input.grant_id,
        reason: 'no_authority',
      });
      throw new AccessGrantRevocationUnauthorizedError(input.grant_id);
    }

    const fingerprint = fingerprintRevokeInput(input);
    const scopedKey = input.idempotency_key !== undefined ? idempotencyScope(input.authority, input.idempotency_key) : undefined;

    const grant = this.grants.get(input.grant_id);
    if (!grant) {
      emitRevocationTelemetry(this.telemetry, REVOCATION_TELEMETRY_EVENTS.COMMAND_FAILED, {
        operation: 'revokeGrant',
        grantId: input.grant_id,
        reason: 'not_found',
      });
      throw new AccessGrantNotFoundError(input.grant_id);
    }

    // Authority is checked against the stored grant, never against identifiers the caller named.
    if (!hasAuthorityOver(input.authority, grant)) {
      emitRevocationTelemetry(this.telemetry, REVOCATION_TELEMETRY_EVENTS.COMMAND_FAILED, {
        operation: 'revokeGrant',
        grantId: input.grant_id,
        reason: 'unauthorized',
      });
      throw new AccessGrantRevocationUnauthorizedError(input.grant_id);
    }

    if (input.requester_id !== undefined && input.requester_id !== grant.requester_id) {
      emitRevocationTelemetry(this.telemetry, REVOCATION_TELEMETRY_EVENTS.COMMAND_FAILED, {
        operation: 'revokeGrant',
        grantId: input.grant_id,
        reason: 'requester_mismatch',
      });
      throw new AccessGrantRequesterMismatchError(input.grant_id);
    }

    if (input.subject_id !== undefined && input.subject_id !== grant.subject_id) {
      emitRevocationTelemetry(this.telemetry, REVOCATION_TELEMETRY_EVENTS.COMMAND_FAILED, {
        operation: 'revokeGrant',
        grantId: input.grant_id,
        reason: 'subject_mismatch',
      });
      throw new AccessRequestSubjectMismatchError(input.grant_id);
    }

    // Only now, with authority over the stored grant established, may a cached result be replayed.
    if (scopedKey !== undefined) {
      const cached = this.revocationIdempotency.get(scopedKey);
      if (cached) {
        if (cached.fingerprint !== fingerprint) {
          emitRevocationTelemetry(this.telemetry, REVOCATION_TELEMETRY_EVENTS.IDEMPOTENCY_CONFLICT, {
            operation: 'revokeGrant',
            idempotencyKey: input.idempotency_key,
          });
          throw new RevocationIdempotencyConflictError(input.idempotency_key ?? scopedKey);
        }
        emitRevocationTelemetry(this.telemetry, REVOCATION_TELEMETRY_EVENTS.IDEMPOTENCY_REPLAYED, {
          operation: 'revokeGrant',
          grantId: cached.result.grant.grant_id,
          revocationId: cached.result.revocationId,
        });
        return { ...cached.result, idempotentReplay: true };
      }
    }

    // Already revoked: return the original, stable result. Repeated revoke calls must never move
    // revoked_at forward or fabricate a second evidence record for the same grant.
    if (grant.status === 'revoked') {
      const stableResult: RevokeGrantResult = {
        grant: { ...grant },
        revocationId: grant.revocation_id ?? 'unknown',
        idempotentReplay: true,
        evidenceRecordId:
          this.revocationEvidence.find((record) => record.grant_id === grant.grant_id)?.evidence_record_id ?? 'unknown',
        completedAt: grant.revoked_at ?? requestedAt,
      };
      if (scopedKey !== undefined) {
        this.revocationIdempotency.set(scopedKey, { fingerprint, result: stableResult });
      }
      emitRevocationTelemetry(this.telemetry, REVOCATION_TELEMETRY_EVENTS.IDEMPOTENCY_REPLAYED, {
        operation: 'revokeGrant',
        grantId: grant.grant_id,
        revocationId: stableResult.revocationId,
        reason: 'already_revoked',
      });
      return stableResult;
    }

    // --- Atomic section: single synchronous block, no I/O, no await. ---
    this.revocationSequence += 1;
    const revocationId = `rev_${this.revocationSequence}`;
    const completedAt = nowIso();
    const reasonCode = input.reason ?? 'MANUAL_REVOCATION';

    grant.status = 'revoked';
    grant.revoked_at = completedAt;
    grant.revocation_id = revocationId;
    grant.revocation_reason_code = reasonCode;
    this.grants.set(grant.grant_id, grant);

    const evidenceRecordId = `evd_${this.revocationEvidence.length + 1}`;
    this.revocationEvidence.push({
      evidence_record_id: evidenceRecordId,
      revocation_id: revocationId,
      grant_id: grant.grant_id,
      subject_id: grant.subject_id,
      requester_id: grant.requester_id,
      reason_code: reasonCode,
      idempotency_key: input.idempotency_key,
      revoked_by: input.authority.owner,
      requested_at: requestedAt,
      completed_at: completedAt,
    });
    // --- End atomic section. ---

    const result: RevokeGrantResult = {
      grant: { ...grant },
      revocationId,
      idempotentReplay: false,
      evidenceRecordId,
      completedAt,
    };

    if (scopedKey !== undefined) {
      this.revocationIdempotency.set(scopedKey, { fingerprint, result });
    }

    emitRevocationTelemetry(this.telemetry, REVOCATION_TELEMETRY_EVENTS.COMMAND_COMPLETED, {
      operation: 'revokeGrant',
      grantId: grant.grant_id,
      revocationId,
      latencyMs: Date.parse(completedAt) - Date.parse(requestedAt),
    });

    return result;
  }

  listRevocationEvidence(grantId?: string): RevocationEvidenceRecord[] {
    return grantId === undefined
      ? [...this.revocationEvidence]
      : this.revocationEvidence.filter((record) => record.grant_id === grantId);
  }
}
