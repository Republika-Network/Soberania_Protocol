import { snapshotGovernanceSignature, verifyPayloadSignature, signPayload } from '../crypto';
import type { GovernanceSignature, RuntimeAuthorityIdentity, TrustedKeyResolver } from '../crypto';

/**
 * Content ownership for a vault's trust domain.
 *
 * A pack's subject proof (pack/signing.ts) proves who submitted a registration.
 * It never establishes ownership of the content the pack lists: that binding
 * (content id → owner DID, within one trust domain) comes only from records an
 * independently authenticated custodial or ingestion system provisioned through
 * this contract. The vault asks the authority before it stores a pack and again
 * before it releases a field; unknown, conflicting or unavailable answers deny.
 *
 * There is no first-writer-wins: a subject that submits a pack for content the
 * authority does not attribute to it is refused, whoever came first.
 */

const HASH_HEX_PATTERN = /^[a-f0-9]{64}$/;
const DID_PATTERN = /^did:[a-z0-9]+:[a-zA-Z0-9._%-]+$/;

export type ContentOwnerRecord = {
  content_id: string;
  owner: string;
  trust_domain: string;
  /** issued_at of the custodial assertion that produced this record. */
  provisioned_at: string;
  /** issuerId of the custodian key that signed the assertion. */
  custodian_id: string;
  /** 1 on provisioning, +1 per transfer; the store's compare-and-set key. */
  version: number;
};

export type ContentOwnershipLookup =
  | { status: 'owned'; record: ContentOwnerRecord }
  | { status: 'unknown' }
  | { status: 'unavailable'; reason: string };

/** Read side, used by the vault. Answers for exactly one trust domain. */
export interface ContentOwnershipAuthority {
  readonly trustDomain: string;
  lookup(content_id: string): ContentOwnershipLookup;
}

export type ContentOwnershipOperation = 'provision' | 'transfer';

/** What a custodian asserts; it is signed as a whole. */
export type ContentOwnershipAssertion = {
  kind: 'aoc.content.ownership/v1';
  operation: ContentOwnershipOperation;
  trust_domain: string;
  content_id: string;
  /** The owner after this assertion. */
  owner: string;
  /** For a transfer, the owner being replaced; null for provisioning. */
  previous_owner: string | null;
  issued_at: string;
};

export type SignedContentOwnershipAssertion = {
  assertion: ContentOwnershipAssertion;
  custodian_signature: GovernanceSignature;
};

/**
 * Write side: administrative provisioning, separate from pack submission. Only
 * assertions signed by a configured custodian key are applied. Ownership is
 * never reassigned implicitly: a transfer names the owner it replaces and is
 * applied only if that is still the current owner.
 */
export interface ContentOwnershipProvisioning {
  apply(signed: SignedContentOwnershipAssertion): ContentOwnerRecord;
}

/**
 * The persistent backing store a real deployment provides. It must be the single
 * source of truth for its trust domain, durable, and consistent: `compareAndSet`
 * must be atomic against concurrent writers, and `get` must throw (not return
 * undefined) when it cannot answer, so the vault fails closed. The in-memory
 * implementation below is for tests and single-process development only.
 */
export interface ContentOwnershipStore {
  get(trust_domain: string, content_id: string): ContentOwnerRecord | undefined;
  /** Writes `record` only if the stored version is `expectedVersion` (0 when absent). */
  compareAndSet(record: ContentOwnerRecord, expectedVersion: number): boolean;
}

export type ContentOwnershipErrorCode =
  | 'OWNERSHIP_ASSERTION_UNTRUSTED'
  | 'OWNERSHIP_ASSERTION_MALFORMED'
  | 'OWNERSHIP_DOMAIN_MISMATCH'
  | 'OWNERSHIP_ALREADY_PROVISIONED'
  | 'OWNERSHIP_TRANSFER_MISMATCH'
  | 'OWNERSHIP_STORE_CONFLICT'
  | 'OWNERSHIP_STORE_UNAVAILABLE';

export class ContentOwnershipError extends Error {
  readonly code: ContentOwnershipErrorCode;

  constructor(code: ContentOwnershipErrorCode, message: string) {
    super(message);
    this.name = 'ContentOwnershipError';
    this.code = code;
  }
}

