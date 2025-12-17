import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ZipkinExporter } from '@opentelemetry/exporter-zipkin';
import { ParentBasedSampler, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
// --- Debug logs (see what OTel does)
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

const ENABLED = process.env.OTEL_ENABLED === 'true';

if (ENABLED) {
  // --- Config
  const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'pln-directory-portal';
  const ZIPKIN_URL = process.env.ZIPKIN_URL || 'http://zipkin.monitoring.svc.cluster.local:9411/api/v2/spans';
  const SAMPLE = Number(process.env.OTEL_TRACES_SAMPLER_ARG || '1'); // 1 = 100%
  process.env.OTEL_SERVICE_NAME = SERVICE_NAME;
  const exporter = new ZipkinExporter({ url: ZIPKIN_URL, serviceName: SERVICE_NAME });

  const httpInstr = new HttpInstrumentation({
    // (span, response)
    responseHook: (span, res) => {
      try {
        const traceId = span?.spanContext().traceId;
        const r = res as any;
        if (traceId && r?.setHeader) r.setHeader('X-Trace-Id', traceId);
      } catch {
        /* no-op */
      }
    },
    // optional: ignore noisy paths
    ignoreIncomingRequestHook: (req) => {
      const url = (req as any)?.url || '';
      return url.startsWith('/metrics') || url.startsWith('/health');
    },
  });

  const instrumentations = [
    httpInstr,
    new ExpressInstrumentation(),
    new NestInstrumentation(),
    new PgInstrumentation(),
    new IORedisInstrumentation(),
  ];

  // --- SDK
  const sdk = new NodeSDK({
    contextManager: new AsyncLocalStorageContextManager(),
    traceExporter: exporter,
    sampler: new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(SAMPLE) }),
    instrumentations,
    serviceName: SERVICE_NAME,
  });

  try {
    sdk.start();
    diag.info(`[OTel] NodeSDK start() invoked → Zipkin=${ZIPKIN_URL} service=${SERVICE_NAME} sample=${SAMPLE}`);
  } catch (e) {
    console.error('[OTel] start() threw synchronously', e);
  }

  // Graceful shutdown
  process.on('SIGTERM', () => {
    sdk.shutdown().finally(() => process.exit(0));
  });
  process.on('SIGINT', () => {
    sdk.shutdown().finally(() => process.exit(0));
  });
}
