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
      authorTeamUid: null,
      status: ArticleStatus.PUBLISHED,
      scopes: ['PLVS'],
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
      authorMemberUid: null,
      authorTeamUid: team?.uid ?? null,
      status: ArticleStatus.PUBLISHED,
      scopes: ['PLCC'],
      publishedAt: new Date('2026-01-22T10:00:00.000Z'),
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
      authorTeamUid: null,
      status: ArticleStatus.PUBLISHED,
      scopes: [],
      publishedAt: new Date('2026-03-01T10:00:00.000Z'),
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
      authorTeamUid: null,
      status: ArticleStatus.DRAFT,
      scopes: ['PLVS'],
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
      authorMemberUid: null,
      authorTeamUid: team?.uid ?? null,
      status: ArticleStatus.DRAFT,
      scopes: [],
      publishedAt: null,
    },
  ];
}

export async function articleStatistics() {
  const members = await prisma.member.findMany({
    take: 2,
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
    // Member 2 viewed and liked the seed fundraising article
    {
      uid: 'article_stat_4',
      articleUid: 'article_seed_fundraising',
      memberUid: members[1].uid,

      viewCount: 5,
      likeCount: 1,
    },
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
