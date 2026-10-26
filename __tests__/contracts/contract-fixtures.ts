import {
  AuthorityStatus,
  AttestationType,
  DecisionStatus,
  PrincipalKind,
  ProofType,
  ReferenceSourceKind,
  RegistryAuthorityLevel,
  RegistryType,
  VerificationStatus,
  type CanonicalAttestation,
  type CanonicalAuthority,
  type CanonicalDecision,
  type CanonicalPrincipalRef,
  type CanonicalProofEnvelope,
  type CanonicalProofRef,
  type CanonicalRegistryRef,
  type CanonicalVerification,
} from '@aoc/protocol/claims';
import type {
  AuditEventEnvelope,
  CapabilityGrant,
  CapabilityToken,
  ConsentGrant,
  PolicyDecision,
} from '@aoc/protocol/contracts';
import { CAPABILITY_CLAIM_VERSION, type CapabilityClaim } from '@aoc/protocol/claims';
import type { ReasonCodeRegistryEntry } from '../../runtime/governance/reason-codes';
import type { ExecutionRequest } from '../../protocol/execution';

export const canonicalPrincipalRefFixture: CanonicalPrincipalRef = {
  id: 'principal-human-1',
  kind: PrincipalKind.Human,
  displayName: 'Protocol Fixture Principal',
  source: {
    kind: ReferenceSourceKind.DID,
    value: 'did:aoc:principal-human-1',
    label: 'Fixture DID',
  },
  metadata: { fixture: 'identity-principal-reference' },
};

export const canonicalAuthorityFixture: CanonicalAuthority = {
  id: 'authority-1',
  capabilityRefs: ['capability-governance-approve'],
  scope: {
    kind: 'Workspace',
    value: 'workspace-1',
    description: 'Workspace governance approvals',
  },
  status: AuthorityStatus.Granted,
  issuedAt: '2026-06-05T00:00:00.000Z',
};

export const canonicalCapabilityClaimFixture: CapabilityClaim = {
  version: CAPABILITY_CLAIM_VERSION,
  issuer: {
    app: 'aoc-runtime',
    workspaceId: 'workspace-1',
    issuerType: 'system',
    trustDomain: 'protocol-fixtures',
    issuerId: 'issuer-system-1',
  },
  subject: { subjectType: 'agent', agentId: 'agent-1' },
  authority: {
    action: 'approve',
    requestedPermission: 'governance:approve',
    resourceType: 'project',
    resourceId: 'project-1',
    workspaceId: 'workspace-1',
    projectId: 'project-1',
  },
  constraints: {
    maxUses: 1,
    allowedUntil: '2026-06-06T00:00:00.000Z',
    canDelegate: false,
    delegationDepth: 0,
    allowedActions: ['approve'],
    allowedProjectIds: ['project-1'],
    allowedResourceTypes: ['project'],
  },
  lineage: {
    parentDecisionId: 'decision-1',
    parentGrantId: 'grant-1',
    rootApprovalRequestId: 'approval-request-1',
    issuedAt: '2026-06-05T00:00:00.000Z',
  },
  proof: {
    algorithm: 'ed25519',
    keyId: 'key-1',
    signature: 'fixture-signature',
    trustDomain: 'protocol-fixtures',
    issuedAt: '2026-06-05T00:00:00.000Z',
  },
};

export const canonicalCapabilityTokenFixture: CapabilityToken = {
  schemaVersion: '1.0.0',
  tokenId: 'capability-token-1',
  issuer: 'issuer-system-1',
  subject: 'agent-1',
  resource: {
    kind: 'project',
    id: 'project-1',
    tenantId: 'workspace-1',
    attributes: { environment: 'fixture' },
  },
  scope: ['governance:approve'],
  constraints: [{ name: 'projectId', operator: 'eq', value: 'project-1' }],
  delegation: {
    delegator: 'principal-human-1',
    chainDepth: 0,
    maxDepth: 1,
    allowedReDelegation: false,
  },
  expiresAt: '2026-06-06T00:00:00.000Z',
  notBefore: '2026-06-05T00:00:00.000Z',
  revocationRefs: ['revocation-list-1'],
  proof: {
    proofType: 'detached-signature',
    proofRef: 'proof-ref-1',
    issuedAt: '2026-06-05T00:00:00.000Z',
  },
};

export const canonicalCapabilityGrantFixture: CapabilityGrant = {
  ...canonicalCapabilityTokenFixture,
  tokenId: 'capability-grant-1',
};

export const canonicalConsentGrantFixture: ConsentGrant = {
  schemaVersion: '1.0.0',
  grantId: 'consent-grant-1',
  grantor: 'principal-human-1',
  grantee: 'agent-1',
  purpose: 'Protocol fixture extraction baseline',
  allowedOperations: ['read', 'summarize'],
  issuedAt: '2026-06-05T00:00:00.000Z',
  legalBasis: { basisType: 'consent' },
  contextualConditions: [{ key: 'workspaceId', operator: 'eq', value: 'workspace-1' }],
};

export const canonicalAuditEventEnvelopeFixture: AuditEventEnvelope = {
  eventId: 'audit-event-1',
  eventType: 'protocol.fixture.created',
  emittedAt: '2026-06-05T00:00:00.000Z',
  actorId: 'principal-human-1',
  payload: {
    fixture: 'audit-event-envelope',
    contract: 'AuditEventEnvelope',
  },
};

export const canonicalProofRefFixture: CanonicalProofRef = {
  id: 'proof-ref-1',
  type: ProofType.SignatureProof,
  source: {
    kind: ReferenceSourceKind.URI,
    value: 'aoc://proofs/proof-ref-1',
  },
  description: 'Fixture proof artifact reference',
  metadata: { fixture: 'proof-ref' },
};

