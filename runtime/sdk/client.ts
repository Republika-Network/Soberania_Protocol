import { authorizeExecution, type ExecutionAuthorizationResult } from '../../protocol/execution';
import { evaluateEnforcement, type EnforcementDecision } from '../../protocol/enforcement';
import { mintCapability, type MintCapabilityInput, type ProtocolCapability } from '../../protocol/capability';
import type { RevocationRegistry } from '../../capability';
import { ALWAYS_UNKNOWN_REVOCATION_CHECK, createCapabilityRevocationCheck, type RevocationCheckPort } from '../../protocol/revocation';
import type { DataAccessDecision, DataAccessRequestInput } from '../access/types';
import type { RuntimeAuditEvent } from '../audit/service';
import type { GrantConsentInput, RegisterCredentialInput, VerifyIdentityInput } from '../trust/service';
import type {
  AocIdentityConsentRecord,
  AocIdentityCredentialRecord,
  IdentityVerificationResult,
  RlusdWithdrawalRequest,
} from '../trust/types';
import type { RuntimeMode } from '../types/api-types';
import { RUNTIME_HANDSHAKE_PATH, type RuntimeHandshakeEnvelope, type RuntimeResponseEnvelope } from '../types/transport';
import { RUNTIME_TRANSPORT_VERSION, classifyTransportCompatibility } from '../versioning';
import type { PayoutCallbackInput, PayoutExecuteResult } from '../payout/types';
import type { MeteredRuntimeEndpoint, UsageSummaryResult } from '../usage';
import type { AccessRequest, ConsentDecision, CreateAccessRequestInput, GrantedAccess, RevokeGrantResult } from '../controlPlane';

type FetchLike = typeof fetch;
/** `revocationRegistry` backs local-mode decisions; without it every local revocation lookup is `unknown` (deny). */
export type HostedRuntimeClientOptions = { apiKey?: string; baseUrl?: string; mode?: RuntimeMode; fetchImpl?: FetchLike; validateCompatibilityOnInit?: boolean; revocationRegistry?: RevocationRegistry };
export type ListAuditEventsInput = { subject_hash?: string; consumer_id?: string; event_type?: string; from?: string; to?: string };
export type GetUsageSummaryInput = { consumer_id: string; endpoint?: MeteredRuntimeEndpoint; from?: string; to?: string };
export type PayoutCallbackResult = { received: true; reason_code: string };
export interface HostedRuntimeSdk { /* unchanged */
  registerCredential(input: RegisterCredentialInput): Promise<AocIdentityCredentialRecord>; verifyIdentity(input: VerifyIdentityInput): Promise<IdentityVerificationResult>; grantIdentityConsent(input: GrantConsentInput): Promise<AocIdentityConsentRecord>; executePayout(input: RlusdWithdrawalRequest): Promise<PayoutExecuteResult>; callbackPayout(input: PayoutCallbackInput): Promise<PayoutCallbackResult>; requestDataAccess(input: DataAccessRequestInput): Promise<DataAccessDecision>; listAuditEvents(input?: ListAuditEventsInput): Promise<RuntimeAuditEvent[]>; getUsageSummary(input: GetUsageSummaryInput): Promise<UsageSummaryResult>; createAccessRequest(input: CreateAccessRequestInput): Promise<AccessRequest>; listAccessRequests(input: { subject_id: string; requester_id?: string; status?: 'pending' | 'approved' | 'denied'; }): Promise<AccessRequest[]>; decideAccessRequest(input: { request_id: string; subject_id: string; decision: 'approve' | 'deny'; reason?: string; }): Promise<{ request: AccessRequest; decision: ConsentDecision; grant?: GrantedAccess }>; listActiveGrants(input?: { subject_id?: string; requester_id?: string }): Promise<GrantedAccess[]>; revokeGrant(input: { grant_id: string; subject_id?: string; requester_id?: string; reason?: string; idempotency_key?: string }): Promise<RevokeGrantResult>; }

