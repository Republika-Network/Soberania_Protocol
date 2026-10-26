import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { URL } from 'url';
import { InMemoryApiKeyStore, toRuntimeCaller } from '../auth/apiKeys';
import { InMemoryRateLimiter } from '../limits/rateLimiter';
import { RuntimeLogger } from '../logging/logger';
import { DefaultRuntimeHealthReporter, DefaultTraceContextProvider, NoopRuntimeMetricsSink, NoopTelemetrySink, type RuntimeMetricsSink, type RuntimeHealthReporter, type TelemetrySink, type TraceContextProvider } from '../observability';
import type { ApiResponse, RuntimeEndpoint } from '../types/api-types';
import { RUNTIME_HANDSHAKE_PATH, buildMetadata, toErrorEnvelope, type RuntimeResponseEnvelope, type RuntimeHandshakeEnvelope } from '../types/transport';
import { CONTRACTS_VERSION, MINIMUM_SUPPORTED_TRANSPORT_VERSION, PLATFORM_VERSION, RUNTIME_TRANSPORT_VERSION, SDK_COMPATIBILITY_VERSION } from '../versioning';
import { authAndLimit } from './middleware';
import { DEFAULT_RUNTIME_CORE, deriveDecision, executeRoute, maybeResolveUsageConsumerId, type RuntimeCore } from './routes';
import { isMeteredEndpoint } from '../usage';
import { enforceCapabilityAccess, type EnforcementMode } from '../enforcement/enforceCapability';

const POST_ENDPOINTS: RuntimeEndpoint[] = [
  '/enforcement/evaluate',
  '/execution/authorize',
  '/capability/mint',
  '/access/request',
  '/access/request/decision',
  '/access/grant/revoke',
  '/payout/execute',
  '/payout/callback',
  '/trust/credential/register',
  '/trust/verify',
  '/trust/consent/grant',
  '/data/access',
];

const GET_ENDPOINTS: RuntimeEndpoint[] = ['/access/requests', '/access/grants/active', '/audit/events', '/usage/summary'];
const RUNTIME_HEALTH_PATH = '/runtime/health' as const;

export type RuntimeServerDeps = {
  apiKeyStore?: InMemoryApiKeyStore;
  rateLimiter?: InMemoryRateLimiter;
  logger?: RuntimeLogger;
  core?: RuntimeCore;
  capabilitySecret?: string;
  enforcementMode?: EnforcementMode;
  telemetrySink?: TelemetrySink;
  metricsSink?: RuntimeMetricsSink;
  healthReporter?: RuntimeHealthReporter;
  traceContextProvider?: TraceContextProvider;
};

function sendJson(response: ServerResponse, statusCode: number, body: RuntimeResponseEnvelope<unknown>): void {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(body));
}

function asEnvelope(requestId: string, correlationId: string, mode: 'remote' | 'local', endpoint: RuntimeEndpoint | typeof RUNTIME_HANDSHAKE_PATH, body: ApiResponse<unknown>): RuntimeResponseEnvelope<unknown> {
  const metadata = buildMetadata({ mode, requestId, correlationId, endpoint });
  if (body.success && body.data !== undefined) return { success: true, metadata, data: body.data };
  return { success: false, metadata, error: toErrorEnvelope(body.error?.code ?? 'UNKNOWN_API_ERROR', body.error?.message ?? 'Unknown API error.') };
}

async function parseJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) {
    chunks.push(chunk as Uint8Array);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  if (raw.trim() === '') {
    throw new Error('Request body cannot be empty.');
  }

  return JSON.parse(raw);
}

function parseGetPayload(url: URL): Record<string, string> {
  const payload: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    payload[key] = value;
  }
  return payload;
}

/**
 * Hosted access has no built-in credentials: the operator must supply the API
 * key store and the capability secret (`deps.capabilitySecret` or
 * `AOC_CAPABILITY_SECRET`). Capability enforcement is always strict: the former
 * soft mode, which let requests without a token through, no longer exists and any
 * attempt to configure it is refused. The HMAC capability path itself is disabled
 * (SOBE-SEC-03J), so a `/data/access` or `/payout/execute` request that names both
 * principals is denied whether or not it carries a token.
 */
