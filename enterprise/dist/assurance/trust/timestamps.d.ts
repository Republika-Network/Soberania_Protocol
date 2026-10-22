/**
 * Parses an RFC 3339 timestamp with an explicit zone (`Z` or `±HH:MM`) into
 * epoch milliseconds. Returns `undefined` for anything else: a non-string, a
 * date without a time or zone (whose meaning depends on the host's local
 * zone), an out-of-range component, or any other format `Date.parse` would
 * leniently accept. Sub-millisecond digits are truncated.
 */
export declare function parseTrustTimestamp(value: unknown): number | undefined;
/** Like `parseTrustTimestamp`, but throws with `label` in the message. */
export declare function requireTrustTimestamp(value: unknown, label: string): number;
/** A clock returning epoch milliseconds. */
export type TrustClock = () => number;
export declare const systemTrustClock: TrustClock;
//# sourceMappingURL=timestamps.d.ts.map