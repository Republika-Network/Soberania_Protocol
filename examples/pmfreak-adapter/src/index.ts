import { AuditRuntime } from "@aoc-runtime/audit-runtime";
import { AuthorizationRuntime } from "@aoc-runtime/authorization-runtime";
import { CapabilityRuntime } from "@aoc-runtime/capability-runtime";
import { ConsentRuntime } from "@aoc-runtime/consent-runtime";
import type { TrustedKeyResolver } from "@aoc-runtime/crypto";
import { GovernanceRuntime } from "@aoc-runtime/governance-runtime";
import { AuditProvider, CapabilityProvider, ConsentProvider, PolicyProvider, ResourceOwnershipProvider } from "@aoc-runtime/provider-interfaces";
import { ActorRef, AuditEvent, GovernanceScope, NamespaceRef } from "@aoc-runtime/shared-types";

export interface SupabaseProviderBundle {
  capabilities: CapabilityProvider;
  policies: PolicyProvider;
  consent: ConsentProvider;
  /** Keys of the subjects (and delegates) whose signed consent grants are honoured. */
  consentTrustedKeys: TrustedKeyResolver;
  /** Who owns each resource, from the deployment's records; grants by anyone else are ignored. */
  resourceOwnership: ResourceOwnershipProvider;
  audit: AuditProvider;
}

export class PMFreakAocAdapter {
  private readonly authorization: AuthorizationRuntime;

  constructor(private readonly providers: SupabaseProviderBundle) {
    const governance = new GovernanceRuntime(providers.policies);
    const capability = new CapabilityRuntime(providers.capabilities);
    const consent = new ConsentRuntime(providers.consent, { trustedKeys: providers.consentTrustedKeys, resourceOwnership: providers.resourceOwnership });
    const audit = new AuditRuntime();
    this.authorization = new AuthorizationRuntime(governance, capability, consent, audit);
  }

  async evaluateAction(input: {
    actor: ActorRef;
    namespace: NamespaceRef;
    scope: GovernanceScope;
    action: string;
    resource: string;
    machineActor?: ActorRef;
    at?: string;
  }): Promise<boolean> {
    const decision = await this.authorization.evaluate(input);
    return decision.allowed;
  }

  async writeAudit(event: AuditEvent): Promise<void> {
    await this.providers.audit.append(event);
  }
}
