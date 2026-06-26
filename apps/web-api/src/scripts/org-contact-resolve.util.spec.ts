import { enrichOrgConnectorContacts, hydratePersonRouteNodes } from './org-contact-resolve.util';

describe('enrichOrgConnectorContacts', () => {
  const index = {
    byEmail: new Map([['jonathan.king@coinbase.com', { uid: 'uid-jk', imageUrl: 'https://img/jk.webp' }]]),
    byUid: new Map([
      ['uid-jk', { uid: 'uid-jk', imageUrl: 'https://img/jk.webp', email: 'jonathan.king@coinbase.com' }],
    ]),
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
        byUid: new Map(),
        membersByName: new Map(),
      }
    );
    expect(out.orgConnectors?.[0].contacts?.[0]?.memberUid).toBeUndefined();
  });
});

describe('hydratePersonRouteNodes', () => {
  const index = {
    byEmail: new Map([
      [
        'alicia@modularglobe.xyz',
        {
          uid: 'uid-alicia',
          email: 'alicia@modularglobe.xyz',
          imageUrl: 'https://img/alicia.webp',
          linkedin: 'alicia-mer',
          telegram: 'aliciamer',
        },
      ],
    ]),
    byUid: new Map([
      [
        'uid-alicia',
        {
          uid: 'uid-alicia',
          email: 'alicia@modularglobe.xyz',
          imageUrl: 'https://img/alicia.webp',
          linkedin: 'alicia-mer',
          telegram: 'aliciamer',
        },
      ],
    ]),
    membersByName: new Map([['alicia mer', 'uid-alicia']]),
  };

  it('hydrates bridge founder and investor with LabOS profile + Affinity email', () => {
    const out = hydratePersonRouteNodes(
      [
        { label: 'Protocol Labs', variant: 'org' },
        { label: 'Alicia Mer', orgName: 'Modular Globe', variant: 'external' },
        { label: 'Lukas Brandt', variant: 'external', memberUid: 'uid-lukas' },
      ],
      {
        investor: {
          firstName: 'Lukas',
          lastName: 'Brandt',
          memberUid: 'uid-lukas',
          email: 'lukas@example.com',
        },
        bridgeContact: {
          name: 'Alicia Mer',
          role: 'CEO & Co-founder',
          teams: [{ name: 'Modular Globe', teamUid: 'team-mg' }],
        },
      },
      index
    );
    const alicia = out[1];
    expect(alicia).toMatchObject({
      label: 'Alicia Mer',
      orgName: 'Modular Globe',
      role: 'CEO & Co-founder',
      memberUid: 'uid-alicia',
      email: 'alicia@modularglobe.xyz',
      linkedin: 'alicia-mer',
      telegram: 'aliciamer',
      imageUrl: 'https://img/alicia.webp',
      variant: 'member',
    });
    expect(out[2]).toMatchObject({
      label: 'Lukas Brandt',
      memberUid: 'uid-lukas',
      email: 'lukas@example.com',
    });
  });
});
