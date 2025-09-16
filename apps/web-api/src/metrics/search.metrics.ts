import { Counter, Histogram, Registry, register as globalRegister } from 'prom-client';

/**
 * Safe helpers to avoid "already registered" errors during hot reloads
 * or multiple module instantiations.
 */
function getOrCreateCounter(reg: Registry, name: string, help: string, labelNames: string[]) {
  return (reg.getSingleMetric(name) as Counter) ||
    new Counter({ name, help, labelNames, registers: [reg] });
}

function getOrCreateHistogram(
  reg: Registry,
  name: string,
  help: string,
  labelNames: string[],
  buckets?: number[],
) {
  return (reg.getSingleMetric(name) as Histogram) ||
    new Histogram({ name, help, labelNames, buckets, registers: [reg] });
}

/**
 * Re-export the global registry (used by your /metrics endpoint).
 * Make sure you only call register.setDefaultLabels(...) ONCE in bootstrap.
 */
export const register = globalRegister;

/**
 * Search-related metrics:
 * - search_requests_total: all search attempts
 * - search_empty_total: searches that returned zero results
 * - search_errors_total: OpenSearch errors while executing searches
 * - search_duration_seconds{...}_bucket: latency histogram
 *
 * Labels:
 *   - source: "full" | "autocomplete" | "posts" | "hydrate"
 *   - section: logical section (events|projects|teams|members|forumThreads|all)
 *   - strict: "true" | "false" (reflects strict mode usage)
 *   - error_type: normalized error type ("timeout" | "conn" | "429" | "404" | "5xx" | "other")
 */
export const SearchMetrics = {
  requests: getOrCreateCounter(
    register,
    'search_requests_total',
    'Total search requests',
    ['source', 'section', 'strict'],
  ),

  empty: getOrCreateCounter(
    register,
    'search_empty_total',
    'Search requests that returned empty result',
    ['source', 'section', 'strict'],
  ),

  errors: getOrCreateCounter(
    register,
    'search_errors_total',
    'OpenSearch errors thrown while searching',
    ['source', 'section', 'strict', 'error_type'],
  ),

  duration: getOrCreateHistogram(
    register,
    'search_duration_seconds',
    'Latency of search requests in seconds',
    ['source', 'section', 'strict'],
    // Reasonable buckets for API calls; adjust as needed.
    [0.01, 0.025, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
  ),
};

/**
 * Small helper that maps arbitrary errors to a compact set of labels to keep
 * cardinality under control.
 */
export function classifyError(e: any): string {
  if (!e) return 'other';
  if (e.name === 'TimeoutError' || e.code === 'ETIMEDOUT') return 'timeout';
  if (e.code === 'ECONNREFUSED' || e.code === 'ECONNRESET' || e.name === 'ConnectionError') return 'conn';

  const status = e.statusCode ?? e.status ?? e.body?.status;
  if (status === 429) return '429';
  if (status === 404) return '404';
  if (typeof status === 'number' && status >= 500 && status < 600) return '5xx';

  return 'other';
}
