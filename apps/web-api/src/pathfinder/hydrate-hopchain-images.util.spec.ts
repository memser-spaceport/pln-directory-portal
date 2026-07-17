import { collectMemberUidsNeedingImages, hydrateHopChainImages } from './hydrate-hopchain-images.util';

describe('hydrate-hopchain-images.util', () => {
  describe('collectMemberUidsNeedingImages', () => {
    it('collects uids missing imageUrl from contact, routeNodes, and nested contacts', () => {
      expect(
        collectMemberUidsNeedingImages([
          {
            contact: { memberUid: 'uid-contact', name: 'A' },
            routeNodes: [
              { memberUid: 'uid-node', label: 'B' },
              {
                label: 'Org',
                contacts: [{ memberUid: 'uid-nested', name: 'C' }],
              },
            ],
          },
          {
            contact: { memberUid: 'uid-has-img', imageUrl: 'https://img/x.webp', name: 'D' },
          },
        ])
      ).toEqual(['uid-contact', 'uid-node', 'uid-nested']);
    });

    it('skips non-objects and people without memberUid', () => {
      expect(collectMemberUidsNeedingImages([null, undefined, { contact: { name: 'NoUid' } }, 'x'])).toEqual([]);
    });
  });

  describe('hydrateHopChainImages', () => {
    const images = new Map([
      ['uid-a', 'https://img/a.webp'],
      ['uid-b', 'https://img/b.webp'],
    ]);

    it('fills missing imageUrl on contact and route people', () => {
      const hopChain = {
        contact: { name: 'Alice', role: 'Founder', memberUid: 'uid-a' },
        routeNodes: [
          { label: 'Alice', variant: 'member', memberUid: 'uid-a' },
          {
            label: 'Firm',
            variant: 'org',
            contacts: [{ name: 'Bob', memberUid: 'uid-b' }],
          },
        ],
      };

      expect(hydrateHopChainImages(hopChain, images)).toEqual({
        contact: { name: 'Alice', role: 'Founder', memberUid: 'uid-a', imageUrl: 'https://img/a.webp' },
        routeNodes: [
          { label: 'Alice', variant: 'member', memberUid: 'uid-a', imageUrl: 'https://img/a.webp' },
          {
            label: 'Firm',
            variant: 'org',
            contacts: [{ name: 'Bob', memberUid: 'uid-b', imageUrl: 'https://img/b.webp' }],
          },
        ],
      });
    });

    it('preserves existing imageUrl', () => {
      const hopChain = {
        contact: { name: 'Alice', role: 'Founder', memberUid: 'uid-a', imageUrl: 'https://img/kept.webp' },
      };
      expect(hydrateHopChainImages(hopChain, images)).toBe(hopChain);
    });

    it('leaves people without a LabOS image unchanged', () => {
      const hopChain = {
        contact: { name: 'Ghost', role: 'Founder', memberUid: 'uid-missing' },
      };
      expect(hydrateHopChainImages(hopChain, images)).toBe(hopChain);
    });

    it('returns input unchanged when image map is empty', () => {
      const hopChain = { contact: { name: 'Alice', role: 'Founder', memberUid: 'uid-a' } };
      expect(hydrateHopChainImages(hopChain, new Map())).toBe(hopChain);
    });
  });
});
