/**
 * LOCAL-ONLY demo seed for the PL Path Finder + warm-intros QA.
 *
 * The local Investor DB is empty, so warm-intros is blank and pathfinder ingest
 * FK-fails. This seed creates a coherent, variation-rich dataset so every UI
 * state can be exercised:
 *   - all 3 warm-intro tiers (co_invested / engaged / cold_match)
 *   - fit-score buckets hi (>=80) / mid (>=60) / lo (<60)
 *   - caliber A, caliber B, and cold (no path) proximity badges
 *   - single-path AND multi-path (best + alternatives) targets
 *   - has_path true (code badge) vs false (Cold badge)
 *   - LabOS badge (investor email matched to an existing member)
 *   - every email status, engagement tiers T1–T4
 *   - 2 portfolio teams in the dropdown + a crosswalk review row
 *
 * Idempotent: re-running deletes prior demo rows (by DEMO_SOURCE / TARGET_SET /
 * RUN_ID) then recreates. It reuses EXISTING teams/members (does not create
 * Team rows). NOT for production — run via `npm run api:seed-pathfinder-demo`.
 */
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const TARGET_SET = 'demo-neuro-lp';
const DEMO_SOURCE = 'DEMO_PATHFINDER';
const RUN_ID = 'demo-seed';

// Reused existing teams (verified present in the local DB).
const PRIMARY_TEAM = { uid: 'uid-kuhic-inc', name: 'Kuhic Inc' };
const SECONDARY_TEAM = { uid: 'uid-lockman-llc', name: 'Lockman LLC' };

// Reused existing APPROVED member emails → drive the LabOS badge (the mapper only
// links members whose memberApproval.state === 'APPROVED').
const LABOS_EMAIL_1 = 'Jalyn96@gmail.com';
const LABOS_EMAIL_2 = 'Lukas88@gmail.com';

type PathSpec = {
  connector: 'F' | 'VC' | 'JB' | 'PL' | 'O';
  hops: number;
  caliber: 'A' | 'B' | null;
  code: string;
  score: number;
  conf: number | null;
  /** intermediary node label(s) between PL and the target */
  via: string[];
  explanation: string;
};

type InvestorSpec = {
  id: string;
  first: string;
  last: string;
  firm: string;
  title: string;
  email?: string;
  emailStatus: string;
  investorType: string;
  /** comma-separated, matches ingest sector_tags convention */
  sectors: string;
  stage: string;
  geo: string;
  engagement: string;
  /** team uid this investor co-invested with PL on (→ co_invested tier) */
  overlapTeam?: string;
  /** [] = cold (no path) */
  paths: PathSpec[];
  /** "Who is this investor" enrichment → stored on rawPayload.enrichment. */
  enrichment?: {
    bio?: string;
    fundFocus?: string;
    aum?: string;
    notableInvestments?: string[];
    thesis?: string;
    sources?: string[];
    enrichedVia?: string;
    fetchedAt?: string;
  };
};

const CONNECTOR_NODE: Record<PathSpec['connector'], { id: string; type: 'person' | 'org' }> = {
  F: { id: 'founder', type: 'person' },
  VC: { id: 'covc', type: 'org' },
  JB: { id: 'jb', type: 'person' },
  PL: { id: 'plpartner', type: 'person' },
  O: { id: 'other', type: 'person' },
};

function buildHopChain(spec: PathSpec, inv: InvestorSpec) {
  const nodes = [
    { id: 'pl', label: 'Protocol Labs', type: 'org' as const },
    ...spec.via.map((label, i) => ({
      id: `${CONNECTOR_NODE[spec.connector].id}_${i}`,
      label,
      type: CONNECTOR_NODE[spec.connector].type,
    })),
    { id: inv.id, label: inv.firm, type: 'org' as const },
  ];
  const edges = nodes.slice(0, -1).map((n, i) => ({
    from: n.id,
    to: nodes[i + 1].id,
    connector_type: spec.connector,
    probability: Number(Math.pow(spec.score, 1 / (nodes.length - 1)).toFixed(3)),
    evidence: i === 0 ? 'PL relationship graph' : 'cap-table / rolodex',
  }));
  return { nodes, edges, explanation: spec.explanation };
}

