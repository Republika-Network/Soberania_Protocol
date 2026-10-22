"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.systemTrustClock = void 0;
exports.parseTrustTimestamp = parseTrustTimestamp;
exports.requireTrustTimestamp = requireTrustTimestamp;
const RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/;
const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();
/**
 * Parses an RFC 3339 timestamp with an explicit zone (`Z` or `±HH:MM`) into
 * epoch milliseconds. Returns `undefined` for anything else: a non-string, a
 * date without a time or zone (whose meaning depends on the host's local
 * zone), an out-of-range component, or any other format `Date.parse` would
 * leniently accept. Sub-millisecond digits are truncated.
 */
function parseTrustTimestamp(value) {
    if (typeof value !== "string")
        return undefined;
    const match = RFC3339.exec(value);
    if (!match)
        return undefined;
    const [, y, mo, d, h, mi, s, fraction, zone] = match;
    const year = Number(y);
    const month = Number(mo);
    const day = Number(d);
    const hour = Number(h);
    const minute = Number(mi);
    const second = Number(s);
    if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month))
        return undefined;
    if (hour > 23 || minute > 59 || second > 59)
        return undefined;
    let offsetMinutes = 0;
    if (zone !== "Z") {
        const offsetHours = Number(zone.slice(1, 3));
        const offsetMins = Number(zone.slice(4, 6));
        if (offsetHours > 23 || offsetMins > 59)
            return undefined;
        offsetMinutes = (zone[0] === "-" ? -1 : 1) * (offsetHours * 60 + offsetMins);
    }
    const milliseconds = fraction === undefined ? 0 : Number(fraction.slice(0, 3).padEnd(3, "0"));
    const utc = new Date(0);
    utc.setUTCFullYear(year, month - 1, day);
    utc.setUTCHours(hour, minute, second, milliseconds);
    const result = utc.getTime() - offsetMinutes * 60000;
    return Number.isFinite(result) ? result : undefined;
}
/** Like `parseTrustTimestamp`, but throws with `label` in the message. */
function requireTrustTimestamp(value, label) {
    const parsed = parseTrustTimestamp(value);
    if (parsed === undefined)
        throw new Error(`${label} must be an RFC 3339 timestamp with an explicit zone.`);
    return parsed;
}
const systemTrustClock = () => Date.now();
exports.systemTrustClock = systemTrustClock;
