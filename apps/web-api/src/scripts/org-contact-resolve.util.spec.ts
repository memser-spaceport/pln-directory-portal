import { enrichOrgConnectorContacts } from './org-contact-resolve.util';

describe('enrichOrgConnectorContacts', () => {
  const index = {
    byEmail: new Map([['jonathan.king@coinbase.com', { uid: 'uid-jk', imageUrl: 'https://img/jk.webp' }]]),
    membersByName: new Map<string, string>(),
  };

  it('resolves memberUid and imageUrl by email on org contacts', () => {
    const out = enrichOrgConnectorContacts(
      {
        orgConnectors: [
          {
            name: 'Coinbase',
            description: 'co-invested',
            tags: ['Org connection'],
            contacts: [
              {
                name: 'Jonathan King',
                email: 'jonathan.king@coinbase.com',
                role: 'Principal',
                source: 'gold_list' as const,
              },
            ],
          },
        ],
        routeNodes: [
          {
            label: 'Jonathan King',
            orgName: 'Coinbase',
            variant: 'external',
            contacts: [
              {
                name: 'Jonathan King',
                email: 'jonathan.king@coinbase.com',
                source: 'gold_list' as const,
              },
            ],
          },
        ],
      },
      index
    );
    const resolved = out.orgConnectors?.[0].contacts?.[0];
    expect(resolved?.memberUid).toBe('uid-jk');
    expect(resolved?.imageUrl).toBe('https://img/jk.webp');
    expect(out.routeNodes?.[0].variant).toBe('member');
    expect((out as { contact?: { memberUid?: string } }).contact?.memberUid).toBe('uid-jk');
  });

  it('skips ambiguous name-only matches', () => {
    const out = enrichOrgConnectorContacts(
      {
        orgConnectors: [
          {
            name: 'Coinbase',
            description: 'x',
            tags: [],
            contacts: [{ name: 'Marc Johnson', source: 'gold_list' as const }],
          },
        ],
      },
      {
        byEmail: new Map(),
        membersByName: new Map(),
      }
    );
    expect(out.orgConnectors?.[0].contacts?.[0]?.memberUid).toBeUndefined();
  });
});