async function parseEnvelope<T>(response: Response): Promise<T> {
  const parsed = (await response.json()) as RuntimeResponseEnvelope<T>;
  if (!parsed.success) throw new Error(`[${parsed.error.code}] ${parsed.error.message}`);
  return parsed.data;
}

export class HostedRuntimeClient implements HostedRuntimeSdk {
  private readonly mode: RuntimeMode; private readonly apiKey?: string; private readonly baseUrl: string; private readonly fetchImpl: FetchLike; private readonly correlationId: string; private readonly revocationCheck: RevocationCheckPort;
  constructor(options: HostedRuntimeClientOptions = {}) { this.mode = options.mode ?? 'remote'; this.apiKey = options.apiKey; this.baseUrl = options.baseUrl ?? 'http://localhost:8787'; this.fetchImpl = options.fetchImpl ?? fetch; this.correlationId = `corr_${Date.now()}`; this.revocationCheck = options.revocationRegistry ? createCapabilityRevocationCheck(options.revocationRegistry) : ALWAYS_UNKNOWN_REVOCATION_CHECK; if (options.validateCompatibilityOnInit !== false && this.mode === 'remote') void this.validateCompatibility(); }
  private requireApiKey(): void { if (this.apiKey === undefined || this.apiKey.trim() === '') throw new Error('HostedRuntimeClient remote mode requires apiKey.'); }
  private async validateCompatibility(): Promise<void> { this.requireApiKey(); const response = await this.fetchImpl(`${this.baseUrl}${RUNTIME_HANDSHAKE_PATH}`, { method: 'GET', headers: { 'x-api-key': this.apiKey!, 'x-correlation-id': this.correlationId } }); const handshake = await parseEnvelope<RuntimeHandshakeEnvelope>(response); const compatibility = classifyTransportCompatibility(handshake.transportVersion); if (compatibility === 'incompatible') throw new Error(`[COMPATIBILITY_FAILURE] SDK transport ${RUNTIME_TRANSPORT_VERSION} incompatible with runtime ${handshake.transportVersion}. Minimum supported runtime transport: ${handshake.minimumSupportedTransportVersion}.`); if (compatibility === 'warn') console.warn(`[COMPATIBILITY_WARNING] Runtime transport ${handshake.transportVersion} is newer than SDK transport ${RUNTIME_TRANSPORT_VERSION}.`); }
  private async post<TReq,TRes>(path:string,payload:TReq):Promise<TRes>{ this.requireApiKey(); const response=await this.fetchImpl(`${this.baseUrl}${path}`,{method:'POST',headers:{'content-type':'application/json','x-api-key':this.apiKey!,'x-correlation-id':this.correlationId},body:JSON.stringify(payload)}); return parseEnvelope<TRes>(response); }
  private async get<TRes>(path:string,params:Record<string,string|undefined>):Promise<TRes>{ this.requireApiKey(); const url=new URL(`${this.baseUrl}${path}`); Object.entries(params).forEach(([k,v])=>{if(v!==undefined&&v.trim()!=='')url.searchParams.set(k,v);}); const response=await this.fetchImpl(url,{method:'GET',headers:{'x-api-key':this.apiKey!,'x-correlation-id':this.correlationId}}); return parseEnvelope<TRes>(response); }
  async evaluateEnforcement(input: Parameters<typeof evaluateEnforcement>[0]): Promise<EnforcementDecision> { return this.mode==='local'?evaluateEnforcement(input, this.revocationCheck):this.post('/enforcement/evaluate',input); }
  async authorizeExecution(input: Parameters<typeof authorizeExecution>[0]): Promise<ExecutionAuthorizationResult> { return this.mode==='local'?authorizeExecution(input, this.revocationCheck):this.post('/execution/authorize',input); }
  async mintCapability(input: MintCapabilityInput): Promise<ProtocolCapability> { return this.mode==='local'?mintCapability({ ...input, checkConsentRevocation: this.revocationCheck }):this.post('/capability/mint',input); }
  async registerCredential(input: RegisterCredentialInput): Promise<AocIdentityCredentialRecord> { if(this.mode==='local') throw new Error('Credential registration is only available in hosted mode.'); return this.post<RegisterCredentialInput, AocIdentityCredentialRecord>('/trust/credential/register',input); }
  async verifyIdentity(input: VerifyIdentityInput): Promise<IdentityVerificationResult> { if(this.mode==='local') throw new Error('Identity verification is only available in hosted mode.'); return this.post<VerifyIdentityInput, IdentityVerificationResult>('/trust/verify',input); }
  async grantIdentityConsent(input: GrantConsentInput): Promise<AocIdentityConsentRecord> { if(this.mode==='local') throw new Error('Consent grant is only available in hosted mode.'); return this.post<GrantConsentInput, AocIdentityConsentRecord>('/trust/consent/grant',input); }
  async executePayout(input: RlusdWithdrawalRequest): Promise<PayoutExecuteResult> { if(this.mode==='local') throw new Error('Payout execution is only available in hosted mode.'); return this.post<RlusdWithdrawalRequest, PayoutExecuteResult>('/payout/execute',input); }
  async callbackPayout(input: PayoutCallbackInput): Promise<PayoutCallbackResult> { if(this.mode==='local') throw new Error('Payout callback is only available in hosted mode.'); return this.post<PayoutCallbackInput, PayoutCallbackResult>('/payout/callback',input); }
  async requestDataAccess(input: DataAccessRequestInput): Promise<DataAccessDecision> { if(this.mode==='local') throw new Error('Data access requests are only available in hosted mode.'); return this.post<DataAccessRequestInput, DataAccessDecision>('/data/access',input); }
  async listAuditEvents(input: ListAuditEventsInput = {}): Promise<RuntimeAuditEvent[]> { if(this.mode==='local') throw new Error('Audit event listing is only available in hosted mode.'); const r=await this.get<{events:RuntimeAuditEvent[]}>('/audit/events',input); return r.events; }
  async getUsageSummary(input: GetUsageSummaryInput): Promise<UsageSummaryResult> { if(this.mode==='local') throw new Error('Usage summary is only available in hosted mode.'); return this.get<UsageSummaryResult>('/usage/summary',input); }
  async createAccessRequest(input: CreateAccessRequestInput): Promise<AccessRequest> { if(this.mode==='local') throw new Error('Control-plane access request endpoints are only available in hosted mode.'); return this.post<CreateAccessRequestInput, AccessRequest>('/access/request',input); }
  async listAccessRequests(input:{subject_id:string;requester_id?:string;status?:'pending'|'approved'|'denied';}): Promise<AccessRequest[]> { if(this.mode==='local') throw new Error('Control-plane access request endpoints are only available in hosted mode.'); return this.get<AccessRequest[]>('/access/requests',input); }
  async decideAccessRequest(input:{request_id:string;subject_id:string;decision:'approve'|'deny';reason?:string;}): Promise<{ request: AccessRequest; decision: ConsentDecision; grant?: GrantedAccess }> { if(this.mode==='local') throw new Error('Control-plane access request endpoints are only available in hosted mode.'); return this.post<typeof input, { request: AccessRequest; decision: ConsentDecision; grant?: GrantedAccess }>('/access/request/decision',input); }
  async listActiveGrants(input:{subject_id?:string;requester_id?:string}={}): Promise<GrantedAccess[]> { if(this.mode==='local') throw new Error('Control-plane grant endpoints are only available in hosted mode.'); return this.get<GrantedAccess[]>('/access/grants/active',input); }
  async revokeGrant(input:{grant_id:string;subject_id?:string;requester_id?:string;reason?:string;idempotency_key?:string}): Promise<RevokeGrantResult> { if(this.mode==='local') throw new Error('Control-plane grant endpoints are only available in hosted mode.'); return this.post<typeof input, RevokeGrantResult>('/access/grant/revoke',input); }
}