export const canonicalProofEnvelopeFixture: CanonicalProofEnvelope = {
  id: 'proof-envelope-1',
  proofType: ProofType.SignatureProof,
  proofRefs: [canonicalProofRefFixture],
  subject: canonicalPrincipalRefFixture,
  issuer: 'issuer-system-1',
  issuedAt: '2026-06-05T00:00:00.000Z',
  metadata: { fixture: 'proof-envelope' },
};

export const canonicalRegistryReferenceFixture: CanonicalRegistryRef = {
  id: 'registry-1',
  type: RegistryType.PrincipalRegistry,
  namespace: 'aoc.protocol.fixtures',
  authorityLevel: RegistryAuthorityLevel.ProtocolRecognized,
  source: {
    kind: ReferenceSourceKind.URI,
    value: 'aoc://registries/registry-1',
  },
  metadata: { fixture: 'registry-reference' },
};

export const canonicalAttestationFixture: CanonicalAttestation = {
  id: 'attestation-1',
  type: AttestationType.Governance,
  attester: canonicalPrincipalRefFixture,
  claimRef: 'claim-1',
  statement: 'Fixture claim is attested for contract drift baselining.',
  issuedAt: '2026-06-05T00:00:00.000Z',
  proofRefs: [canonicalProofRefFixture],
  metadata: { fixture: 'attestation-envelope-current-canonical' },
};

export const canonicalVerificationFixture: CanonicalVerification = {
  id: 'verification-1',
  claimRef: 'claim-1',
  status: VerificationStatus.Verified,
  verifier: 'verifier-1',
  verifiedAt: '2026-06-05T00:00:00.000Z',
  findings: ['fixture-verification-passed'],
  proofRefs: [canonicalProofRefFixture],
  registryRefs: [],
  confidence: 0.99,
};

export const canonicalPolicyDecisionFixture: PolicyDecision = 'allow';

export const canonicalDecisionFixture: CanonicalDecision = {
  id: 'decision-1',
  authorityRef: canonicalAuthorityFixture.id,
  status: DecisionStatus.Approved,
  decisionMaker: canonicalPrincipalRefFixture,
  decisionDate: '2026-06-05T00:00:00.000Z',
  reason: 'Fixture policy decision approved.',
};

export const canonicalReasonCodeFixture: ReasonCodeRegistryEntry = {
  code: 'ACCESS_ALLOWED',
  category: 'auth',
  severity: 'info',
  audience: 'sdk',
  lifecycle: 'stable',
  visibility: 'public',
  owner: 'runtime',
  classification: 'allow',
  summary: 'Access approved.',
  machineMeaning: 'Authorization approved.',
  explainabilityHint: 'The request satisfied all active authorization checks.',
  compatibilityNotes: 'Canonical allow outcome.',
  telemetryClassification: 'decision',
  sdkExposurePolicy: 'public-stable',
  auditSafe: true,
  telemetryOnly: false,
};

export const canonicalExecutionRequestFixture: ExecutionRequest = {
  capability: {
    capability_hash: 'capability-hash-1',
    parent_consent_hash: 'consent-hash-1',
    subject: 'principal-human-1',
    grantee: 'agent-1',
    scope: [{ type: 'content', ref: 'dataset-1' }],
    permissions: ['read'],
    issued_at: '2026-06-05T00:00:00.000Z',
    expires_at: '2026-06-06T00:00:00.000Z',
  },
  consent: {
    version: '1.0',
    subject: 'principal-human-1',
    grantee: 'agent-1',
    action: 'grant',
    scope: [{ type: 'content', ref: 'dataset-1' }],
    permissions: ['read'],
    issued_at: '2026-06-04T00:00:00.000Z',
    expires_at: '2026-06-07T00:00:00.000Z',
    prior_consent: null,
    consent_hash: 'consent-hash-1',
  },
  requested_scope: [{ type: 'content', ref: 'dataset-1' }],
  requested_permissions: ['read'],
  subject: 'principal-human-1',
  grantee: 'agent-1',
  resource: { type: 'content', ref: 'dataset-1' },
  execution_target: { adapter: 'fixture-adapter', operation: 'summarize' },
  action_context: { workspaceId: 'workspace-1' },
  payload: { prompt: 'Summarize fixture content.' },
  now: new Date('2026-06-05T00:00:00.000Z'),
};

export const invalidReasonCodeFixture = 'DOES_NOT_EXIST';

export const invalidExecutionRequestFixture = {
  requested_scope: [{ type: 'content', ref: 'dataset-1' }],
  requested_permissions: ['read'],
  execution_target: { adapter: 'fixture-adapter', operation: 'summarize' },
};

export const stableCanonicalFixtures = {
  principalRef: canonicalPrincipalRefFixture,
  authority: canonicalAuthorityFixture,
  capabilityClaim: canonicalCapabilityClaimFixture,
  capabilityToken: canonicalCapabilityTokenFixture,
  capabilityGrant: canonicalCapabilityGrantFixture,
  consentGrant: canonicalConsentGrantFixture,
  auditEventEnvelope: canonicalAuditEventEnvelopeFixture,
  attestation: canonicalAttestationFixture,
  proofEnvelope: canonicalProofEnvelopeFixture,
  verification: canonicalVerificationFixture,
  registryReference: canonicalRegistryReferenceFixture,
  policyDecision: canonicalPolicyDecisionFixture,
  decision: canonicalDecisionFixture,
  reasonCode: canonicalReasonCodeFixture,
  executionRequest: canonicalExecutionRequestFixture,
} as const;
