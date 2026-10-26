export type ApiTier = 'free' | 'pro';

export type ApiKeyRole = 'admin';

export type ApiKeyRecord = {
  apiKey: string;
  owner: string;
  tier: ApiTier;
  /**
   * Principals (subjects, requesters, consumers, grantees) this key may act
   * for. Requests naming any other principal are rejected.
   */
  principals?: readonly string[];
  /** Roles granted by the operator. `admin` may act for any principal. */
  roles?: readonly ApiKeyRole[];
};

/** The authenticated caller of a hosted runtime request, taken from its API key record. */
export type RuntimeCaller = {
  owner: string;
  principals: readonly string[];
  roles: readonly ApiKeyRole[];
};

export function toRuntimeCaller(record: ApiKeyRecord): RuntimeCaller {
  return {
    owner: record.owner,
    principals: [...(record.principals ?? [])],
    roles: [...(record.roles ?? [])],
  };
}

export function canActFor(caller: RuntimeCaller | undefined, principalId: unknown): boolean {
  if (caller === undefined) return false;
  if (caller.roles.includes('admin')) return true;
  return typeof principalId === 'string' && principalId !== '' && caller.principals.includes(principalId);
}

export class InMemoryApiKeyStore {
  private readonly keys = new Map<string, ApiKeyRecord>();

  constructor(seed: ApiKeyRecord[] = []) {
    seed.forEach((entry) => this.keys.set(entry.apiKey, entry));
  }

  get(apiKey: string): ApiKeyRecord | undefined {
    return this.keys.get(apiKey);
  }

  add(record: ApiKeyRecord): void {
    this.keys.set(record.apiKey, record);
  }
}