// ── The dataset ───────────────────────────────────────────────────────────────
// Target team auto-fills sectors=[neurotech,ai], stage=series-a (set in meta).
const INVESTORS: InvestorSpec[] = [
  // ---- co_invested (overlap with PRIMARY team) ----
  {
    id: 'demo_lp_emerald_blue',
    enrichment: {
      bio: 'Dana Whitfield is Managing Partner at Emerald Blue Ventures, a neurotech- and AI-focused fund she co-founded in 2018 [1]. She previously led early-stage deals at Lux Capital and sits on three brain-computer-interface boards [2].',
      fundFocus: 'Early-stage neurotech, BCI, and applied AI',
      aum: '$420M across two funds',
      notableInvestments: ['Synchron', 'Modular Globe', 'Neuralis'],
      thesis:
        'Backs technical founders building the interface layer between brains and machines; prefers to lead seed and follow on at Series A [1].',
      sources: ['https://emeraldblue.vc/team/dana-whitfield', 'https://www.crunchbase.com/person/dana-whitfield'],
      enrichedVia: 'perplexity+exa+firecrawl',
      fetchedAt: '2026-06-05',
    },
    first: 'Dana',
    last: 'Whitfield',
    firm: 'Emerald Blue Ventures',
    title: 'Managing Partner',
    email: LABOS_EMAIL_1, // → LabOS badge
    emailStatus: 'verified',
    investorType: 'fund',
    sectors: 'neurotech,ai',
    stage: 'series-a',
    geo: 'US',
    engagement: 'T1_registered',
    overlapTeam: PRIMARY_TEAM.uid,
    paths: [
      {
        connector: 'VC',
        hops: 1,
        caliber: 'A',
        code: 'VC+1A',
        score: 0.92,
        conf: 0.9,
        via: ['Lux Capital (co-investor)'],
        explanation:
          'Reachable through Lux Capital, a co-investor with PL on a neurotech deal who has a strong, recent relationship with Emerald Blue.',
      },
      {
        connector: 'F',
        hops: 2,
        caliber: 'B',
        code: 'F+2B',
        score: 0.68,
        conf: 0.6,
        via: ['Jane Park (Modular Globe)', 'Sam Ortiz'],
        explanation: 'Alternative warm path via portfolio founder Jane Park and her former colleague Sam Ortiz.',
      },
    ],
  },
  {
    id: 'demo_lp_sequoia_capital',
    enrichment: {
      bio: "Marcus Reed is a Partner on Sequoia Capital's early-stage team, focused on frontier-tech and neurotech investments [1].",
      fundFocus: 'Multi-stage; frontier tech and neurotech',
      aum: '$85B+ (firm-wide)',
      notableInvestments: ['Modular Globe', 'Cortex Labs'],
      thesis: 'Looks for category-defining founders with deep technical moats [1][2].',
      sources: ['https://www.sequoiacap.com/people/marcus-reed', 'https://www.linkedin.com/in/marcus-reed'],
      enrichedVia: 'perplexity+exa+firecrawl',
      fetchedAt: '2026-06-05',
    },
    first: 'Marcus',
    last: 'Reed',
    firm: 'Sequoia Capital',
    title: 'Partner',
    emailStatus: 'verified',
    investorType: 'fund',
    sectors: 'neurotech',
    stage: 'series-a',
    geo: 'US',
    engagement: 'T2_clicked',
    overlapTeam: PRIMARY_TEAM.uid,
    paths: [
      {
        connector: 'F',
        hops: 1,
        caliber: 'A',
        code: 'F+1A',
        score: 0.9,
        conf: 0.88,
        via: ['Jane Park (Modular Globe founder)'],
        explanation: 'Direct intro through portfolio founder Jane Park, who is close with a senior partner at Sequoia.',
      },
      {
        connector: 'VC',
        hops: 2,
        caliber: 'B',
        code: 'VC+2B',
        score: 0.64,
        conf: 0.55,
        via: ['a16z (co-investor)', 'Priya N.'],
        explanation: 'Backup path via co-investor a16z and a shared LP contact.',
      },
    ],
  },
  {
    id: 'demo_lp_alpha_square',
    first: 'Helen',
    last: 'Cho',
    firm: 'Alpha Square Group',
    title: 'Principal',
    emailStatus: 'catch_all',
    investorType: 'family_office',
    sectors: 'neurotech',
    stage: 'series-a',
    geo: 'US',
    engagement: 'T3_opened',
    overlapTeam: PRIMARY_TEAM.uid,
    paths: [
      {
        connector: 'JB',
        hops: 2,
        caliber: 'B',
        code: 'JB+2B',
        score: 0.55,
        conf: 0.45,
        via: ['JB rolodex: Tom Vega', 'Alpha Square IR'],
        explanation: 'Reachable two hops out through the JB rolodex; relationship is warm but not senior.',
      },
    ],
  },
  {
    id: 'demo_lp_sosv',
    enrichment: {
      bio: 'Liang Wu is a General Partner at SOSV, where he runs the deep-tech and AI accelerator track [1].',
      fundFocus: 'Pre-seed and seed deep tech / AI',
      aum: '$1.5B',
      notableInvestments: ['Formic', 'NeuroFlow'],
      thesis: 'High-volume early bets on hard-tech founders, doubling down on the top decile [1].',
      sources: ['https://sosv.com/team/liang-wu'],
      enrichedVia: 'perplexity+exa',
      fetchedAt: '2026-06-05',
    },
    first: 'Liang',
    last: 'Wu',
    firm: 'SOSV',
    title: 'General Partner',
    emailStatus: 'verified',
    investorType: 'fund',
    sectors: 'ai',
    stage: 'seed',
    geo: 'Global',
    engagement: 'T1_registered',
    overlapTeam: PRIMARY_TEAM.uid,
    paths: [
      {
        connector: 'PL',
        hops: 1,
        caliber: 'A',
        code: 'PL+1A',
        score: 0.85,
        conf: 0.82,
        via: ['PL partner: Alex Mendez'],
        explanation: 'A PL partner has a direct, high-trust relationship with a GP at SOSV.',
      },
    ],
  },
  {
    id: 'demo_lp_oldslip_group',
    first: 'Rebecca',
    last: 'Stern',
    firm: 'Oldslip Group',
    title: 'Director',
    emailStatus: 'unverified',
    investorType: 'family_office',
    sectors: 'biotech', // no overlap with target sectors → low fit
    stage: 'series-b+',
    geo: 'US',
    engagement: 'T2_clicked',
    overlapTeam: PRIMARY_TEAM.uid,
    paths: [], // co-invested (warm by fit) BUT no proximity path → Cold badge
  },
  // ---- engaged (no overlap; T1–T3) ----
  {
    id: 'demo_lp_horizon_fund',
    enrichment: {
      bio: 'Owen Frye is a Partner at Horizon Fund covering neurotech and applied AI [1].',
      fundFocus: 'Seed–Series A neurotech & AI',
      aum: '$300M',
      notableInvestments: ['Synaptiq', 'Helix BCI'],
      thesis: 'Concentrated portfolio; leads rounds where the underlying science is defensible [1].',
      sources: ['https://horizon.fund/team/owen-frye'],
      enrichedVia: 'perplexity+firecrawl',
      fetchedAt: '2026-06-05',
    },
    first: 'Owen',
    last: 'Frye',
    firm: 'Horizon Fund',
    title: 'Partner',
    emailStatus: 'verified',
    investorType: 'fund',
    sectors: 'neurotech,ai',
    stage: 'series-a',
    geo: 'US',
    engagement: 'T1_registered',
    paths: [
      {
        connector: 'JB',
        hops: 1,
        caliber: 'A',
        code: 'JB+1A',
        score: 0.8,
        conf: 0.78,
        via: ['JB rolodex: Dr. Lena Hart'],
        explanation: 'One hop via a senior JB rolodex contact with a strong tie to Horizon.',
      },
    ],
  },
  {
    id: 'demo_lp_accolade',
    first: 'Grace',
    last: 'Lim',
    firm: 'Accolade Partners',
    title: 'Investor',
    emailStatus: 'verified',
    investorType: 'fund',
    sectors: 'ai',
    stage: 'seed',
    geo: 'US',
    engagement: 'T1_registered',
    paths: [
      {
        connector: 'PL',
        hops: 2,
        caliber: 'B',
        code: 'PL+2B',
        score: 0.5,
        conf: 0.4,
        via: ['PL partner: Alex Mendez', 'Accolade associate'],
        explanation: 'Two hops via a PL partner and an Accolade associate.',
      },
    ],
  },
  {
    id: 'demo_lp_northwind',
    first: 'Joel',
    last: 'Cummerata',
    firm: 'Northwind Capital',
    title: 'Vice President',
    email: LABOS_EMAIL_2, // → LabOS badge
    emailStatus: 'unverified',
    investorType: 'fund',
    sectors: 'neurotech',
    stage: 'seed',
    geo: 'Europe',
    engagement: 'T2_clicked',
    paths: [
      {
        connector: 'F',
        hops: 1,
        caliber: 'B',
        code: 'F+1B',
        score: 0.6,
        conf: 0.5,
        via: ['portfolio founder: Ravi S.'],
        explanation: 'Direct through a portfolio founder; relationship exists but seniority is mid-level.',
      },
    ],
  },
  {
    id: 'demo_lp_meridian',
    first: 'Tara',
    last: 'Boone',
    firm: 'Meridian Capital',
    title: 'Associate',
    emailStatus: 'catch_all',
    investorType: 'fund',
    sectors: 'ai',
    stage: 'series-a',
    geo: 'US',
    engagement: 'T3_opened',
    paths: [], // engaged but no proximity path → Cold badge
  },
  // ---- cold_match (T4; need sector overlap or they get dropped) ----
  {
    id: 'demo_lp_vertex_frontier',
    first: 'Noah',
    last: 'Kelly',
    firm: 'Vertex Frontier',
    title: 'Partner',
    emailStatus: 'verified',
    investorType: 'fund',
    sectors: 'ai',
    stage: 'seed',
    geo: 'US',
    engagement: 'T4_cold',
    paths: [
      {
        connector: 'O',
        hops: 2,
        caliber: 'B',
        code: 'O+2B',
        score: 0.45,
        conf: 0.35,
        via: ['conference contact', 'Vertex IR'],
        explanation: 'Cold on outreach, but a weak two-hop path exists via an "other" connector.',
      },
    ],
  },
  {
    id: 'demo_lp_quantum_leap',
    first: 'Mia',
    last: 'Hassan',
    firm: 'Quantum Leap Ventures',
    title: 'Managing Director',
    emailStatus: 'verified',
    investorType: 'fund',
    sectors: 'neurotech',
    stage: 'series-a',
    geo: 'US',
    engagement: 'T4_cold',
    paths: [], // classic cold match: sector/stage fit, no path
  },
  {
    id: 'demo_lp_summit_bio',
    first: 'Carl',
    last: 'Ng',
    firm: 'Summit Bio',
    title: 'Partner',
    emailStatus: 'invalid',
    investorType: 'fund',
    sectors: 'neurotech',
    stage: 'series-b+',
    geo: 'US',
    engagement: 'T4_cold',
    paths: [],
  },
  // ---- secondary team (so the dropdown has 2 portfolio teams) ----
  {
    id: 'demo_lp_lumen_bio',
    enrichment: {
      bio: 'Iris Vance is a Partner at Lumen Bioscience Ventures focused on biotech and DeSci [1].',
      fundFocus: 'Pre-seed biotech & DeSci',
      aum: '$120M',
      notableInvestments: ['BioForge', 'OpenCell'],
      thesis: 'Backs wet-lab founders bringing open-science models to therapeutics [1].',
      sources: ['https://lumenbio.vc/team/iris-vance'],
      enrichedVia: 'perplexity+exa',
      fetchedAt: '2026-06-05',
    },
    first: 'Iris',
    last: 'Vance',
    firm: 'Lumen Bioscience',
    title: 'Partner',
    emailStatus: 'verified',
    investorType: 'fund',
    sectors: 'biotech,desci',
    stage: 'pre-seed',
    geo: 'US',
    engagement: 'T2_clicked',
    overlapTeam: SECONDARY_TEAM.uid,
    paths: [
      {
        connector: 'F',
        hops: 1,
        caliber: 'A',
        code: 'F+1A',
        score: 0.88,
        conf: 0.85,
        via: ['portfolio founder: Dr. Omar Sy'],
        explanation: 'Direct via a portfolio founder with a strong relationship to Lumen.',
      },
    ],
  },
  {
    id: 'demo_lp_descience',
    first: 'Felix',
    last: 'Ward',
    firm: 'DeSci Labs',
    title: 'Investor',
    emailStatus: 'verified',
    investorType: 'angel',
    sectors: 'desci',
    stage: 'seed',
    geo: 'Europe',
    engagement: 'T1_registered',
    overlapTeam: SECONDARY_TEAM.uid,
    paths: [
      {
        connector: 'JB',
        hops: 2,
        caliber: 'B',
        code: 'JB+2B',
        score: 0.5,
        conf: 0.42,
        via: ['JB rolodex: Mara Klein', 'DeSci ops lead'],
        explanation: 'Two-hop path through the JB rolodex.',
      },
    ],
  },
];

