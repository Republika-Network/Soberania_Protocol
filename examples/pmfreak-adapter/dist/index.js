"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PMFreakAocAdapter = void 0;
const audit_runtime_1 = require("@aoc-runtime/audit-runtime");
const authorization_runtime_1 = require("@aoc-runtime/authorization-runtime");
const capability_runtime_1 = require("@aoc-runtime/capability-runtime");
const consent_runtime_1 = require("@aoc-runtime/consent-runtime");
const governance_runtime_1 = require("@aoc-runtime/governance-runtime");
class PMFreakAocAdapter {
    constructor(providers) {
        this.providers = providers;
        const governance = new governance_runtime_1.GovernanceRuntime(providers.policies);
        const capability = new capability_runtime_1.CapabilityRuntime(providers.capabilities);
        const consent = new consent_runtime_1.ConsentRuntime(providers.consent, { trustedKeys: providers.consentTrustedKeys, resourceOwnership: providers.resourceOwnership });
        const audit = new audit_runtime_1.AuditRuntime();
        this.authorization = new authorization_runtime_1.AuthorizationRuntime(governance, capability, consent, audit);
    }
    async evaluateAction(input) {
        const decision = await this.authorization.evaluate(input);
        return decision.allowed;
    }
    async writeAudit(event) {
        await this.providers.audit.append(event);
    }
}
exports.PMFreakAocAdapter = PMFreakAocAdapter;
