import { capabilityAccessReasonCodes } from './reasonCodes';
import { readRevocation } from '../../../capability/revocation';
import { verifyConsentObjectProof } from '../../../consent/signing';
import {
  allowDecision,
  classifyIntegrityError,
  denyDecision,
  normalizeCapabilityAccessRequest,
  normalizeEvaluationTime
} from './normalize';
import type {
  CapabilityAccessChecks,
  CapabilityAccessDecision,
  CapabilityAccessRequest,
  CapabilityAccessHookResult,
  CapabilityPolicyHook,
  CapabilityUsageHook,
  NormalizedCapabilityAccessRequest
} from './types';

function makeChecks(): CapabilityAccessChecks {
  return {
    integrity: 'fail',
    temporal: 'not_applicable',
    action: 'fail',
    resource: 'fail',
    marketMaker: 'not_applicable',
    usage: 'not_applicable',
    policy: 'not_applicable'
  };
}

function evaluateConsentBinding(
  input: NormalizedCapabilityAccessRequest
): CapabilityAccessDecision | null {
  // A capability is only as good as the consent it was minted from. Without the
  // parent consent, nothing ties the capability's scope or permissions to what
  // the subject granted, so access is denied.
  if (!input.consent) {
    return denyDecision(
      input.evaluatedAt,
      capabilityAccessReasonCodes.CONSENT_INVALID,
      'Parent consent is required for capability access.',
      makeChecks(),
      {
        failureStage: 'integrity',
        capabilityHash: input.capability.capabilityHash,
        consentRef: input.capability.consentRef
      }
    );
  }

  // Only a consent signed by its subject grants anything. Unsigned (legacy) or
  // tampered consents are denied before any of their content is trusted.
  const proof = verifyConsentObjectProof(input.consent);
  if (!proof.valid) {
    return denyDecision(
      input.evaluatedAt,
      capabilityAccessReasonCodes.CONSENT_UNAUTHENTICATED,
      proof.reason,
      makeChecks(),
      {
        failureStage: 'integrity',
        capabilityHash: input.capability.capabilityHash,
        consentRef: input.capability.consentRef
      }
    );
  }

  if (input.consent.action !== 'grant') {
    return denyDecision(
      input.evaluatedAt,
      capabilityAccessReasonCodes.CONSENT_INVALID,
      'Parent consent must be an active grant for capability access.',
      makeChecks(),
      {
        failureStage: 'integrity',
        capabilityHash: input.capability.capabilityHash,
        consentRef: input.capability.consentRef
      }
    );
  }

  if (input.capability.consentRef !== input.consent.consent_hash) {
    return denyDecision(
      input.evaluatedAt,
      capabilityAccessReasonCodes.CONSENT_MISMATCH,
      'Capability consent reference does not match the supplied parent consent.',
      makeChecks(),
      {
        failureStage: 'integrity',
        capabilityHash: input.capability.capabilityHash,
        consentRef: input.capability.consentRef
      }
    );
  }

  const rawCapability = input.capability.raw as Record<string, unknown>;

  if (rawCapability.subject !== input.consent.subject) {
    return denyDecision(
      input.evaluatedAt,
      capabilityAccessReasonCodes.CONSENT_MISMATCH,
      'Capability subject does not match the supplied parent consent.',
      makeChecks(),
      {
        failureStage: 'integrity',
        capabilityHash: input.capability.capabilityHash,
        consentRef: input.capability.consentRef
      }
    );
  }

  if (rawCapability.grantee !== input.consent.grantee) {
    return denyDecision(
      input.evaluatedAt,
      capabilityAccessReasonCodes.CONSENT_MISMATCH,
      'Capability grantee does not match the supplied parent consent.',
      makeChecks(),
      {
        failureStage: 'integrity',
        capabilityHash: input.capability.capabilityHash,
        consentRef: input.capability.consentRef
      }
    );
  }

  if (input.capability.marketMakerId !== (input.consent.marketMakerId ?? null)) {
    return denyDecision(
      input.evaluatedAt,
      capabilityAccessReasonCodes.CONSENT_MISMATCH,
      'Capability marketMakerId does not match the supplied parent consent.',
      makeChecks(),
      {
        failureStage: 'integrity',
        capabilityHash: input.capability.capabilityHash,
        consentRef: input.capability.consentRef,
        boundMarketMakerId: input.capability.marketMakerId ?? undefined,
        consentMarketMakerId: input.consent.marketMakerId
      }
    );
  }

  const containmentFailure = findConsentContainmentFailure(input.capability, input.consent);
  if (containmentFailure) {
    return denyDecision(
      input.evaluatedAt,
      capabilityAccessReasonCodes.CONSENT_MISMATCH,
      containmentFailure,
      makeChecks(),
      {
        failureStage: 'integrity',
        capabilityHash: input.capability.capabilityHash,
        consentRef: input.capability.consentRef
      }
    );
  }

  return null;
}

