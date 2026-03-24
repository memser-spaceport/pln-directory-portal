import { ArticleStatus } from '@prisma/client';
import { prisma } from '../index';

export async function articles() {
  const author = await prisma.member.findFirst({
    orderBy: { id: 'asc' },
    select: { uid: true },
  });

  if (!author) {
    throw new Error('No Member found for articles seed');
  }

  const team = await prisma.team.findFirst({
    orderBy: { id: 'asc' },
    select: { uid: true },
  });

  return [
    {
      uid: 'article_entity_formation',
      slugURL: 'entity-formation-101',
      title: 'Entity Formation 101: Choosing the Right Structure',
      summary:
        'A practical guide to selecting the right legal entity for your startup, covering C-Corps, LLCs, and international options.',
      category: 'Legal & Finance',
      tags: ['legal', 'incorporation', 'c-corp', 'llc'],
      content: `When starting a company, one of the first decisions you'll face is choosing a legal entity. Most venture-backed startups incorporate as Delaware C-Corporations, and for good reason — the legal framework is well-understood by investors, and it simplifies equity distribution.

However, a C-Corp isn't always the right choice. If you're bootstrapping, an LLC might offer more flexibility and tax advantages. For international founders, understanding the interplay between your home-country entity and a US-based subsidiary is critical.

Key considerations include:
- **Liability protection**: Both C-Corps and LLCs provide personal liability shields.
- **Tax treatment**: C-Corps face double taxation; LLCs offer pass-through taxation.
- **Investor expectations**: Most VCs require C-Corp structure for investment.
- **Equity issuance**: C-Corps make it straightforward to issue stock options.

Talk to a qualified startup attorney before making this decision. The cost of restructuring later far exceeds the cost of getting it right from the start.`,
      readingTime: 1,
      authorMemberUid: author.uid,
      authorTeamUid: team?.uid ?? null,
      status: ArticleStatus.PUBLISHED,
      publishedAt: new Date('2026-01-15T10:00:00.000Z'),
    },
    {
      uid: 'article_cap_table',
      slugURL: 'cap-table-management',
      title: 'Cap Table Management for Early-Stage Founders',
      summary: 'How to structure, maintain, and avoid common mistakes with your capitalization table from day one.',
      category: 'Legal & Finance',
      tags: ['cap-table', 'equity', 'fundraising'],
      content: `Your cap table is the single source of truth for who owns what in your company. Getting it wrong early can create expensive legal problems down the road.

At its simplest, a cap table tracks:
- Founders' equity splits
- Employee stock option pool (typically 10-20%)
- Investor ownership from each funding round
- SAFEs and convertible notes (and their conversion terms)

Common mistakes to avoid:
1. **Uneven founder splits without vesting**: Always implement 4-year vesting with a 1-year cliff, even among co-founders.
2. **Ignoring the option pool**: Plan for dilution. A 15-20% option pool is standard at seed stage.
3. **Not using a cap table tool**: Spreadsheets break. Use Carta, Pulley, or AngelList Stack.
4. **Forgetting 409A valuations**: Required for issuing options. Get one before your first hire.

Keep your cap table updated after every transaction — SAFEs, options grants, and funding rounds. Your future self (and your lawyers) will thank you.`,
      readingTime: 1,
      authorMemberUid: author.uid,
      authorTeamUid: team?.uid ?? null,
      status: ArticleStatus.PUBLISHED,
      publishedAt: new Date('2026-01-22T10:00:00.000Z'),
    },
    {
      uid: 'article_visa_options',
      slugURL: 'visa-options-for-founders',
      title: 'US Visa Options for International Founders',
      summary:
        'An overview of visa pathways available to international founders building startups in the United States.',
      category: 'US Visa / Immigration',
      tags: ['visa', 'immigration', 'o1', 'e2', 'international'],
      content: `If you're a non-US founder looking to build in the United States, understanding your visa options is essential. The good news: there are multiple pathways, each with different requirements and timelines.

**O-1A (Extraordinary Ability)**
The gold standard for founders. Requires demonstrating extraordinary ability through achievements like awards, press coverage, high compensation, or critical contributions to distinguished organizations. Processing time: 2-4 months (or 15 days with premium processing).

**E-2 (Treaty Investor)**
Available to nationals of treaty countries. Requires a "substantial" investment (typically $100K+) in a US business. Valid for 2-5 years and renewable. Does not lead directly to a green card.

**H-1B (Specialty Occupation)**
The most common work visa, but tricky for founders. You can sponsor yourself if the company has a board that controls your employment. Subject to an annual lottery with a ~25% selection rate.

**L-1A (Intracompany Transfer)**
If you have an existing company abroad and want to transfer to a US office. Requires at least one year of employment with the foreign entity.

**International Entrepreneur Parole (IEP)**
A relatively new pathway for founders who have raised significant capital ($250K+ from US investors) or received government grants. Grants a 2.5-year stay, renewable once.

Work with an immigration attorney who specializes in startup founders. The landscape changes frequently, and the right strategy depends on your specific situation.`,
      readingTime: 2,
      authorMemberUid: author.uid,
      authorTeamUid: team?.uid ?? null,
      status: ArticleStatus.PUBLISHED,
      publishedAt: new Date('2026-02-05T10:00:00.000Z'),
    },
    {
      uid: 'article_press_coverage',
      slugURL: 'getting-press-coverage',
      title: 'How to Get Press Coverage for Your Startup',
      summary:
        'Practical tips for writing press releases, pitching journalists, and building a media narrative from scratch.',
      category: 'Press & PR',
      tags: ['press', 'media', 'pr', 'launch'],
      content: `Press coverage can be a powerful growth lever, but most founders approach it wrong. Here's what actually works.

**Before you pitch:**
- Have a clear narrative. "We raised money" is not a story. "We solved X problem that affects Y people" is.
- Build a media list of 20-30 relevant journalists. Read their recent articles. Understand what they cover.
- Prepare assets: founder headshots, product screenshots, a one-page fact sheet.

**The pitch email:**
Keep it under 200 words. Lead with the hook. Include one or two data points. End with an offer for an exclusive or early access.

**Timing matters:**
- Avoid Mondays and Fridays
- Pitch 2-3 weeks before your desired publish date
- Embargo strategy: offer an exclusive to one top-tier outlet

**After publication:**
- Amplify on social media within the first hour
- Share with your network and ask them to engage
- Follow up with the journalist — thank them and maintain the relationship

Remember: earned media compounds. Your first article makes the second one easier. Start with niche publications in your industry before targeting TechCrunch.`,
      readingTime: 1,
      authorMemberUid: author.uid,
      authorTeamUid: team?.uid ?? null,
      status: ArticleStatus.PUBLISHED,
      publishedAt: new Date('2026-02-12T10:00:00.000Z'),
    },
    {
      uid: 'article_first_hire',
      slugURL: 'making-your-first-hire',
      title: "Making Your First Hire: A Founder's Guide",
      summary:
        'How to identify, evaluate, and onboard your first employees — the decisions that shape your company culture.',
      category: 'Hire Handbook',
      tags: ['hiring', 'culture', 'team-building', 'compensation'],
      content: `Your first few hires will define your company's culture and trajectory. Here's how to approach it thoughtfully.

**When to hire:**
Don't hire too early. As a founder, you should do every job yourself first. This gives you the context to know what good looks like and to write a meaningful job description.

**Where to find candidates:**
- Your personal network (best source for first hires)
- Warm introductions from investors and advisors
- Twitter/X and niche communities
- AngelList Talent (now Wellfound)

**Compensation for early employees:**
- Below-market salary + meaningful equity (0.5-2% for first 5 employees)
- Use a standard vesting schedule: 4 years, 1-year cliff
- Be transparent about the company's financial position

**What to evaluate:**
For early-stage hires, optimize for:
1. Generalists over specialists
2. Self-starters who thrive in ambiguity
3. Cultural alignment with founding team values
4. Ability to wear multiple hats

**Onboarding:**
- Write down everything, even if it's rough
- Pair new hires with a founder for the first two weeks
- Set clear 30/60/90 day expectations

The wrong first hire can cost you 6+ months. Take your time, but don't let perfect be the enemy of good.`,
      readingTime: 2,
      authorMemberUid: author.uid,
      authorTeamUid: team?.uid ?? null,
      status: ArticleStatus.PUBLISHED,
      publishedAt: new Date('2026-02-20T10:00:00.000Z'),
    },
    {
      uid: 'article_seed_fundraising',
      slugURL: 'seed-fundraising-playbook',
      title: 'The Seed Fundraising Playbook',
      summary:
        'A step-by-step guide to raising your seed round, from building your investor pipeline to closing the deal.',
      category: 'Seed / Series A',
      tags: ['fundraising', 'seed', 'investors', 'pitch-deck'],
      content: `Raising a seed round is one of the most challenging and important milestones for any startup. Here's a practical playbook.

**Pre-fundraise checklist:**
- Pitch deck (10-12 slides max)
- Financial model (even a simple one)
- Data room (incorporation docs, cap table, key metrics)
- Target raise amount and use of funds

**Building your pipeline:**
Aim for 50-80 investor conversations. Not all will be relevant, but volume matters at seed stage. Sources:
- Warm introductions from other founders
- Your existing network
- Angel communities (AngelList, The Syndicate)
- Accelerator demo days

**The pitch meeting:**
- Lead with the problem and your unique insight
- Show traction (users, revenue, waitlist — whatever you have)
- Be specific about what you're building and why now
- Know your ask: how much, on what terms

**SAFEs vs. Priced Rounds:**
At seed, most rounds use SAFEs (Simple Agreement for Future Equity). They're faster, cheaper, and well-understood. Standard terms:
- Post-money SAFE (YC standard)
- Valuation cap: typically $5M-$20M at seed
- No discount (or 20% discount in some cases)

**Closing:**
- Create urgency without being pushy
- Get a lead investor first — others will follow
- Wire instructions should be ready to go
- Celebrate, then get back to building

The best fundraising advice: build something people want, and the money will follow.`,
      readingTime: 2,
      authorMemberUid: author.uid,
      authorTeamUid: team?.uid ?? null,
      status: ArticleStatus.PUBLISHED,
      publishedAt: new Date('2026-03-01T10:00:00.000Z'),
    },
    {
      uid: 'article_pl_brand',
      slugURL: 'pl-brand-usage-guidelines',
      title: 'PL Brand Usage Guidelines for Portfolio Companies',
      summary: 'How to correctly use the Protocol Labs brand, logo, and co-marketing assets in your communications.',
      category: 'PL Brand Use',
      tags: ['brand', 'guidelines', 'logo', 'marketing'],
      content: `As a Protocol Labs portfolio company, you have access to co-marketing opportunities and brand assets. Here's how to use them correctly.

**Logo usage:**
- Use the official PL logo files provided in the brand kit
- Maintain minimum clear space around the logo
- Do not modify, rotate, or recolor the logo
- Do not place the logo on busy backgrounds

**Co-marketing language:**
Approved: "Backed by Protocol Labs" or "A Protocol Labs portfolio company"
Not approved: "A Protocol Labs company" or "Part of Protocol Labs"

**Press mentions:**
- Always use "Protocol Labs" (not "PL" or "ProtocolLabs") in press materials
- Coordinate with the PL communications team for joint announcements
- Share drafts of press releases mentioning PL at least 5 business days in advance

**Social media:**
- Tag @ProtocolLabs in relevant posts
- Use approved hashtags for campaigns
- Do not imply PL endorsement of specific claims about your product

**Event sponsorships:**
- PL logo placement should follow the brand guidelines
- Coordinate booth materials with the PL events team
- Use the co-branded template deck for joint presentations

For questions, reach out to the brand team at brand@protocol.ai.`,
      readingTime: 1,
      authorMemberUid: author.uid,
      authorTeamUid: team?.uid ?? null,
      status: ArticleStatus.PUBLISHED,
      publishedAt: new Date('2026-03-10T10:00:00.000Z'),
    },
    {
      uid: 'article_token_launch',
      slugURL: 'token-launch-fundamentals',
      title: 'Token Launch Fundamentals for Web3 Founders',
      summary:
        'Token design, regulatory considerations, and launch mechanics for Web3 projects planning a token launch.',
      category: 'Crypto & Token Launch',
      tags: ['token', 'web3', 'crypto', 'tokenomics', 'regulatory'],
      content: `Launching a token is one of the most complex and consequential decisions a Web3 project can make. This guide covers the fundamentals.

**Token design:**
Before anything else, answer: why does your project need a token? Valid reasons include:
- Decentralized governance
- Network incentive alignment
- Access/utility within your protocol
- Economic coordination among participants

**Tokenomics basics:**
- Total supply and emission schedule
- Allocation: team, investors, community, ecosystem fund, treasury
- Vesting schedules (typically 1-4 years for team and investors)
- Inflation/deflation mechanics

**Regulatory considerations:**
This is the most critical area. Work with specialized crypto counsel.
- Howey Test: Is your token a security?
- Jurisdiction matters: US, EU (MiCA), Singapore, and others have different frameworks
- Airdrops, sales, and distributions each have different regulatory implications
- KYC/AML requirements for token sales

**Launch mechanics:**
- Liquidity bootstrapping pools (LBPs) for fair launch
- Centralized exchange listings vs. DEX-first strategy
- Community building before launch (Discord, governance forums)
- Token Generation Event (TGE) planning and execution

**Post-launch:**
- Governance framework and voting mechanisms
- Treasury management and diversification
- Ongoing compliance monitoring
- Community engagement and transparency

Do not rush a token launch. Many successful projects waited years before introducing a token. The regulatory landscape is evolving rapidly — stay informed and stay compliant.`,
      readingTime: 2,
      authorMemberUid: author.uid,
      authorTeamUid: team?.uid ?? null,
      status: ArticleStatus.PUBLISHED,
      publishedAt: new Date('2026-03-15T10:00:00.000Z'),
    },
    {
      uid: 'article_draft_compliance',
      slugURL: 'compliance-checklist-draft',
      title: 'Startup Compliance Checklist (Draft)',
      summary: 'A work-in-progress checklist of compliance requirements for early-stage startups.',
      category: 'Legal & Finance',
      tags: ['compliance', 'legal', 'checklist'],
      content: `This article is still being written. It will cover the key compliance requirements that startups need to address in their first year of operation, including state registrations, tax obligations, employment law, and data privacy requirements.

Topics to be covered:
- Federal and state tax registrations
- Employment law basics (offer letters, at-will employment, contractor vs. employee)
- Data privacy (GDPR, CCPA)
- Industry-specific regulations
- Insurance requirements

Check back soon for the full guide.`,
      readingTime: 1,
      authorMemberUid: author.uid,
      authorTeamUid: team?.uid ?? null,
      status: ArticleStatus.DRAFT,
      publishedAt: null,
    },
    {
      uid: 'article_draft_series_a',
      slugURL: 'series-a-readiness-draft',
      title: 'Are You Ready for Series A? (Draft)',
      summary: 'Draft guide on evaluating your readiness for a Series A raise and what metrics investors look for.',
      category: 'Seed / Series A',
      tags: ['series-a', 'fundraising', 'metrics', 'growth'],
      content: `This article is in progress. It will cover the key benchmarks and signals that indicate Series A readiness.

Planned sections:
- Revenue and growth metrics (ARR, MRR growth rate, net revenue retention)
- Product-market fit signals
- Team composition and org chart readiness
- Unit economics (CAC, LTV, payback period)
- Market size and competitive positioning
- Board composition and governance

Draft notes: Most Series A rounds in 2026 require $1-2M ARR with 15-20% month-over-month growth, or equivalent non-revenue traction metrics for pre-revenue companies.`,
      readingTime: 1,
      authorMemberUid: author.uid,
      authorTeamUid: team?.uid ?? null,
      status: ArticleStatus.DRAFT,
      publishedAt: null,
    },
  ];
}

