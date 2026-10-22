"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.signAuditEvent = exports.AuditRuntime = void 0;
const crypto_1 = require("@aoc-runtime/crypto");
class AuditRuntime {
    finalizeDecision(decision) {
        return {
            ...decision,
            provenance: {
                runtimeAttribution: 'aoc-runtime',
                policySourceAttribution: decision.provenance.policySource,
                machineAttribution: decision.explainability.governance?.effectiveActor?.actorType === 'machine',
                ...decision.provenance,
            },
        };
    }
    createSignedEvent(event, chainId, signature, previous) {
        const previousEventHash = previous?.eventHash;
        const chainPosition = previous ? previous.chainPosition + 1 : 0;
        const eventHash = (0, crypto_1.stableHash)({ chainId, chainPosition, previousEventHash, event });
        return { event, eventHash, previousEventHash, chainPosition, chainId, signature };
    }
    /** Verifies chain linkage and every event signature against `trustedKeys` (configured independently of the chain). */
    verifyChain(events, trustedKeys) {
        for (let i = 0; i < events.length; i += 1) {
            const current = events[i];
            const expectedPrev = i === 0 ? undefined : events[i - 1].eventHash;
            if (current.previousEventHash !== expectedPrev || current.chainPosition !== i)
                return false;
            const hash = (0, crypto_1.stableHash)({ chainId: current.chainId, chainPosition: current.chainPosition, previousEventHash: current.previousEventHash, event: current.event });
            if (hash !== current.eventHash)
                return false;
            if (!(0, crypto_1.verifyPayloadSignature)({ eventHash: current.eventHash, event: current.event }, current.signature, trustedKeys))
                return false;
        }
        return true;
    }
}
exports.AuditRuntime = AuditRuntime;
const signAuditEvent = (payload, privateKey, signer, provenance) => (0, crypto_1.signPayload)(payload, privateKey, signer, provenance);
exports.signAuditEvent = signAuditEvent;
