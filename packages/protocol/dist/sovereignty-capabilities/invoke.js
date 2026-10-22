"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invokeSovereigntyCapability = invokeSovereigntyCapability;
const snapshot_1 = require("../canonical/snapshot");
const identity_1 = require("../identity");
const capability_ref_1 = require("./capability-ref");
const evidence_1 = require("./evidence");
const registry_1 = require("./registry");
const implementation_1 = require("./implementation");
const invocation_1 = require("./invocation");
const invocation_error_1 = require("./invocation-error");
const result_1 = require("./result");
const time_1 = require("./time");
/**
 * Stable reason codes this layer contributes itself. Capability-specific
 * reason codes come from the implementation and are never rewritten.
 */
const REASON_CAPABILITY_NOT_CANONICAL = 'SOVEREIGNTY_CAPABILITY_NOT_CANONICAL';
const REASON_INVALID_IMPLEMENTATION_REF = 'INVALID_IMPLEMENTATION_CAPABILITY_REF';
const REASON_CAPABILITY_ID_MISMATCH = 'CAPABILITY_ID_MISMATCH';
const REASON_CAPABILITY_VERSION_MISMATCH = 'CAPABILITY_VERSION_MISMATCH';
const REASON_IMPLEMENTATION_ERROR = 'SOVEREIGNTY_CAPABILITY_IMPLEMENTATION_ERROR';
const REASON_INVALID_OUTCOME = 'SOVEREIGNTY_CAPABILITY_INVALID_OUTCOME';
const REASON_EVIDENCE_DELIVERY_FAILED = 'SOVEREIGNTY_CAPABILITY_EVIDENCE_DELIVERY_FAILED';
/**
 * Rebuilds a subject as a frozen, structurally independent copy, so evidence
 * cannot be mutated later through the caller's object and cannot carry extra
 * non-canonicalizable properties the caller happened to hang off it.
 */
function toEvidenceSubject(subject) {
    const narrowed = (0, identity_1.toSovereignSubjectRef)(subject);
    return Object.freeze({
        sovereignAssetId: narrowed.sovereignAssetId,
        ...(narrowed.externalReference === undefined
            ? {}
            : { externalReference: Object.freeze((0, identity_1.buildSovereignExternalReference)(narrowed.externalReference)) }),
    });
}
function toEvidenceCapabilityRef(capability) {
    return Object.freeze({ id: capability.id, version: capability.version });
}
function buildInvocationEvidence(invocation, completedAt, outcome, subject, reasonCodes, evidenceRefs) {
    return Object.freeze({
        schemaVersion: evidence_1.SOVEREIGNTY_CAPABILITY_INVOCATION_EVIDENCE_SCHEMA_VERSION,
        invocationId: invocation.invocationId,
        capability: toEvidenceCapabilityRef(invocation.capability),
        requestedAt: invocation.requestedAt,
        completedAt,
        outcome,
        // Absent optionals are omitted structurally: `aoc-canonical-json/1`
        // refuses `undefined` outright, so an evidence record carrying one could
        // not be canonicalized, hashed or signed.
        ...(invocation.correlationId === undefined ? {} : { correlationId: invocation.correlationId }),
        ...(subject === undefined ? {} : { subject: toEvidenceSubject(subject) }),
        ...(reasonCodes === undefined ? {} : { reasonCodes: Object.freeze([...reasonCodes]) }),
        ...(evidenceRefs === undefined || evidenceRefs.length === 0
            ? {}
            : { evidenceRefs: Object.freeze([...evidenceRefs]) }),
    });
}
/**
 * Captures the caller's invocation envelope exactly once (SOBE-SEC-01.2).
 *
 * The envelope is validated, handed to the implementation and turned into
 * evidence; were each of those to read the caller's object afresh, a getter or
 * proxy could show a validated subject to the implementation and a different
 * one to the evidence. So every field is read once into a frozen copy, and
 * nothing after this reads the caller's object. The subject is rebuilt from its
 * canonical bytes and the capability ref from its two fields; `input` is
 * carried by reference, because what it means is the implementation's business
 * and the implementation captures it itself. Presence is preserved, so an
 * ordinary envelope validates exactly as before; a subject that cannot be
 * canonicalized becomes `null`, and an envelope that cannot be read at all
 * becomes `null`, both of which preflight rejects.
 */