/**
 * The capability may only narrow its parent consent: every scope entry and
 * permission must be granted by the consent, and the capability must not start
 * before the consent was issued.
 */
function findConsentContainmentFailure(
  capability: NormalizedCapabilityAccessRequest['capability'],
  consent: NonNullable<NormalizedCapabilityAccessRequest['consent']>
): string | null {
  const consentScope = new Set(consent.scope.map((entry) => `${entry.type}:${entry.ref}`));
  for (const entry of capability.scope) {
    if (!consentScope.has(`${entry.type}:${entry.ref}`)) {
      return 'Capability scope is not covered by the parent consent.';
    }
  }

  const consentPermissions = new Set(consent.permissions);
  for (const permission of capability.permissions) {
    if (!consentPermissions.has(permission)) {
      return 'Capability permissions are not covered by the parent consent.';
    }
  }

  const consentIssuedAt = Date.parse(consent.issued_at);
  const rawIssuedAt = (capability.raw as Record<string, unknown>).issued_at;
  const startTimes = [capability.notBefore, typeof rawIssuedAt === 'string' ? rawIssuedAt : null];
  for (const start of startTimes) {
    if (start !== null && !(Date.parse(start) >= consentIssuedAt)) {
      return 'Capability validity starts before the parent consent was issued.';
    }
  }

  return null;
}


