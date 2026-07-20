import { isDuplicateNewsStory } from './news-dedup';

describe('isDuplicateNewsStory', () => {
  it('deduplicates the same URL despite tracking parameters and different titles', () => {
    expect(
      isDuplicateNewsStory(
        {
          sourceUrl: 'https://example.com/story?utm_source=x',
          title: 'Protocol launches v2',
        },
        {
          sourceUrl: 'https://www.example.com/story',
          title: 'Protocol announces second version',
        }
      )
    ).toBe(true);
  });

  it('deduplicates the same story reported by different sources', () => {
    expect(
      isDuplicateNewsStory(
        {
          sourceUrl: 'https://a.example/news',
          title: 'Acme raises $20 million Series A',
          summary: 'Acme raised $20 million to expand its network.',
        },
        {
          sourceUrl: 'https://b.example/article',
          title: 'Acme secures $20 million in Series A funding',
          summary: 'The company will use the funding to expand its network.',
        }
      )
    ).toBe(true);
  });

  it('deduplicates the real Impossible Cloud Bithumb story', () => {
    expect(
      isDuplicateNewsStory(
        {
          sourceUrl:
            'https://koinbulteni.com/en/new-listing-from-south-korean-giant-trading-opens-281185.html',
          title: 'ICNT listed on Bithumb for Korean Won trading',
          summary:
            "South Korea's major exchange opens ICNT/KRW spot pair, expanding retail access to the DePIN cloud storage token in one of Asia's largest crypto markets.",
        },
        {
          sourceUrl:
            'https://coinmarketcap.com/community/articles/6a4cac26f1763749b31a8c4c',
          title:
            'ICNT token listed on Bithumb with Korean Won trading pair',
          summary:
            "South Korean exchange Bithumb opened KRW-denominated trading at 08:00 UTC, expanding ICNT's retail accessibility in one of Asia's largest crypto markets; exchange assigned a Caution designation for high volatility.",
        }
      )
    ).toBe(true);
  });

  it('deduplicates the real CoinList Superstate story', () => {
    expect(
      isDuplicateNewsStory(
        {
          sourceUrl: 'https://coinlist.co/superstate',
          title:
            'CoinList announces tokenized equity access via Superstate partnership',
          summary:
            'Users will receive natively tokenized IPO and follow-on offering shares minted directly to their wallets on Solana or Ethereum, usable as DeFi collateral; waitlist now open.',
        },
        {
          sourceUrl:
            'https://x.com/CoinList/status/2075234760310575119',
          title:
            'CoinList and Passage to offer tokenized equities via Superstate partnership',
          summary:
            'Real SEC-registered shares minted directly to self-custodial wallets on Solana or Ethereum; usable as DEX collateral or deposited into vaults. Waitlist now open.',
        }
      )
    ).toBe(true);
  });

  it('deduplicates the real Cryptio Robinhood Chain story despite different event types upstream', () => {
    expect(
      isDuplicateNewsStory(
        {
          sourceUrl:
            'https://www.linkedin.com/posts/cryptio_cryptio-now-supports-robinhood-chain-following-activity-7480548787065806848-ZTQa',
          title:
            "Cryptio adds support for Robinhood Chain's new Layer 2 network",
          summary:
            'Finance teams on the chain can now transform on-chain activity into reconciled, audit-ready records with automated ERP workflows; the integration targets tokenized real-world asset and financial services use cases.',
        },
        {
          sourceUrl:
            'https://x.com/cryptio_co/status/2074783058625007934',
          title:
            'Cryptio adds support for Robinhood Chain Layer 2',
          summary:
            "Teams building on Robinhood's new L2 for tokenized real-world assets and AI-enabled applications can use Cryptio to convert on-chain activity into audit-ready accounting records.",
        }
      )
    ).toBe(true);
  });

  it('deduplicates the real Payy Monaris story', () => {
    expect(
      isDuplicateNewsStory(
        {
          sourceUrl:
            'https://x.com/payy_link/status/2075291505825132584',
          title:
            'Monaris joins Payy ecosystem as private credit layer for stablecoin businesses',
          summary:
            'Monaris will build business credit scoring from programmable cashflow data on Payy, moving financial identity from bank statements to on-chain payment history.',
        },
        {
          sourceUrl:
            'https://payy.network/blog/ecosystem-highlight-monaris-joins-payy',
          title:
            'Monaris joins Payy ecosystem to build private credit infrastructure',
          summary:
            'Monaris will provide a credit layer for stablecoin-native businesses, enabling private creditworthiness scoring based on programmable cashflow rather than bank statements.',
        }
      )
    ).toBe(true);
  });

  it('deduplicates the real Gensyn ICML story', () => {
    expect(
      isDuplicateNewsStory(
        {
          sourceUrl:
            'https://x.com/gensynai/status/2075375448553398333',
          title:
            'Gensyn presents four research papers at ICML 2026 in Seoul',
          summary:
            "The team attended ICML, co-hosted a networking coworking space near the conference venue, and CEO Ben Fielding gave a joint talk with Optiver on verifiable AI's impact on financial infrastructure.",
        },
        {
          sourceUrl:
            'https://blockchain.news/flashnews/gensyn-joins-optiver-icml-2026-ai-finance-event',
          title:
            'Gensyn presents four research papers at ICML 2026 in Seoul',
          summary:
            'The team co-hosted a coworking and networking space near the ICML venue and held a fireside chat with Optiver on verifiable AI in financial infrastructure.',
        }
      )
    ).toBe(true);
  });

  it('keeps different stories from the same team', () => {
    expect(
      isDuplicateNewsStory(
        {
          sourceUrl: 'https://a.example/launch',
          title: 'Acme launches a new wallet',
          summary:
            'The mobile wallet supports payments and account recovery.',
        },
        {
          sourceUrl: 'https://b.example/funding',
          title: 'Acme raises a Series A round',
          summary:
            'The company raised funding to expand into new markets.',
        }
      )
    ).toBe(false);
  });

  it('keeps different integrations by the same company separate', () => {
    expect(
      isDuplicateNewsStory(
        {
          sourceUrl: 'https://example.com/cryptio-dfns',
          title: 'Cryptio integrates with DFNS custody platform',
          summary:
            'Finance teams can import DFNS custody activity into Cryptio.',
        },
        {
          sourceUrl: 'https://example.com/cryptio-copper',
          title: 'Cryptio integrates with Copper custody platform',
          summary:
            'Finance teams can import Copper custody activity into Cryptio.',
        }
      )
    ).toBe(false);
  });

  it('keeps separate launches by the same project', () => {
    expect(
      isDuplicateNewsStory(
        {
          sourceUrl: 'https://example.com/v2',
          title: 'Acme launches protocol version 2',
          summary:
            'Version 2 adds private transactions and lower fees.',
        },
        {
          sourceUrl: 'https://example.com/mobile',
          title: 'Acme launches mobile application',
          summary:
            'The application gives users access from iOS and Android.',
        }
      )
    ).toBe(false);
  });
});