function captureInvocation(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return value;
    }
    // The outcome is assigned rather than returned from the `catch`, so an
    // unreadable envelope is an explicit negative result that preflight rejects.
    const envelope = {};
    let readable = true;
    try {
        for (const key of ['schemaVersion', 'invocationId', 'requestedAt', 'correlationId']) {
            const field = (0, snapshot_1.readOnce)(value, key);
            if (field !== undefined || (0, snapshot_1.hasOwnOnce)(value, key))
                envelope[key] = field;
        }
        const capability = (0, snapshot_1.readOnce)(value, 'capability');
        envelope.capability =
            typeof capability === 'object' && capability !== null && !Array.isArray(capability)
                ? Object.freeze({ id: (0, snapshot_1.readOnce)(capability, 'id'), version: (0, snapshot_1.readOnce)(capability, 'version') })
                : capability;
        const subject = (0, snapshot_1.readOnce)(value, 'subject');
        if (subject !== undefined) {
            envelope.subject = (0, snapshot_1.canonicalSnapshot)(subject)?.value ?? null;
        }
        else if ((0, snapshot_1.hasOwnOnce)(value, 'subject')) {
            envelope.subject = undefined;
        }
        if ((0, snapshot_1.hasOwnOnce)(value, 'input')) {
            envelope.input = (0, snapshot_1.readOnce)(value, 'input');
        }
    }
    catch {
        readable = false;
    }
    return readable ? Object.freeze(envelope) : null;
}
/**
 * Delivers evidence to an explicitly configured sink exactly once.
 *
 * Returns `undefined` on success, or the sink's failure. There is no retry:
 * a second delivery attempt cannot be distinguished by the sink from a
 * genuine second invocation, and re-running the implementation to "recover"
 * would duplicate whatever side effects it already had.
 */
async function deliverEvidence(sink, evidence) {
    if (sink === undefined)
        return undefined;
    try {
        await sink.recordAuditEvent((0, evidence_1.toSovereigntyCapabilityInvocationAuditEvent)(evidence));
        return undefined;
    }
    catch (error) {
        return error ?? new Error(REASON_EVIDENCE_DELIVERY_FAILED);
    }
}
/**
 * Validates everything knowable before execution, accumulating every reason
 * rather than reporting only the first, and returns the full list.
 *
 * Order matters: nothing about the implementation is called — not even its
 * `capability` getter's side effects, were it to have any — until the
 * envelope itself is coherent. Executing first and validating afterwards
 * would produce evidence attributing work to a capability that was never the
 * one requested.
 */
function preflightReasons(invocation, implementationCapability) {
    const reasons = [...(0, invocation_1.validateSovereigntyCapabilityInvocation)(invocation).reasons];
    // Read through optional chaining rather than assuming a well-formed
    // invocation: this is a public entry point, and a JavaScript consumer can
    // reach it with `null`. A malformed call must be reported as a rejection,
    // not as a TypeError thrown from inside validation.
    const requested = invocation?.capability;
    // A structurally valid ref is canonical by construction; this reports the
    // unknown-capability case with a code that names the actual problem, for
    // `AOC.REVOCATION`, `my-company.special-capability` and any other id that
    // is not one of the canonical eight.
    if (requested === null || typeof requested !== 'object' || (0, registry_1.getSovereigntyCapability)(requested.id) === undefined) {
        reasons.push(REASON_CAPABILITY_NOT_CANONICAL);
    }
    if (!(0, capability_ref_1.isValidSovereigntyCapabilityRef)(implementationCapability)) {
        reasons.push(REASON_INVALID_IMPLEMENTATION_REF);
        return reasons;
    }
    if ((0, capability_ref_1.isValidSovereigntyCapabilityRef)(requested)) {
        if (requested.id !== implementationCapability.id) {
            reasons.push(REASON_CAPABILITY_ID_MISMATCH);
        }
        else if (!(0, capability_ref_1.sovereigntyCapabilityRefsEqual)(requested, implementationCapability)) {
            // Same capability, different semantic version. Never silently upgraded,
            // downgraded or resolved to "latest": capability execution is explicit.
            reasons.push(REASON_CAPABILITY_VERSION_MISMATCH);
        }
    }
    return reasons;
}
/**
 * invokeSovereigntyCapability — the common socket every canonical
 * Sovereignty Capability implementation plugs into.
 *
 * It knows *which* mineral, *which* version, *which* invocation and *what
 * outcome*, and deliberately nothing about what the mineral means. It makes
 * no governance decision: no policy is evaluated, no grant is issued or
 * checked, no access is authorized, no credential is brokered, nothing is
 * enforced, priced, metered or rate-limited. Those are AOC Enterprise
 * concerns and are absent by construction, not by convention.
 *
 * Implementations are passed in explicitly. There is no global mutable
 * implementation registry, because SM-01 deliberately made the canonical
 * mineral inventory read-only and a registration API here would undo that
 * from the other end.
 *
 * ## Three outcomes, three shapes
 *
 * 1. **Accepted and completed** — a `SovereigntyCapabilityResult`, either
 *    `succeeded` or `failed`, always carrying portable evidence. An expected
 *    capability failure is this, not an exception.
 * 2. **Rejected before execution** — throws with code
 *    `SOVEREIGNTY_CAPABILITY_INVOCATION_REJECTED` and no evidence. The
 *    invocation was never accepted, so claiming evidence that it "occurred"
 *    would be false, and the implementation is never called.
 * 3. **Implementation fault or evidence-delivery failure** — throws with
 *    code `SOVEREIGNTY_CAPABILITY_IMPLEMENTATION_ERROR` or
 *    `SOVEREIGNTY_CAPABILITY_EVIDENCE_DELIVERY_FAILED`, carrying the
 *    sanitized evidence that was built. A thrown implementation is a bug,
 *    not a capability result, and is never quietly converted into one.
 *
 * The implementation is invoked at most once in every path.
 */
