import { canonicalizeJSON } from './canonicalize';

/**
 * Single-read capture of caller-supplied values (SOBE-SEC-01.1, SOBE-SEC-01.2).
 *
 * Internal to `@aoc/protocol`: deliberately not re-exported from
 * `./index`, so it adds nothing to the public `@aoc/protocol/canonical`
 * surface. Verification and evidence construction capture untrusted input
 * here exactly once and work only from the immutable result, so an object
 * whose getters or proxy traps answer differently on each read cannot show one
 * value to a check and another to whatever is built after it.
 */

/**
 * Reads one property of a caller-supplied object exactly once. A getter or
 * proxy trap that throws reads as `undefined`, which every caller treats as
 * absent (fail closed).
 */
export function readOnce(container: unknown, key: string): unknown {
  if (typeof container !== 'object' || container === null) {
    return undefined;
  }
  try {
    return (container as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

/** `Object.prototype.hasOwnProperty`, reading a throwing proxy trap as absent. */
export function hasOwnOnce(container: unknown, key: string): boolean {
  if (typeof container !== 'object' || container === null) {
    return false;
  }
  try {
    return Object.prototype.hasOwnProperty.call(container, key);
  } catch {
    return false;
  }
}

/**
 * Canonicalizes a caller-supplied value exactly once and rebuilds a plain,
 * deep-frozen value from those canonical bytes. Every later check examines this
 * one snapshot, never the caller's object, so the bytes that are hashed and
 * signed are the bytes that are inspected, however the caller's object behaves
 * on repeated reads. The rebuild parses the canonical serialization; it is the
 * source of the values that are then validated explicitly, not a replacement
 * for that validation. Canonicalizing the rebuilt value reproduces `canonical`
 * exactly. `undefined` when the value cannot be canonicalized (fail closed).
 */
export function canonicalSnapshot(value: unknown): { readonly canonical: string; readonly value: unknown } | undefined {
  let canonical: string;
  let rebuilt: unknown;
  // Both steps sit inside the guard: a few values the canonicalizer accepts
  // (an array with holes, for one) serialize to text that is not JSON, and
  // those fail closed here like any other uncanonicalizable value.
  try {
    canonical = canonicalizeJSON(value);
    rebuilt = JSON.parse(canonical);
  } catch {
    return undefined;
  }
  return Object.freeze({ canonical, value: deepFreeze(rebuilt) });
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}