export function createRuntimeServer(deps: RuntimeServerDeps = {}) {
  if (deps.apiKeyStore === undefined) {
    throw new Error('createRuntimeServer requires an explicitly configured apiKeyStore.');
  }
  const apiKeyStore = deps.apiKeyStore;
  const rateLimiter = deps.rateLimiter ?? new InMemoryRateLimiter();
  const logger = deps.logger ?? new RuntimeLogger();
  const core = deps.core ?? DEFAULT_RUNTIME_CORE;
  const capabilitySecret = deps.capabilitySecret ?? process.env.AOC_CAPABILITY_SECRET;
  if (typeof capabilitySecret !== 'string' || capabilitySecret.trim() === '') {
    throw new Error('createRuntimeServer requires a capability secret (deps.capabilitySecret or AOC_CAPABILITY_SECRET).');
  }
  if (deps.enforcementMode !== undefined && deps.enforcementMode !== 'strict') {
    throw new Error('createRuntimeServer: capability enforcement is always strict; soft mode no longer exists.');
  }
  if (process.env.ENFORCEMENT_MODE !== undefined && process.env.ENFORCEMENT_MODE !== 'strict') {
    throw new Error('createRuntimeServer: ENFORCEMENT_MODE must be unset or "strict"; soft mode no longer exists.');
  }
  const enforcementMode: EnforcementMode = 'strict';
  const telemetrySink = deps.telemetrySink ?? new NoopTelemetrySink();
  const metricsSink = deps.metricsSink ?? new NoopRuntimeMetricsSink();
  const traceContextProvider = deps.traceContextProvider ?? new DefaultTraceContextProvider();
  const healthReporter = deps.healthReporter ?? new DefaultRuntimeHealthReporter(enforcementMode);

  return createServer(async (request, response) => {
    if (request.url === undefined) {
      return sendJson(response, 404, asEnvelope('runtime_unknown','runtime_unknown','remote','/audit/events',{ success: false, error: { code: 'ROUTE_NOT_FOUND', message: 'Unknown endpoint.' } }));
    }

    const url = new URL(request.url, 'http://localhost');
    const pathname = url.pathname as RuntimeEndpoint;
    const method = request.method ?? 'GET';

    if (method === 'GET' && pathname === RUNTIME_HANDSHAKE_PATH) {
      const requestId = 'runtime_handshake';
      const correlationId = request.headers['x-correlation-id'];
      const handshake: RuntimeHandshakeEnvelope = {
        transportVersion: RUNTIME_TRANSPORT_VERSION,
        runtimeVersion: PLATFORM_VERSION,
        contractsVersion: CONTRACTS_VERSION,
        sdkCompatibilityVersion: SDK_COMPATIBILITY_VERSION,
        minimumSupportedTransportVersion: MINIMUM_SUPPORTED_TRANSPORT_VERSION,
        supportedModes: ['remote', 'local'],
        supportedEndpoints: [...POST_ENDPOINTS, ...GET_ENDPOINTS],
      };
      const envelope = asEnvelope(requestId, typeof correlationId === 'string' ? correlationId : requestId, 'remote', RUNTIME_HANDSHAKE_PATH, { success: true, data: handshake });
      return sendJson(response, 200, envelope);
    }

    if (method === 'GET' && pathname === RUNTIME_HEALTH_PATH) {
      const requestId = 'runtime_health';
      const correlationId = typeof request.headers['x-correlation-id'] === 'string' ? request.headers['x-correlation-id'] : requestId;
      const health = healthReporter.snapshot();
      return sendJson(response, 200, asEnvelope(requestId, correlationId, 'remote', RUNTIME_HEALTH_PATH, { success: true, data: health }));
    }

    const isPost = method === 'POST' && POST_ENDPOINTS.includes(pathname);
    const isGet = method === 'GET' && GET_ENDPOINTS.includes(pathname);
    if (!isPost && !isGet) {
      return sendJson(response, 404, asEnvelope('runtime_unknown','runtime_unknown','remote', pathname, { success: false, error: { code: 'ROUTE_NOT_FOUND', message: `Unknown endpoint: ${pathname}` } }));
    }

    const authResult = authAndLimit(request.headers, apiKeyStore, rateLimiter);
    if (!authResult.success || authResult.data === undefined) {
      logger.log({
        requestId: 'unauthenticated',
        endpoint: pathname,
        decision: 'deny',
        reason_code: authResult.error?.code ?? 'AUTH_UNKNOWN',
      });
      return sendJson(response, 401, asEnvelope('unauthenticated','unauthenticated','remote',pathname,authResult));
    }

    const { requestId } = authResult.data;
    const correlationId = typeof request.headers['x-correlation-id'] === 'string' ? request.headers['x-correlation-id'] : requestId;
    const trace = traceContextProvider.create({ requestId, correlationId, endpoint: pathname });
    telemetrySink.emit({ eventType: 'request.received', category: 'request', severity: 'info', message: 'Runtime request received.', trace, metadata: { method, endpoint: pathname } });

    let payload: unknown;
    if (method === 'GET') {
      payload = parseGetPayload(url);
    } else {
      try {
        payload = await parseJson(request);
      } catch (error) {
        logger.log({ requestId, endpoint: pathname, decision: 'deny', reason_code: 'REQUEST_PARSE_ERROR' });
        telemetrySink.emit({ eventType: 'request.payload_validation.failed', category: 'request', severity: 'warn', message: 'Request payload parsing failed.', trace, metadata: { endpoint: pathname } });
        return sendJson(response, 400, asEnvelope(requestId, requestId, 'remote', pathname, { success: false, error: { code: 'REQUEST_PARSE_ERROR', message: error instanceof Error ? error.message : 'Invalid JSON payload.' } }));
      }
    }

    if (
      method === 'POST' &&
      (pathname === '/data/access' || pathname === '/payout/execute') &&
      payload !== null &&
      typeof payload === 'object'
    ) {
      const requestPayload = payload as { subject_hash?: unknown; consumer_id?: unknown };
      const subjectId = typeof requestPayload.subject_hash === 'string' ? requestPayload.subject_hash : undefined;
      const requesterId = typeof requestPayload.consumer_id === 'string' ? requestPayload.consumer_id : undefined;

      if (subjectId !== undefined && requesterId !== undefined) {
        const capabilityResult = enforceCapabilityAccess({
          endpoint: pathname,
          headers: request.headers,
          payload,
          subject_id: subjectId,
          requester_id: requesterId,
          mode: enforcementMode,
          capabilitySecret,
        });

        if (capabilityResult.auditEvent !== undefined) {
          core.capabilityAuditService.recordEvent(capabilityResult.auditEvent);
        }

        if (!capabilityResult.allowed) {
          logger.log({
            requestId,
            endpoint: pathname,
            decision: 'deny',
            reason_code: capabilityResult.authorization?.reason_code ?? capabilityResult.reason_code,
          });
          telemetrySink.emit({ eventType: 'request.capability.denied', category: 'capability', severity: 'warn', message: 'Capability access denied.', trace, metadata: { reason_code: capabilityResult.reason_code } });
          return sendJson(response, 403, asEnvelope(requestId, correlationId, 'remote', pathname, { success: false, error: { code: 'CAPABILITY_ACCESS_DENIED', message: `Capability enforcement denied access (${capabilityResult.reason_code}).` } }));
        }
      }
    }

    const routeResult = executeRoute(pathname, payload, core, toRuntimeCaller(authResult.data.apiKey));
    if (!routeResult.success || routeResult.data === undefined) {
      logger.log({
        requestId,
        endpoint: pathname,
        decision: 'deny',
        reason_code: routeResult.error?.code ?? 'PROTOCOL_ERROR',
      });
      telemetrySink.emit({ eventType: 'request.route.denied', category: 'request', severity: 'warn', message: 'Route execution denied or failed validation.', trace, metadata: { code: routeResult.error?.code ?? 'PROTOCOL_ERROR' } });
      return sendJson(response, 400, asEnvelope(requestId, correlationId, 'remote', pathname, routeResult));
    }

    const decisionInfo = deriveDecision(pathname, routeResult.data);
    logger.log({
      requestId,
      endpoint: pathname,
      decision: decisionInfo.decision,
      reason_code: decisionInfo.reasonCode,
    });

    telemetrySink.emit({ eventType: 'request.route.allowed', category: 'request', severity: 'info', message: 'Route execution succeeded.', trace, metadata: { decision: decisionInfo.decision, reason_code: decisionInfo.reasonCode } });

    if (isMeteredEndpoint(pathname)) {
      const consumerId = maybeResolveUsageConsumerId(pathname, payload);
      if (consumerId !== undefined) {
        const occurredAt = new Date().toISOString();
        Promise.resolve()
          .then(() => {
            core.usageService.recordUsage({
              consumer_id: consumerId,
              endpoint: pathname,
              decision: decisionInfo.decision,
              reason_code: decisionInfo.reasonCode,
              usedAt: new Date(occurredAt),
            });

            core.monetizationService.recordUsageAsBillable({
              consumer_id: consumerId,
              resource: pathname,
              action: 'execute',
              quantity: 1,
              occurred_at: occurredAt,
            });
          })
          .then(() => {
            telemetrySink.emit({ eventType: 'metering.recorded', category: 'metering', severity: 'info', message: 'Usage metering recorded.', trace, metadata: { endpoint: pathname } });
            metricsSink.emitMetric({ metric: 'runtime.metering.success', value: 1, unit: 'count', category: 'metering', trace, tags: { endpoint: pathname } });
          })
          .catch(() => {
            logger.log({
              requestId,
              endpoint: pathname,
              decision: 'deny',
              reason_code: 'USAGE_METERING_ERROR',
            });
            telemetrySink.emit({ eventType: 'metering.failed', category: 'metering', severity: 'error', message: 'Usage metering failed.', trace, metadata: { endpoint: pathname } });
            metricsSink.emitMetric({ metric: 'runtime.metering.failure', value: 1, unit: 'count', category: 'metering', trace, tags: { endpoint: pathname } });
          });
      }
    }

    telemetrySink.emit({ eventType: 'transport.response.emitted', category: 'transport', severity: 'info', message: 'Response envelope emitted.', trace, metadata: { statusCode: 200 } });
    return sendJson(response, 200, asEnvelope(requestId, correlationId, 'remote', pathname, routeResult));
  });
}