async function invokeSovereigntyCapability(invocation, implementation, options = {}) {
    const clock = options.clock ?? time_1.systemSovereigntyCapabilityClock;
    // From here on only the capture is read: preflight, the implementation and
    // the evidence all see the same envelope.
    const envelope = captureInvocation(invocation);
    const rejectionReasons = preflightReasons(envelope, implementation?.capability);
    if (rejectionReasons.length > 0) {
        throw new invocation_error_1.SovereigntyCapabilityInvocationError(invocation_error_1.SOVEREIGNTY_CAPABILITY_INVOCATION_ERROR_CODES.rejected, {
            reasonCodes: rejectionReasons,
            ...(typeof envelope?.invocationId === 'string' ? { invocationId: envelope.invocationId } : {}),
            ...((0, capability_ref_1.isValidSovereigntyCapabilityRef)(envelope?.capability) ? { capability: envelope.capability } : {}),
        });
    }
    let outcome;
    try {
        outcome = await implementation.invoke(envelope);
    }
    catch (error) {
        throw await failWithImplementationFault(envelope, clock, options, REASON_IMPLEMENTATION_ERROR, error);
    }
    if (!(0, implementation_1.isValidSovereigntyCapabilityExecutionOutcome)(outcome)) {
        throw await failWithImplementationFault(envelope, clock, options, REASON_INVALID_OUTCOME, undefined);
    }
    const completedAt = (0, time_1.toUtcTimestamp)(clock());
    const subject = (0, result_1.resolveSovereigntyCapabilitySubject)(envelope, outcome);
    const evidence = buildInvocationEvidence(envelope, completedAt, outcome.status, subject, outcome.status === 'failed' ? outcome.reasonCodes : undefined, outcome.evidenceRefs);
    const deliveryFailure = await deliverEvidence(options.evidenceSink, evidence);
    if (deliveryFailure !== undefined) {
        // The capability already ran and may already have had side effects.
        // Surfacing the delivery failure — rather than returning a result that
        // silently implies durable evidence — is the only honest option, and the
        // implementation is emphatically not re-run.
        throw new invocation_error_1.SovereigntyCapabilityInvocationError(invocation_error_1.SOVEREIGNTY_CAPABILITY_INVOCATION_ERROR_CODES.evidenceDeliveryFailed, {
            reasonCodes: [REASON_EVIDENCE_DELIVERY_FAILED],
            invocationId: envelope.invocationId,
            capability: evidence.capability,
            evidenceDelivered: false,
        }, { cause: deliveryFailure, evidence });
    }
    const base = {
        schemaVersion: result_1.SOVEREIGNTY_CAPABILITY_RESULT_SCHEMA_VERSION,
        invocationId: envelope.invocationId,
        capability: evidence.capability,
        completedAt,
        ...(envelope.correlationId === undefined ? {} : { correlationId: envelope.correlationId }),
        ...(evidence.subject === undefined ? {} : { subject: evidence.subject }),
        evidence,
    };
    return Object.freeze(outcome.status === 'succeeded'
        ? { ...base, status: 'succeeded', output: outcome.output }
        : { ...base, status: 'failed', reasonCodes: evidence.reasonCodes ?? [] });
}
/**
 * Builds sanitized failure evidence for an implementation fault, attempts one
 * sink delivery, and returns the typed error to throw.
 *
 * The evidence records a fixed reason code — never the exception's message,
 * class or stack — so a portable record can be emitted for a fault without
 * leaking internals to whoever later reads it.
 */
async function failWithImplementationFault(invocation, clock, options, reasonCode, cause) {
    const evidence = buildInvocationEvidence(invocation, (0, time_1.toUtcTimestamp)(clock()), 'failed', invocation.subject, [reasonCode], undefined);
    const deliveryFailure = await deliverEvidence(options.evidenceSink, evidence);
    const reasonCodes = deliveryFailure === undefined ? [reasonCode] : [reasonCode, REASON_EVIDENCE_DELIVERY_FAILED];
    return new invocation_error_1.SovereigntyCapabilityInvocationError(invocation_error_1.SOVEREIGNTY_CAPABILITY_INVOCATION_ERROR_CODES.implementationError, {
        reasonCodes,
        invocationId: invocation.invocationId,
        capability: evidence.capability,
        ...(options.evidenceSink === undefined ? {} : { evidenceDelivered: deliveryFailure === undefined }),
    }, { cause, evidence });
}