function parseTimestampOrNull(value: unknown): Date | null {
  if (typeof value !== 'string') {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function evaluateHookResult(
  hookResult: CapabilityAccessHookResult,
  evaluatedAt: string,
  checks: CapabilityAccessChecks,
  kind: 'usage' | 'policy',
  defaultReasonCode: 'USAGE_DENIED' | 'POLICY_DENIED'
): CapabilityAccessDecision | null {
  if (hookResult.allowed) {
    checks[kind] = 'pass';
    return null;
  }

  checks[kind] = 'fail';
  return denyDecision(
    evaluatedAt,
    hookResult.reasonCode ?? capabilityAccessReasonCodes[defaultReasonCode],
    hookResult.reason ?? `${kind === 'usage' ? 'Usage' : 'Policy'} evaluation denied access.`,
    checks,
    {
      failureStage: kind,
      ...(hookResult.metadata ?? {})
    }
  );
}

function evaluateMarketMakerTrust(
  marketMakerId: string,
  request: CapabilityAccessRequest,
  evaluatedAt: string,
  checks: CapabilityAccessChecks,
  metadata: { capabilityHash?: string; tokenId?: string; consentRef?: string }
): CapabilityAccessDecision | null {
  const registry = request.marketMakerRegistry;

  if (!registry) {
    // The capability declares a marketMakerId binding but the caller has not wired a registry to
    // verify its trust status. Absence of a check is not proof the market maker is trustworthy —
    // fail closed instead of silently passing (see docs/security/revocation).
    checks.marketMaker = 'fail';
    return denyDecision(
      evaluatedAt,
      capabilityAccessReasonCodes.MARKET_MAKER_TRUST_UNVERIFIABLE,
      'Capability is bound to a marketMakerId but no marketMakerRegistry was provided to verify its trust status.',
      checks,
      {
        failureStage: 'marketMaker',
        ...metadata,
        boundMarketMakerId: marketMakerId
      }
    );
  }

  if (!registry.exists(marketMakerId)) {
    checks.marketMaker = 'fail';
    return denyDecision(
      evaluatedAt,
      capabilityAccessReasonCodes.UNKNOWN_MARKET_MAKER,
      'Capability marketMakerId is structurally valid but not registered.',
      checks,
      {
        failureStage: 'marketMaker',
        ...metadata,
        boundMarketMakerId: marketMakerId
      }
    );
  }

  const status = registry.getStatus(marketMakerId);
  if (status === 'deprecated') {
    checks.marketMaker = 'fail';
    return denyDecision(
      evaluatedAt,
      capabilityAccessReasonCodes.MARKET_MAKER_DEPRECATED,
      'Capability marketMakerId is registered but deprecated and not trusted for runtime access.',
      checks,
      {
        failureStage: 'marketMaker',
        ...metadata,
        boundMarketMakerId: marketMakerId,
        marketMakerStatus: status
      }
    );
  }

  if (status === 'revoked') {
    checks.marketMaker = 'fail';
    return denyDecision(
      evaluatedAt,
      capabilityAccessReasonCodes.MARKET_MAKER_REVOKED,
      'Capability marketMakerId is registered but revoked and cannot operate.',
      checks,
      {
        failureStage: 'marketMaker',
        ...metadata,
        boundMarketMakerId: marketMakerId,
        marketMakerStatus: status
      }
    );
  }

  return null;
}

function invokeOptionalHook(
  hook: CapabilityUsageHook | CapabilityPolicyHook | undefined,
  normalized: NormalizedCapabilityAccessRequest,
  evaluatedAt: string,
  checks: CapabilityAccessChecks,
  kind: 'usage' | 'policy',
  defaultReasonCode: 'USAGE_DENIED' | 'POLICY_DENIED'
): CapabilityAccessDecision | null {
  if (!hook) {
    return null;
  }

  try {
    return evaluateHookResult(
      hook(normalized),
      evaluatedAt,
      checks,
      kind,
      defaultReasonCode
    );
  } catch (error) {
    checks[kind] = 'fail';
    return denyDecision(
      evaluatedAt,
      capabilityAccessReasonCodes.INTERNAL_EVALUATION_ERROR,
      (error as Error).message || 'Internal capability evaluation error.',
      checks,
      { failureStage: kind }
    );
  }
}

export function evaluateCapabilityAccess(
  input: CapabilityAccessRequest
): CapabilityAccessDecision {
  const checks = makeChecks();

  try {
    const evaluatedAt = normalizeEvaluationTime(input.now);
    const normalized = normalizeCapabilityAccessRequest(input, evaluatedAt);
    const consentDecision = evaluateConsentBinding(normalized);

    if (consentDecision) {
      return consentDecision;
    }

    // Revocation is read from the injected registry only. A revoked consent
    // withdraws every capability that references it; a revoked capability hash
    // is operator containment of that one token. No registry means no decision.
    const revocation = readRevocation(normalized.revocationRegistry, {
      capability_hash: normalized.capability.capabilityHash ?? '',
      consent_hash: normalized.consent!.consent_hash
    });
    if (revocation.state !== 'clear') {
      const revocationMetadata = {
        failureStage: 'revocation' as const,
        capabilityHash: normalized.capability.capabilityHash,
        tokenId: normalized.capability.tokenId,
        consentRef: normalized.capability.consentRef
      };
      if (revocation.state === 'unavailable') {
        return denyDecision(
          evaluatedAt,
          capabilityAccessReasonCodes.REVOCATION_UNAVAILABLE,
          `Revocation status could not be determined: ${revocation.reason}`,
          checks,
          revocationMetadata
        );
      }
      return denyDecision(
        evaluatedAt,
        revocation.state === 'revoked_consent'
          ? capabilityAccessReasonCodes.CONSENT_REVOKED
          : capabilityAccessReasonCodes.CAPABILITY_REVOKED,
        revocation.state === 'revoked_consent'
          ? 'Parent consent has been revoked by its subject.'
          : 'Capability token has been revoked.',
        checks,
        revocationMetadata
      );
    }

    try {
      checks.integrity = 'pass';

      if (
        normalized.capability.status !== null &&
        normalized.capability.status !== 'active'
      ) {
        return denyDecision(
          evaluatedAt,
          capabilityAccessReasonCodes.CAPABILITY_INACTIVE,
          `Capability status ${normalized.capability.status} does not permit access.`,
          checks,
          {
            failureStage: 'integrity',
            capabilityHash: normalized.capability.capabilityHash,
            tokenId: normalized.capability.tokenId,
            consentRef: normalized.capability.consentRef
          }
        );
      }

      checks.temporal = 'pass';
      const effectiveStart = normalized.capability.notBefore;
      if (effectiveStart !== null && evaluatedAt < effectiveStart) {
        checks.temporal = 'fail';
        return denyDecision(
          evaluatedAt,
          capabilityAccessReasonCodes.CAPABILITY_NOT_YET_VALID,
          'Capability is not yet valid at the requested evaluation time.',
          checks,
          {
            failureStage: 'temporal',
            capabilityHash: normalized.capability.capabilityHash,
            tokenId: normalized.capability.tokenId,
            consentRef: normalized.capability.consentRef
          }
        );
      }

      const capabilityExpiresAt = new Date(normalized.capability.expiresAt);
      const capabilityIssuedAt = parseTimestampOrNull(
        (normalized.capability.raw as Record<string, unknown>).issued_at
      );
      const consentIssuedAt = parseTimestampOrNull(normalized.consent?.issued_at);
      const consentExpiresAt = parseTimestampOrNull(normalized.consent?.expires_at ?? null);

      if (capabilityIssuedAt && capabilityExpiresAt.getTime() <= capabilityIssuedAt.getTime()) {
        checks.temporal = 'fail';
        return denyDecision(
          evaluatedAt,
          capabilityAccessReasonCodes.EXPIRATION_MISMATCH,
          'Capability expiration must be later than capability issuance.',
          checks,
          {
            failureStage: 'temporal',
            capabilityHash: normalized.capability.capabilityHash,
            tokenId: normalized.capability.tokenId,
            consentRef: normalized.capability.consentRef
          }
        );
      }

      if (consentIssuedAt && capabilityExpiresAt.getTime() <= consentIssuedAt.getTime()) {
        checks.temporal = 'fail';
        return denyDecision(
          evaluatedAt,
          capabilityAccessReasonCodes.EXPIRATION_MISMATCH,
          'Capability expiration must be later than parent consent issuance.',
          checks,
          {
            failureStage: 'temporal',
            capabilityHash: normalized.capability.capabilityHash,
            tokenId: normalized.capability.tokenId,
            consentRef: normalized.capability.consentRef
          }
        );
      }

      if (consentExpiresAt && capabilityExpiresAt.getTime() > consentExpiresAt.getTime()) {
        checks.temporal = 'fail';
        return denyDecision(
          evaluatedAt,
          capabilityAccessReasonCodes.EXPIRATION_MISMATCH,
          'Capability expiration exceeds parent consent expiration.',
          checks,
          {
            failureStage: 'temporal',
            capabilityHash: normalized.capability.capabilityHash,
            tokenId: normalized.capability.tokenId,
            consentRef: normalized.capability.consentRef
          }
        );
      }

      if (consentExpiresAt && new Date(evaluatedAt).getTime() > consentExpiresAt.getTime()) {
        checks.temporal = 'fail';
        return denyDecision(
          evaluatedAt,
          capabilityAccessReasonCodes.CONSENT_EXPIRED,
          'Parent consent has expired at the requested evaluation time.',
          checks,
          {
            failureStage: 'temporal',
            capabilityHash: normalized.capability.capabilityHash,
            tokenId: normalized.capability.tokenId,
            consentRef: normalized.capability.consentRef
          }
        );
      }

      if (new Date(evaluatedAt).getTime() > capabilityExpiresAt.getTime()) {
        checks.temporal = 'fail';
        return denyDecision(
          evaluatedAt,
          capabilityAccessReasonCodes.CAPABILITY_EXPIRED,
          'Capability has expired at the requested evaluation time.',
          checks,
          {
            failureStage: 'temporal',
            capabilityHash: normalized.capability.capabilityHash,
            tokenId: normalized.capability.tokenId,
            consentRef: normalized.capability.consentRef
          }
        );
      }

      if (!normalized.capability.permissions.includes(normalized.action)) {
        checks.action = 'fail';
        return denyDecision(
          evaluatedAt,
          capabilityAccessReasonCodes.ACTION_NOT_ALLOWED,
          `Capability does not allow action "${normalized.action}".`,
          checks,
          {
            failureStage: 'action',
            capabilityHash: normalized.capability.capabilityHash,
            tokenId: normalized.capability.tokenId,
            consentRef: normalized.capability.consentRef
          }
        );
      }
      checks.action = 'pass';

      const requestedResourceKey = `${normalized.resource.type}:${normalized.resource.ref}`;
      const matchedResource = normalized.capability.scope.find(
        (scopeEntry) => `${scopeEntry.type}:${scopeEntry.ref}` === requestedResourceKey
      );

      if (!matchedResource) {
        checks.resource = 'fail';
        return denyDecision(
          evaluatedAt,
          capabilityAccessReasonCodes.RESOURCE_NOT_ALLOWED,
          `Capability does not allow resource "${requestedResourceKey}".`,
          checks,
          {
            failureStage: 'resource',
            capabilityHash: normalized.capability.capabilityHash,
            tokenId: normalized.capability.tokenId,
            consentRef: normalized.capability.consentRef
          }
        );
      }
      checks.resource = 'pass';

      if (normalized.capability.marketMakerId !== null) {
        // Trust verification of the capability's OWN bound market maker runs first, regardless
        // of what the request asks for: if we cannot prove the bound market maker is trustworthy
        // (no registry, unknown, deprecated, revoked), that is reason enough to deny before ever
        // comparing it against the request's requested marketMakerId.
        const marketMakerTrustDecision = evaluateMarketMakerTrust(
          normalized.capability.marketMakerId,
          input,
          evaluatedAt,
          checks,
          {
            capabilityHash: normalized.capability.capabilityHash,
            tokenId: normalized.capability.tokenId,
            consentRef: normalized.capability.consentRef
          }
        );

        if (marketMakerTrustDecision) {
          return marketMakerTrustDecision;
        }

        if (!normalized.marketMakerId) {
          checks.marketMaker = 'fail';
          return denyDecision(
            evaluatedAt,
            capabilityAccessReasonCodes.MARKET_MAKER_REQUIRED,
            'Capability is bound to a market maker and requires marketMakerId in the request.',
            checks,
            {
              failureStage: 'marketMaker',
              capabilityHash: normalized.capability.capabilityHash,
              tokenId: normalized.capability.tokenId,
              consentRef: normalized.capability.consentRef,
              boundMarketMakerId: normalized.capability.marketMakerId ?? undefined
            }
          );
        }

        if (normalized.marketMakerId !== normalized.capability.marketMakerId) {
          checks.marketMaker = 'fail';
          return denyDecision(
            evaluatedAt,
            capabilityAccessReasonCodes.MARKET_MAKER_MISMATCH,
            'Requested market maker does not match the capability binding.',
            checks,
            {
              failureStage: 'marketMaker',
              capabilityHash: normalized.capability.capabilityHash,
              tokenId: normalized.capability.tokenId,
              consentRef: normalized.capability.consentRef,
              marketMakerId: normalized.marketMakerId,
              boundMarketMakerId: normalized.capability.marketMakerId ?? undefined
            }
          );
        }

        checks.marketMaker = 'pass';
      }

      const usageDecision = invokeOptionalHook(
        input.hooks?.usage,
        normalized,
        evaluatedAt,
        checks,
        'usage',
        'USAGE_DENIED'
      );
      if (usageDecision) {
        return usageDecision;
      }

      const policyDecision = invokeOptionalHook(
        input.hooks?.policy,
        normalized,
        evaluatedAt,
        checks,
        'policy',
        'POLICY_DENIED'
      );
      if (policyDecision) {
        return policyDecision;
      }

      return allowDecision(
        evaluatedAt,
        'Capability explicitly authorizes the requested action on the requested resource.',
        checks,
        {
          capabilityHash: normalized.capability.capabilityHash,
          tokenId: normalized.capability.tokenId,
          consentRef: normalized.capability.consentRef,
          matchedAction: normalized.action,
          matchedResource: requestedResourceKey,
          marketMakerId: normalized.marketMakerId,
          boundMarketMakerId: normalized.capability.marketMakerId ?? undefined
        }
      );
    } catch (error) {
      return denyDecision(
        evaluatedAt,
        capabilityAccessReasonCodes.INTERNAL_EVALUATION_ERROR,
        (error as Error).message || 'Internal capability evaluation error.',
        checks,
        { failureStage: 'completed' }
      );
    }
  } catch (error) {
    const evaluatedAt =
      input.now === undefined
        ? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
        : new Date(0).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const classified = classifyIntegrityError(error);

    return denyDecision(
      evaluatedAt,
      classified.code,
      classified.message,
      checks,
      { failureStage: 'integrity' }
    );
  }
}
