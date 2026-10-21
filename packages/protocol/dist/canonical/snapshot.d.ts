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
export declare function readOnce(container: unknown, key: string): unknown;
/** `Object.prototype.hasOwnProperty`, reading a throwing proxy trap as absent. */
export declare function hasOwnOnce(container: unknown, key: string): boolean;
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
export declare function canonicalSnapshot(value: unknown): {
    readonly canonical: string;
    readonly value: unknown;
} | undefined;
//# sourceMappingURL=snapshot.d.ts.map