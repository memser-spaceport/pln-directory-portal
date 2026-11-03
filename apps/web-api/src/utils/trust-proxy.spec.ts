import { DEFAULT_TRUST_PROXY_HOPS, resolveTrustProxyHops } from './trust-proxy';

describe('resolveTrustProxyHops', () => {
  it('trusts the one ALB hop by default', () => {
    expect(DEFAULT_TRUST_PROXY_HOPS).toBe(1);
    expect(resolveTrustProxyHops(undefined)).toBe(1);
    expect(resolveTrustProxyHops('')).toBe(1);
    expect(resolveTrustProxyHops('  ')).toBe(1);
  });

  it('takes a whole number of hops from the environment, 0 included', () => {
    expect(resolveTrustProxyHops('0')).toBe(0);
    expect(resolveTrustProxyHops('2')).toBe(2);
  });

  it('ignores a value that is not a whole number of hops', () => {
    for (const value of ['true', '-1', '1.5', 'abc']) {
      expect(resolveTrustProxyHops(value)).toBe(1);
    }
  });
});
