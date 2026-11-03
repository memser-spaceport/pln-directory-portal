/**
 * How many proxies in front of the API Express should trust when it reads the client address (LAB-3086).
 *
 * Every deployed environment serves the API through one AWS ALB (`deployment/chart` ingress, target-type `ip`), which
 * appends the address that connected to it to `X-Forwarded-For`. Trusting that one hop makes `req.ip` the real
 * client, so the throttler keeps a budget per client instead of one per load-balancer node. Entries a client writes
 * into `X-Forwarded-For` itself sit further left and are never read.
 *
 * `TRUST_PROXY_HOPS` overrides it for a deployment with a different chain; `0` trusts no proxy, as before.
 */
export const DEFAULT_TRUST_PROXY_HOPS = 1;

export function resolveTrustProxyHops(value: string | undefined): number {
  if (value === undefined || value.trim() === '') {
    return DEFAULT_TRUST_PROXY_HOPS;
  }
  const hops = Number(value);
  return Number.isInteger(hops) && hops >= 0 ? hops : DEFAULT_TRUST_PROXY_HOPS;
}
