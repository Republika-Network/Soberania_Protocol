import { EnforcementRequestParseError } from './enforcement-errors';
import type { EnforcementRequest, EnforcementResource, NormalizedEnforcementRequest } from './enforcement-types';
import type { ScopeEntry } from '../consent/consent-types';

const VALID_SCOPE_TYPES = new Set<ScopeEntry['type']>(['field', 'content', 'pack']);

function asRecord(input: unknown): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new EnforcementRequestParseError('Enforcement request must be a non-null JSON object.');
  }

  return input as Record<string, unknown>;
}

function parseNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new EnforcementRequestParseError(`Enforcement field "${field}" must be a non-empty string.`);
  }

  return value.trim();
}

function parseScopeEntry(input: unknown, index: number): ScopeEntry {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new EnforcementRequestParseError(`Enforcement scope entry ${index} must be a JSON object.`);
  }

  const record = input as Record<string, unknown>;
  const type = parseNonEmptyString(record.type, `requested_scope[${index}].type`);
  const ref = parseNonEmptyString(record.ref, `requested_scope[${index}].ref`).toLowerCase();

  if (!VALID_SCOPE_TYPES.has(type as ScopeEntry['type'])) {
    throw new EnforcementRequestParseError(`Enforcement scope entry ${index} has invalid type.`);
  }

  return {
    type: type as ScopeEntry['type'],
    ref,
  };
}

function parseRequestedScope(value: unknown): ScopeEntry[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new EnforcementRequestParseError('Enforcement field "requested_scope" must be a non-empty array.');
  }

  return value.map((entry, index) => parseScopeEntry(entry, index));
}

function parseRequestedPermissions(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new EnforcementRequestParseError('Enforcement field "requested_permissions" must be a non-empty array.');
  }

  return value.map((permission, index) => {
    if (typeof permission !== 'string' || permission.trim() === '') {
      throw new EnforcementRequestParseError(`Enforcement permission ${index} must be a non-empty string.`);
    }

    return permission.trim().toLowerCase();
  });
}

function parseOptionalBinding(record: Record<string, unknown>, field: 'subject' | 'grantee' | 'marketMakerId'): string | undefined {
  if (!(field in record) || record[field] === undefined) {
    return undefined;
  }

  return parseNonEmptyString(record[field], field);
}

function parseResource(value: unknown): EnforcementResource | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new EnforcementRequestParseError('Enforcement field "resource" must be an object or null when provided.');
  }

  const record = value as Record<string, unknown>;
  const type = parseNonEmptyString(record.type, 'resource.type');
  if (!VALID_SCOPE_TYPES.has(type as ScopeEntry['type'])) {
    throw new EnforcementRequestParseError('Enforcement resource.type is invalid.');
  }

  return {
    type: type as EnforcementResource['type'],
    ref: parseNonEmptyString(record.ref, 'resource.ref').toLowerCase(),
  };
}

function parseNow(value: unknown): Date | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new EnforcementRequestParseError('Enforcement field "now" must be a valid Date when provided.');
  }

  return value;
}

function parseActionContext(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new EnforcementRequestParseError('Enforcement field "action_context" must be a JSON object when provided.');
  }

  return value as Record<string, unknown>;
}

export function parseEnforcementRequest(input: unknown): EnforcementRequest {
  const record = asRecord(input);

  if (!('capability' in record)) {
    throw new EnforcementRequestParseError('Enforcement field "capability" is required.');
  }

  if (!('consent' in record) || record.consent === undefined || record.consent === null) {
    throw new EnforcementRequestParseError('Enforcement field "consent" is required.');
  }

  return {
    capability: record.capability,
    consent: record.consent,
    requested_scope: parseRequestedScope(record.requested_scope),
    requested_permissions: parseRequestedPermissions(record.requested_permissions),
    subject: parseOptionalBinding(record, 'subject'),
    grantee: parseOptionalBinding(record, 'grantee'),
    marketMakerId: parseOptionalBinding(record, 'marketMakerId'),
    resource: parseResource(record.resource),
    action_context: parseActionContext(record.action_context),
    now: parseNow(record.now),
  };
}

function dedupeScope(scope: ScopeEntry[]): ScopeEntry[] {
  const deduped = new Map<string, ScopeEntry>();
  for (const entry of scope) {
    deduped.set(`${entry.type}:${entry.ref}`, entry);
  }

  return [...deduped.values()].sort((a, b) => {
    const typeCmp = a.type.localeCompare(b.type);
    if (typeCmp !== 0) {
      return typeCmp;
    }

    return a.ref.localeCompare(b.ref);
  });
}

export function normalizeEnforcementRequest(input: EnforcementRequest): NormalizedEnforcementRequest {
  return {
    ...input,
    requested_scope: dedupeScope(input.requested_scope),
    requested_permissions: [...new Set(input.requested_permissions.map((permission) => permission.trim().toLowerCase()))].sort(),
  };
}