export class InMemoryContentOwnershipStore implements ContentOwnershipStore {
  private readonly records = new Map<string, ContentOwnerRecord>();

  get(trust_domain: string, content_id: string): ContentOwnerRecord | undefined {
    const record = this.records.get(`${trust_domain}\u0000${content_id}`);
    return record ? { ...record } : undefined;
  }

  compareAndSet(record: ContentOwnerRecord, expectedVersion: number): boolean {
    const key = `${record.trust_domain}\u0000${record.content_id}`;
    const current = this.records.get(key);
    if ((current?.version ?? 0) !== expectedVersion) return false;
    this.records.set(key, { ...record });
    return true;
  }
}

function isAssertionShape(value: unknown): value is ContentOwnershipAssertion {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const a = value as Record<string, unknown>;
  return (
    a.kind === 'aoc.content.ownership/v1' &&
    (a.operation === 'provision' || a.operation === 'transfer') &&
    typeof a.trust_domain === 'string' && a.trust_domain.trim() !== '' &&
    typeof a.content_id === 'string' && HASH_HEX_PATTERN.test(a.content_id) &&
    typeof a.owner === 'string' && DID_PATTERN.test(a.owner) &&
    (a.previous_owner === null || (typeof a.previous_owner === 'string' && DID_PATTERN.test(a.previous_owner))) &&
    typeof a.issued_at === 'string' && Number.isFinite(Date.parse(a.issued_at))
  );
}

export type CustodialContentOwnershipAuthorityOptions = {
  trustDomain: string;
  /** Keys of the custodial / ingestion systems allowed to assert ownership in this domain. */
  custodianKeys: TrustedKeyResolver;
  /** issuerIds (from the trusted keys) that may provision and transfer. */
  custodianIds: readonly string[];
  store: ContentOwnershipStore;
};

/**
 * Ownership authority for one trust domain backed by a store. Reads never
 * guess: a store failure is `unavailable`, an absent record is `unknown`.
 * Writes apply only custodian-signed assertions, in order, with
 * compare-and-set against the stored version.
 */
export class CustodialContentOwnershipAuthority implements ContentOwnershipAuthority, ContentOwnershipProvisioning {
  readonly trustDomain: string;
  private readonly custodianKeys: TrustedKeyResolver;
  private readonly custodianIds: ReadonlySet<string>;
  private readonly store: ContentOwnershipStore;

  constructor(options: CustodialContentOwnershipAuthorityOptions) {
    if (typeof options?.trustDomain !== 'string' || options.trustDomain.trim() === '') {
      throw new Error('A content ownership authority must name its trust domain.');
    }
    if (typeof options.custodianKeys?.resolveTrustedKey !== 'function') {
      throw new Error('A content ownership authority requires custodian keys.');
    }
    if (!Array.isArray(options.custodianIds) || options.custodianIds.length === 0) {
      throw new Error('A content ownership authority requires at least one custodian id.');
    }
    if (typeof options.store?.get !== 'function' || typeof options.store?.compareAndSet !== 'function') {
      throw new Error('A content ownership authority requires a backing store.');
    }
    this.trustDomain = options.trustDomain;
    this.custodianKeys = options.custodianKeys;
    this.custodianIds = new Set(options.custodianIds);
    this.store = options.store;
  }

  lookup(content_id: string): ContentOwnershipLookup {
    let record: ContentOwnerRecord | undefined;
    try {
      record = this.store.get(this.trustDomain, content_id);
    } catch (error) {
      return { status: 'unavailable', reason: `Ownership store failed: ${(error as Error).message}` };
    }
    if (record === undefined) return { status: 'unknown' };
    if (
      typeof record !== 'object' ||
      record.trust_domain !== this.trustDomain ||
      record.content_id !== content_id ||
      typeof record.owner !== 'string' ||
      !DID_PATTERN.test(record.owner)
    ) {
      return { status: 'unavailable', reason: 'Ownership store returned a record that does not belong to this domain or content.' };
    }
    return { status: 'owned', record: { ...record } };
  }