async function cleanup() {
  await prisma.pathfinderPath.deleteMany({ where: { targetSet: TARGET_SET } });
  await prisma.pathfinderEntityCrosswalk.deleteMany({ where: { ingestRunId: RUN_ID } });
  // Records cascade-delete their overlaps + any remaining paths.
  await prisma.investorOutreachRecord.deleteMany({ where: { source: DEMO_SOURCE } });
  await prisma.plPortfolioTeamMeta.deleteMany({ where: { teamUid: { in: [PRIMARY_TEAM.uid, SECONDARY_TEAM.uid] } } });
}

async function seedTeamMeta() {
  await prisma.plPortfolioTeamMeta.create({
    data: {
      teamUid: PRIMARY_TEAM.uid,
      plInvestedStage: 'seed',
      raisingNow: 'yes',
      raisingStage: 'series-a',
      sectors: 'neurotech,ai',
      geo: 'US',
    },
  });
  await prisma.plPortfolioTeamMeta.create({
    data: {
      teamUid: SECONDARY_TEAM.uid,
      plInvestedStage: 'pre-seed',
      raisingNow: 'yes',
      raisingStage: 'seed',
      sectors: 'biotech,desci',
      geo: 'Europe',
    },
  });
}

async function seedInvestors() {
  let records = 0;
  let overlaps = 0;
  let paths = 0;
  for (const inv of INVESTORS) {
    const bestPath = inv.paths[0];
    const created = await prisma.investorOutreachRecord.create({
      data: {
        investorId: inv.id,
        dedupeKey: inv.id,
        canonicalId: inv.id,
        source: DEMO_SOURCE,
        firstName: inv.first,
        lastName: inv.last,
        email: inv.email ?? `${inv.id}@example.com`,
        emailStatus: inv.emailStatus,
        firm: inv.firm,
        title: inv.title,
        investorType: inv.investorType,
        sectorTags: inv.sectors,
        stageFocus: inv.stage,
        geoFocus: inv.geo,
        engagementTier: inv.engagement,
        enrichmentStatus: 'enriched',
        bestProximityCode: bestPath ? bestPath.code : null,
        hasPath: inv.paths.length > 0,
        rawPayload: inv.enrichment ? { enrichment: inv.enrichment } : undefined,
      },
    });
    records += 1;

    if (inv.overlapTeam) {
      await prisma.investorPortfolioOverlap.create({
        data: {
          investorOutreachRecordId: created.id,
          teamUid: inv.overlapTeam,
          dealStage: inv.stage,
          isLeadInvestor: false,
          sourceDataset: DEMO_SOURCE,
        },
      });
      overlaps += 1;
    }

    for (let i = 0; i < inv.paths.length; i++) {
      const spec = inv.paths[i];
      await prisma.pathfinderPath.create({
        data: {
          targetInvestorId: inv.id,
          targetSet: TARGET_SET,
          connectorType: spec.connector,
          hops: spec.hops,
          caliber: spec.caliber,
          proximityCode: spec.code,
          score: spec.score,
          caliberConfidence: spec.conf,
          hopChain: buildHopChain(spec, inv) as unknown as Prisma.InputJsonValue,
          rank: i + 1,
          ingestRunId: RUN_ID,
        },
      });
      paths += 1;
    }
  }
  return { records, overlaps, paths };
}

