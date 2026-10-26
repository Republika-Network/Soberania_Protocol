import {
  AuditRuntime as EnterpriseAuditRuntime,
  InMemoryAuditService as EnterpriseAuditService,
} from '../../enterprise/src/assurance/audit';
import {
  EnterpriseVerificationProvider,
  InMemoryVerificationKeyResolver,
} from '../../enterprise/src/assurance/verification';
import {
  DEFAULT_TRUST_ISSUERS as ENTERPRISE_DEFAULT_TRUST_ISSUERS,
  InMemoryCanonicalTrustRegistry,
  InMemoryTrustService as EnterpriseTrustService,
  identityRegistrationPayload,
} from '../../enterprise/src/assurance/trust';
import { createRuntimeAuthority, createTrustedKeySet, signPayload } from '../../crypto/engine';
import {
  DefaultRuntimeHealthReporter as EnterpriseHealthReporter,
  DefaultTraceContextProvider as EnterpriseTraceProvider,
  InMemoryAssuranceEventSink,
} from '../../enterprise/src/assurance/observability';
import { AuditRuntime as LegacyAuditRuntime } from '../../packages/audit-runtime/src/index';
import { TrustRegistryRuntime as LegacyRegistryRuntime } from '../../packages/trust-registry-runtime/src/index';
import { InMemoryAuditService as LegacyAuditService } from '../../runtime/audit';
import {
  DEFAULT_TRUST_ISSUERS,
  InMemoryTrustService,
} from '../../runtime/trust/service';
import {
  DefaultRuntimeHealthReporter,
  DefaultTraceContextProvider,
} from '../../runtime/observability';
import type { CanonicalClaim, CanonicalRegistryEntry, CanonicalRegistryRef } from '@aoc/protocol/claims';
import type { AuditEventEnvelope } from '@aoc/protocol/contracts';
import { AdapterRegistry, AdapterTokens } from '@aoc/protocol/runtime-registry';
import {
  createEnterpriseRuntimeAdapterBootstrap,
  resolveEventSinkRuntimeAdapters,
  resolveTrustRuntimeAdapters,
  resolveVerificationRuntimeAdapters,
} from '../../enterprise/src/assurance/runtime-adapter-bootstrap';