  apply(signed: SignedContentOwnershipAssertion): ContentOwnerRecord {
    // Read the envelope once; verify before any field of the assertion is trusted.
    const envelope = snapshotGovernanceSignature(signed?.custodian_signature);
    if (!envelope) {
      throw new ContentOwnershipError('OWNERSHIP_ASSERTION_UNTRUSTED', 'Ownership assertion carries no custodian signature.');
    }
    if (!this.custodianIds.has(envelope.signer.issuerId)) {
      throw new ContentOwnershipError('OWNERSHIP_ASSERTION_UNTRUSTED', `Signer ${envelope.signer.issuerId} is not a custodian of this domain.`);
    }
    const assertion = JSON.parse(JSON.stringify(signed.assertion ?? null)) as unknown;
    if (!isAssertionShape(assertion)) {
      throw new ContentOwnershipError('OWNERSHIP_ASSERTION_MALFORMED', 'Ownership assertion is malformed.');
    }
    if (!verifyPayloadSignature(assertion, envelope, this.custodianKeys)) {
      throw new ContentOwnershipError('OWNERSHIP_ASSERTION_UNTRUSTED', 'Ownership assertion signature does not verify against the custodian keys.');
    }
    if (assertion.trust_domain !== this.trustDomain) {
      throw new ContentOwnershipError('OWNERSHIP_DOMAIN_MISMATCH', `Assertion is for domain ${assertion.trust_domain}, not ${this.trustDomain}.`);
    }

    let current: ContentOwnerRecord | undefined;
    try {
      current = this.store.get(this.trustDomain, assertion.content_id);
    } catch (error) {
      throw new ContentOwnershipError('OWNERSHIP_STORE_UNAVAILABLE', `Ownership store failed: ${(error as Error).message}`);
    }

    if (assertion.operation === 'provision') {
      if (assertion.previous_owner !== null) {
        throw new ContentOwnershipError('OWNERSHIP_ASSERTION_MALFORMED', 'Provisioning must not name a previous owner.');
      }
      if (current !== undefined) {
        throw new ContentOwnershipError('OWNERSHIP_ALREADY_PROVISIONED', `Content ${assertion.content_id} is already owned in this domain; use a transfer.`);
      }
    } else {
      if (assertion.previous_owner === null) {
        throw new ContentOwnershipError('OWNERSHIP_ASSERTION_MALFORMED', 'A transfer must name the owner it replaces.');
      }
      if (current === undefined || current.owner !== assertion.previous_owner) {
        throw new ContentOwnershipError('OWNERSHIP_TRANSFER_MISMATCH', `Content ${assertion.content_id} is not currently owned by ${assertion.previous_owner}.`);
      }
      if (assertion.owner === assertion.previous_owner) {
        throw new ContentOwnershipError('OWNERSHIP_ASSERTION_MALFORMED', 'A transfer must change the owner.');
      }
    }

    const record: ContentOwnerRecord = {
      content_id: assertion.content_id,
      owner: assertion.owner,
      trust_domain: this.trustDomain,
      provisioned_at: assertion.issued_at,
      custodian_id: envelope.signer.issuerId,
      version: (current?.version ?? 0) + 1,
    };
    let written: boolean;
    try {
      written = this.store.compareAndSet(record, current?.version ?? 0);
    } catch (error) {
      throw new ContentOwnershipError('OWNERSHIP_STORE_UNAVAILABLE', `Ownership store failed: ${(error as Error).message}`);
    }
    if (!written) {
      throw new ContentOwnershipError('OWNERSHIP_STORE_CONFLICT', `Content ${assertion.content_id} changed concurrently; the assertion was not applied.`);
    }
    return { ...record };
  }
}

/** Signs an ownership assertion with a custodian's key (ingestion/custodial systems, tests). */
export function signContentOwnershipAssertion(
  assertion: ContentOwnershipAssertion,
  custodian: { privateKey: string; identity: RuntimeAuthorityIdentity },
  runtimeSource = 'content-ownership'
): SignedContentOwnershipAssertion {
  return {
    assertion,
    custodian_signature: signPayload(assertion, custodian.privateKey, custodian.identity, { runtimeSource, timestamp: assertion.issued_at }),
  };
}