async function seedCrosswalk() {
  const rows: Prisma.PathfinderEntityCrosswalkCreateManyInput[] = [
    {
      canonicalId: 'demo_lp_sequoia_capital',
      investorId: 'demo_lp_sequoia_capital',
      affinityId: 'aff_001',
      entityType: 'org',
      displayName: 'Sequoia Capital',
      firm: 'Sequoia Capital',
      matchMethod: 'email',
      matchConfidence: 0.98,
      isConfirmed: true,
      needsReview: false,
      ingestRunId: RUN_ID,
    },
    {
      // founder-who-is-also-LP LINK (never merged)
      canonicalId: 'demo_person_jane_park',
      directoryUid: 'uid-kuhic-inc',
      investorId: 'demo_lp_emerald_blue',
      entityType: 'person',
      displayName: 'Jane Park',
      firm: 'Emerald Blue Ventures',
      matchMethod: 'cap_table',
      matchConfidence: 0.81,
      isConfirmed: false,
      isFounderLpLink: true,
      needsReview: false,
      ingestRunId: RUN_ID,
    },
    {
      // fuzzy candidate → human review queue
      canonicalId: 'demo_lp_alpha_square',
      investorId: 'demo_lp_alpha_square',
      affinityId: 'aff_777',
      entityType: 'org',
      displayName: 'Alpha Square Grp.',
      firm: 'Alpha Square Group',
      matchMethod: 'name_firm',
      matchConfidence: 0.62,
      isConfirmed: false,
      needsReview: true,
      ingestRunId: RUN_ID,
    },
  ];
  await prisma.pathfinderEntityCrosswalk.createMany({ data: rows });
  return rows.length;
}

async function main() {
  console.log('Cleaning prior demo data…');
  await cleanup();
  console.log('Seeding portfolio team meta…');
  await seedTeamMeta();
  console.log('Seeding investors + overlaps + paths…');
  const counts = await seedInvestors();
  console.log('Seeding crosswalk…');
  const crosswalk = await seedCrosswalk();
  console.log('— Demo seed complete —');
  console.log(
    `teams: 2 | investors: ${counts.records} | overlaps: ${counts.overlaps} | paths: ${counts.paths} | crosswalk: ${crosswalk}`
  );
  console.log(`Primary demo team to pick in the UI: "${PRIMARY_TEAM.name}" (${PRIMARY_TEAM.uid})`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