export async function articleStatistics() {
  const members = await prisma.member.findMany({
    take: 3,
    orderBy: { id: 'asc' },
    select: { uid: true },
  });

  if (members.length < 2) {
    throw new Error('Need at least 2 members for articleStatistics seed');
  }

  return [
    // Member 1 viewed and liked the entity formation article
    {
      uid: 'article_stat_1',
      articleUid: 'article_entity_formation',
      memberUid: members[0].uid,

      viewCount: 3,
      likeCount: 1,
    },
    // Member 2 viewed the entity formation article
    {
      uid: 'article_stat_2',
      articleUid: 'article_entity_formation',
      memberUid: members[1].uid,

      viewCount: 1,
      likeCount: 0,
    },
    // Member 1 viewed and liked the visa article
    {
      uid: 'article_stat_3',
      articleUid: 'article_visa_options',
      memberUid: members[0].uid,

      viewCount: 2,
      likeCount: 1,
    },
    // Member 2 viewed and liked the seed fundraising article
    {
      uid: 'article_stat_4',
      articleUid: 'article_seed_fundraising',
      memberUid: members[1].uid,

      viewCount: 5,
      likeCount: 1,
    },
    // Member 1 viewed the press coverage article
    {
      uid: 'article_stat_5',
      articleUid: 'article_press_coverage',
      memberUid: members[0].uid,

      viewCount: 1,
      likeCount: 0,
    },
    // Member 3 (if exists) viewed and liked the token launch article
    ...(members[2]
      ? [
          {
            uid: 'article_stat_6',
            articleUid: 'article_token_launch',
            memberUid: members[2].uid,
      
            viewCount: 4,
            likeCount: 1,
          },
        ]
      : []),
  ];
}

export async function articleWhitelists() {
  const members = await prisma.member.findMany({
    take: 2,
    orderBy: { id: 'asc' },
    select: { uid: true },
  });

  if (!members.length) {
    throw new Error('No Member found for articleWhitelists seed');
  }

  return members.map((m) => ({
    memberUid: m.uid,
  }));
}
