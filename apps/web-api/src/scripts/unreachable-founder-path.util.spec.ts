import { isFounderWarmPath, isUnreachableFounderPath } from './unreachable-founder-path.util';
import type { PathHopChain } from './social-overlap-seed.util';

function founderHopChain(overrides: Partial<PathHopChain> = {}): PathHopChain {
  return {
    nodes: [
      { id: 'PL', label: 'Protocol Labs', type: 'org' },
      { id: 'f_some_founder', label: 'Some Founder', type: 'person' },
      { id: 'lp_investor', label: 'Investor', type: 'person' },
    ],
    edges: [
      { from: 'PL', to: 'f_some_founder', connectorType: 'F' },
      { from: 'f_some_founder', to: 'lp_investor', connectorType: 'F' },
    ],
    contact: { name: 'Some Founder', role: 'Founder' },
    ...overrides,
  };
}

describe('unreachable-founder-path.util', () => {
  describe('isFounderWarmPath', () => {
    it('detects connectorType F', () => {
      expect(isFounderWarmPath({ connectorType: 'F', hopChain: {} })).toBe(true);
    });

    it('detects f_* nodes without connectorType', () => {
      expect(
        isFounderWarmPath({
          hopChain: { nodes: [{ id: 'f_jane', label: 'Jane' }] },
        })
      ).toBe(true);
    });

    it('detects Founder contact role', () => {
      expect(
        isFounderWarmPath({
          hopChain: { contact: { name: 'Jane', role: 'Founder' } },
        })
      ).toBe(true);
    });

    it('rejects non-founder paths', () => {
      expect(
        isFounderWarmPath({
          connectorType: 'PL',
          hopChain: {
            contact: { name: 'Brad Holden', role: 'Partner' },
            plConnector: { name: 'Brad Holden' },
          },
        })
      ).toBe(false);
    });
  });

  describe('isUnreachableFounderPath', () => {
    it('keeps F-path with Directory memberUid and no plConnector', () => {
      expect(
        isUnreachableFounderPath({
          connectorType: 'F',
          hopChain: founderHopChain({
            contact: { name: 'Jane Founder', role: 'Founder', memberUid: 'uid-jane' },
          }),
        })
      ).toBe(false);
    });

    it('keeps F-path with plConnector and no memberUid', () => {
      expect(
        isUnreachableFounderPath({
          connectorType: 'F',
          hopChain: founderHopChain({
            plConnector: { name: 'Brad Holden', internalId: 42 },
          }),
        })
      ).toBe(false);
    });

    it('drops F-path with neither memberUid nor plConnector', () => {
      expect(
        isUnreachableFounderPath({
          connectorType: 'F',
          hopChain: founderHopChain(),
        })
      ).toBe(true);
    });

    it('keeps Affinity-direct / non-founder paths', () => {
      expect(
        isUnreachableFounderPath({
          connectorType: 'PL',
          hopChain: {
            plConnector: { name: 'Brad Holden' },
            contact: { name: 'Brad Holden', role: 'Partner' },
          },
        })
      ).toBe(false);
    });

    it('drops LinkedIn-only F-path without memberUid or plConnector', () => {
      expect(
        isUnreachableFounderPath({
          connectorType: 'F',
          hopChain: {
            nodes: [
              { id: 'PL', label: 'Protocol Labs', type: 'org' },
              { id: 'f_li_founder', label: 'LI Founder', type: 'person' },
            ],
            edges: [{ from: 'PL', to: 'f_li_founder', connectorType: 'F' }],
            contact: { name: 'LI Founder', role: 'Founder' },
          },
        })
      ).toBe(true);
    });

    it('does not treat blank plConnector name as usable', () => {
      expect(
        isUnreachableFounderPath({
          connectorType: 'F',
          hopChain: founderHopChain({ plConnector: { name: '   ' } }),
        })
      ).toBe(true);
    });
  });
});
