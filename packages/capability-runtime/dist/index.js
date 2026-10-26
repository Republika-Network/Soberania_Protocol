"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CapabilityRuntime = void 0;
exports.canonicalNamespacePath = canonicalNamespacePath;
/**
 * A namespace path is canonical when it is absolute, has no empty segments (so no
 * "//" and no trailing slash except the root) and no "." or ".." segments.
 * Returns undefined for anything else.
 */
function canonicalNamespacePath(path) {
    if (typeof path !== "string" || !path.startsWith("/"))
        return undefined;
    if (path === "/")
        return path;
    const segments = path.slice(1).split("/");
    if (segments.some((segment) => segment === "" || segment === "." || segment === ".." || /[\\\u0000]/.test(segment)))
        return undefined;
    return path;
}
const ISO_8601_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
/**
 * Reads a timestamp that must be an ISO-8601 date-time string and returns its instant in
 * epoch milliseconds. A `Date` object, an epoch number, another string format or an
 * unparseable date is unusable and yields `undefined`.
 */
function parseIsoTimestamp(value) {
    if (typeof value !== "string" || !ISO_8601_DATE_TIME.test(value))
        return undefined;
    const instant = Date.parse(value);
    return Number.isFinite(instant) ? instant : undefined;
}
/**
 * True when the capability carries an `expiresAt` that has passed at `now`, or one that is
 * present but not an ISO-8601 string: an unreadable expiry counts as expired, never as "live".
 */
function isExpiredAt(capability, now) {
    const raw = capability.expiresAt;
    if (raw === undefined || raw === null)
        return false;
    const expiresAt = parseIsoTimestamp(raw);
    return expiresAt === undefined || expiresAt <= now;
}
class CapabilityRuntime {
    constructor(provider) {
        this.provider = provider;
    }
    namespacePathIncludes(input, scope) {
        if (input.organizationId !== scope.organizationId)
            return false;
        // Only canonical paths take part: anything with dot segments, empty segments or
        // a missing leading slash is ambiguous and matches nothing, so "/a/../b" can
        // never read as inside "/a". Containment is by whole path segment: "/a" covers
        // "/a" and "/a/b", never "/ab".
        const base = canonicalNamespacePath(scope.path.endsWith("/") && scope.path !== "/" ? scope.path.slice(0, -1) : scope.path);
        const requested = canonicalNamespacePath(input.path);
        if (base === undefined || requested === undefined)
            return false;
        if (base === "/")
            return true;
        return requested === base || requested.startsWith(`${base}/`);
    }
    async evaluate(input) {
        // The evaluation time must be an ISO-8601 string; anything else denies rather than
        // silently reading as "now".
        const now = parseIsoTimestamp(input.now ?? new Date().toISOString());
        if (now === undefined)
            return { allowed: false, reason: "denied", reasons: ["Evaluation time is not an ISO-8601 timestamp."] };
        const capabilities = await this.provider.resolve(input.actor, input.namespace);
        const matched = capabilities.find((c) => {
            if (isExpiredAt(c, now))
                return false;
            return c.action === input.action && c.resource === input.resource && this.namespacePathIncludes(input.namespace, c.scope);
        });
        if (!matched) {
            const existsButExpired = capabilities.some((c) => c.action === input.action &&
                c.resource === input.resource &&
                this.namespacePathIncludes(input.namespace, c.scope) &&
                isExpiredAt(c, now));
            if (existsButExpired) {
                return {
                    allowed: false,
                    reason: "expired_capability",
                    reasons: ["Matching capability exists but is expired at evaluation time."]
                };
            }
            return { allowed: false, reason: "missing_capability", reasons: ["No matching capability grant."] };
        }
        return {
            allowed: true,
            matchedCapability: matched,
            reason: "allowed",
            inheritedFromNamespace: matched.scope.path !== input.namespace.path ? matched.scope.path : undefined,
            reasons: ["Capability grant matched action/resource and namespace restrictions."]
        };
    }
}
exports.CapabilityRuntime = CapabilityRuntime;
