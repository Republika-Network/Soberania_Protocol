import { createRuntimeAuthority, createTrustedKeySet } from '../../crypto';
import {
  CustodialContentOwnershipAuthority,
  InMemoryContentOwnershipStore,
  signContentOwnershipAssertion,
  type ContentOwnershipAssertion,
  type ContentOwnershipStore,
} from '../../vault/contentOwnership';

export const TEST_TRUST_DOMAIN = 'tenant:test';

/** A deterministic custodian (ingestion system) for one test file. */
export function testCustodian(label = 'custodian') {
  return createRuntimeAuthority(`runtime:${label}`, `custodian:${label}`, `authority:${label}`);
}

/**
 * An ownership authority for the test trust domain with the given content ids
 * provisioned to their owners by the test custodian. Returns the authority, the
 * custodian (to sign further assertions) and the store.
 */
export function testContentOwnership(
  owners: Record<string, string>,
  options: { trustDomain?: string; store?: ContentOwnershipStore; custodian?: ReturnType<typeof testCustodian> } = {}
) {
  const custodian = options.custodian ?? testCustodian();
  const trustDomain = options.trustDomain ?? TEST_TRUST_DOMAIN;
  const store = options.store ?? new InMemoryContentOwnershipStore();
  const authority = new CustodialContentOwnershipAuthority({
    trustDomain,
    custodianKeys: createTrustedKeySet([custodian.identity]),
    custodianIds: [custodian.identity.issuerId],
    store,
  });
  const assert = (assertion: Omit<ContentOwnershipAssertion, 'kind' | 'trust_domain' | 'issued_at'> & { issued_at?: string }) =>
    authority.apply(
      signContentOwnershipAssertion(
        { kind: 'aoc.content.ownership/v1', trust_domain: trustDomain, issued_at: '2025-06-01T00:00:00Z', ...assertion },
        custodian
      )
    );
  for (const [content_id, owner] of Object.entries(owners)) {
    assert({ operation: 'provision', content_id, owner, previous_owner: null });
  }
  return { authority, custodian, store, trustDomain, assert };
}