describe('PR-04 Assurance extraction parity', () => {
  it('keeps package compatibility exports bound to Enterprise implementations', () => {
    expect(LegacyAuditRuntime).toBe(EnterpriseAuditRuntime);
    expect(InMemoryTrustService).toBe(EnterpriseTrustService);
    expect(DEFAULT_TRUST_ISSUERS).toBe(ENTERPRISE_DEFAULT_TRUST_ISSUERS);
    expect(LegacyRegistryRuntime).toBeDefined();
  });

  it('preserves legacy audit storage, filtering, ordering, cloning, and retention', () => {
    const oldPath = new LegacyAuditService(2);
    const newPath = new EnterpriseAuditService(2);
    const events = [
      { event_id: '2', event_type: 'CAPABILITY_VALIDATED', occurred_at: '2026-01-02T00:00:00.000Z', metadata: { order: 2 } },
      { event_id: '1', event_type: 'CAPABILITY_VALIDATED', occurred_at: '2026-01-01T00:00:00.000Z', metadata: { order: 1 } },
      { event_id: '3', event_type: 'CAPABILITY_DENIED', occurred_at: '2026-01-03T00:00:00.000Z', metadata: { order: 3 } },
    ] as const;
    events.forEach((event) => { oldPath.recordEvent(event as never); newPath.recordEvent(event); });

    expect(oldPath.listEvents()).toEqual(newPath.listEvents());
    expect(oldPath.listEvents()).toEqual([events[1], events[2]]);
  });

  it('preserves identity verification workflow outputs and audit side effects', () => {
    const issuer = createRuntimeAuthority('runtime:kyc-global', 'kyc-global-v1');
    const trustedIssuerKeys = createTrustedKeySet([issuer.identity]);
    const provenance = { runtimeSource: 'test-suite', timestamp: '2026-01-01T00:00:00.000Z' };
    const oldPath = new InMemoryTrustService(DEFAULT_TRUST_ISSUERS, { trustedIssuerKeys });
    const newPath = new EnterpriseTrustService(ENTERPRISE_DEFAULT_TRUST_ISSUERS, { trustedIssuerKeys });
    const credentialRecord = {
      credential_ref: 'credential:1', subject_hash: 'subject:1', issuer_id: 'kyc-global-v1',
      credential_hash: 'hash', metadata_hash: 'metadata', kyc_level: 'enhanced' as const,
      issued_at: '2026-01-01T00:00:00.000Z', expires_at: '2027-01-01T00:00:00.000Z',
    };
    const consentRecord = {
      consent_id: 'consent:1', subject_hash: 'subject:1', consumer_id: 'consumer:1',
      issuer_id: 'kyc-global-v1', granted_at: '2026-01-02T00:00:00.000Z',
    };
    const credential = { ...credentialRecord, issuer_signature: signPayload(identityRegistrationPayload('credential', credentialRecord), issuer.privateKey, issuer.identity, provenance) };
    const consent = { ...consentRecord, issuer_signature: signPayload(identityRegistrationPayload('consent', consentRecord), issuer.privateKey, issuer.identity, provenance) };
    oldPath.registerCredential(credential); newPath.registerCredential(credential);
    oldPath.grantConsent(consent); newPath.grantConsent(consent);
    const input = { subject_hash: 'subject:1', consumer_id: 'consumer:1', now: new Date('2026-02-01T00:00:00.000Z') };

    expect(oldPath.verifyIdentity(input)).toEqual(newPath.verifyIdentity(input));
    expect(oldPath.getAuditEvents()).toEqual(newPath.getAuditEvents());
  });

  it('preserves trace and health output across the old and new paths', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-06T12:00:00.000Z'));
    process.env.NODE_ENV = 'test';
    expect(new DefaultTraceContextProvider().create({ requestId: 'req', endpoint: '/audit/events' }))
      .toEqual(new EnterpriseTraceProvider().create({ requestId: 'req', endpoint: '/audit/events' }));
    expect(new DefaultRuntimeHealthReporter('strict', 1).snapshot())
      .toEqual(new EnterpriseHealthReporter('strict', 1).snapshot());
    jest.useRealTimers();
  });

  it('implements VerificationProvider through VerificationKeyResolver', async () => {
    const keys = new InMemoryVerificationKeyResolver();
    keys.register({ keyId: 'key:1', issuer: 'issuer:1', algorithm: 'ed25519' });
    const implementation = new EnterpriseVerificationProvider(keys, {
      verify: (_claim, key) => key === undefined ? ['Missing verification key.'] : true,
    });
    const adapters = new AdapterRegistry();
    createEnterpriseRuntimeAdapterBootstrap(adapters, {
      adapters: { verificationKeyResolver: keys, verificationProvider: implementation },
      required: [AdapterTokens.VerificationKeyResolver, AdapterTokens.VerificationProvider],
    }).bootstrap();
    const { verificationProvider: provider } = resolveVerificationRuntimeAdapters(adapters);
    const claim = {
      id: 'claim:1', type: 'Identity', subject: 'subject:1', issuer: 'issuer:1', assertionRef: 'assertion:1',
      evidenceRefs: [], attestationRefs: [], issuedAt: '2026-01-01T00:00:00.000Z',
    } as CanonicalClaim;

    await expect(provider.verifyClaim(claim, { requestedAt: '2026-06-06T00:00:00.000Z' }))
      .resolves.toMatchObject({ claimRef: 'claim:1', status: 'Verified', findings: [] });
  });

  it('implements RegistryLookup and TrustRegistryProvider over one store', () => {
    const registryRef = { id: 'registry:1', type: 'CredentialRegistry', namespace: 'enterprise', authorityLevel: 'OrganizationDeclared' } as CanonicalRegistryRef;
    const entry = {
      id: 'entry:1', registryRef, entryType: 'Credential', subject: 'subject:1', locator: 'credential:1',
      status: 'Active', createdAt: '2026-01-01T00:00:00.000Z',
    } as CanonicalRegistryEntry;
    const implementation = new InMemoryCanonicalTrustRegistry();
    implementation.registerEntry(entry);
    const adapters = new AdapterRegistry();
    createEnterpriseRuntimeAdapterBootstrap(adapters, {
      adapters: { registryLookup: implementation, trustRegistryProvider: implementation },
      required: [AdapterTokens.RegistryLookup, AdapterTokens.TrustRegistryProvider],
    }).bootstrap();
    const { trustRegistryProvider: trustRegistry, registryLookup } = resolveTrustRuntimeAdapters(adapters);

    expect(trustRegistry.getRegistry(registryRef)).toEqual(registryRef);
    expect(registryLookup.lookupRegistry({ registryRef, subject: 'subject:1' }, { requestedAt: '2026-06-06T00:00:00.000Z' }))
      .toEqual({ status: 'Found', registryRef, entries: [entry], observedAt: '2026-06-06T00:00:00.000Z' });
  });

  it('implements all Protocol observability sink seams without mutating events', () => {
    const implementation = new InMemoryAssuranceEventSink();
    const adapters = new AdapterRegistry();
    createEnterpriseRuntimeAdapterBootstrap(adapters, {
      adapters: {
        auditEventSink: implementation,
        securityEventSink: implementation,
        protocolEventSink: implementation,
        observabilityEventSink: implementation,
      },
      required: [AdapterTokens.AuditEventSink, AdapterTokens.SecurityEventSink, AdapterTokens.ProtocolEventSink],
    }).bootstrap();
    const {
      auditEventSink: auditSink,
      securityEventSink: securitySink,
      protocolEventSink: protocolSink,
    } = resolveEventSinkRuntimeAdapters(adapters);
    const event: AuditEventEnvelope = {
      eventId: 'audit:1', eventType: 'verification.completed', emittedAt: '2026-06-06T00:00:00.000Z', payload: { result: 'verified' },
    };
    auditSink.recordAuditEvent(event);
    securitySink.recordSecurityEvent({ eventId: 'security:1', eventType: 'key.checked', occurredAt: event.emittedAt, payload: {} });
    protocolSink.emitProtocolEvent({ eventId: 'protocol:1', eventType: 'claim.checked', emittedAt: event.emittedAt, payload: {} });

    expect(implementation.listObservations()).toHaveLength(3);
    expect(implementation.listObservations()[0]).toEqual(event);
  });
});
