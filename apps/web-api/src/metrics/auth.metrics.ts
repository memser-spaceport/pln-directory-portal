import { Counter, Histogram, Registry, register as globalRegister } from 'prom-client';

function getOrCreateCounter(reg: Registry, name: string, help: string, labelNames: string[]) {
  return (reg.getSingleMetric(name) as Counter) || new Counter({ name, help, labelNames, registers: [reg] });
}
function getOrCreateHistogram(reg: Registry, name: string, help: string, labelNames: string[], buckets?: number[]) {
  return (reg.getSingleMetric(name) as Histogram) || new Histogram({ name, help, labelNames, buckets, registers: [reg] });
}

export const register = globalRegister;

export function statusClassOf(status?: number | string): '2xx' | '3xx' | '4xx' | '5xx' | 'other' {
  const n = typeof status === 'string' ? parseInt(status, 10) : status;
  if (!n || n < 100) return 'other';
  if (n < 200) return 'other';
  if (n < 300) return '2xx';
  if (n < 400) return '3xx';
  if (n < 500) return '4xx';
  if (n < 600) return '5xx';
  return 'other';
}
export function extractErrorCode(e: any): string {
  return e?.response?.data?.errorCode || e?.code || e?.name || 'unknown';
}

export const AuthMetrics = {
  requests: getOrCreateCounter(
    register,
    'auth_outbound_requests_total',
    'Total outbound requests to external Auth API',
    ['op']
  ),
  errors: getOrCreateCounter(
    register,
    'auth_outbound_errors_total',
    'Errors from external Auth API (includes 4xx/5xx)',
    ['op', 'status_class', 'http_status', 'error_code']
  ),
  duration: getOrCreateHistogram(
    register,
    'auth_outbound_duration_seconds',
    'Latency of outbound requests to external Auth API (seconds)',
    ['op'],
    [0.01, 0.025, 0.05, 0.1, 0.2, 0.5, 1, 2, 5]
  ),
};
