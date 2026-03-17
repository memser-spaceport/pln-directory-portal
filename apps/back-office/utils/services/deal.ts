import { Deal, DealCounts, ReportedIssue, SubmittedDeal, TDealForm } from '../../screens/deals/types/deal';

// ---------------------------------------------------------------------------
// Mock data — replace with real API calls once the backend is implemented
// ---------------------------------------------------------------------------

const MOCK_DEALS: Deal[] = [
  {
    uid: 'deal-001',
    vendorName: 'Mixpanel',
    vendorLogoUrl: null,
    category: 'Analytics & Monitoring',
    audience: 'All Founders',
    markedAsUsingCount: null,
    tappedHowToRedeemCount: null,
    submittedIssuesCount: 0,
    status: 'Draft',
    updatedAt: '2026-01-25T15:30:00.000Z',
  },
  {
    uid: 'deal-002',
    vendorName: 'Vercel',
    vendorLogoUrl: null,
    category: 'Hosting & Infrastructure',
    audience: 'All Founders',
    markedAsUsingCount: 51,
    tappedHowToRedeemCount: 67,
    submittedIssuesCount: 1,
    status: 'Active',
    updatedAt: '2025-12-05T11:15:00.000Z',
  },
  {
    uid: 'deal-003',
    vendorName: 'GitHub',
    vendorLogoUrl: null,
    category: 'Developer Tools',
    audience: 'All Founders',
    markedAsUsingCount: 78,
    tappedHowToRedeemCount: 89,
    submittedIssuesCount: 0,
    status: 'Active',
    updatedAt: '2025-10-12T09:00:00.000Z',
  },
  {
    uid: 'deal-004',
    vendorName: 'Linear',
    vendorLogoUrl: null,
    category: 'Developer Tools',
    audience: 'PL Funded Founders',
    markedAsUsingCount: 40,
    tappedHowToRedeemCount: 42,
    submittedIssuesCount: 0,
    status: 'Active',
    updatedAt: '2025-08-22T19:20:00.000Z',
  },
  {
    uid: 'deal-005',
    vendorName: 'Figma',
    vendorLogoUrl: null,
    category: 'Design & Collaboration',
    audience: 'All Founders',
    markedAsUsingCount: 90,
    tappedHowToRedeemCount: 71,
    submittedIssuesCount: 2,
    status: 'Active',
    updatedAt: '2025-07-01T12:45:00.000Z',
  },
  {
    uid: 'deal-006',
    vendorName: 'Notion',
    vendorLogoUrl: null,
    category: 'Design & Collaboration',
    audience: 'All Founders',
    markedAsUsingCount: 65,
    tappedHowToRedeemCount: 31,
    submittedIssuesCount: 0,
    status: 'Active',
    updatedAt: '2025-05-15T16:10:00.000Z',
  },
  {
    uid: 'deal-007',
    vendorName: 'Supabase',
    vendorLogoUrl: null,
    category: 'Developer Tools',
    audience: 'All Founders',
    markedAsUsingCount: 30,
    tappedHowToRedeemCount: 105,
    submittedIssuesCount: 0,
    status: 'Active',
    updatedAt: '2025-04-08T08:55:00.000Z',
  },
  {
    uid: 'deal-008',
    vendorName: 'Datadog',
    vendorLogoUrl: null,
    category: 'Analytics & Monitoring',
    audience: 'All Founders',
    markedAsUsingCount: 25,
    tappedHowToRedeemCount: 18,
    submittedIssuesCount: 1,
    status: 'Active',
    updatedAt: '2025-02-14T13:25:00.000Z',
  },
  {
    uid: 'deal-009',
    vendorName: 'Sentry',
    vendorLogoUrl: null,
    category: 'Analytics & Monitoring',
    audience: 'All Founders',
    markedAsUsingCount: 70,
    tappedHowToRedeemCount: 38,
    submittedIssuesCount: 0,
    status: 'Active',
    updatedAt: '2024-12-30T18:00:00.000Z',
  },
  {
    uid: 'deal-010',
    vendorName: 'PostHog',
    vendorLogoUrl: null,
    category: 'Analytics & Monitoring',
    audience: 'All Founders',
    markedAsUsingCount: 85,
    tappedHowToRedeemCount: 58,
    submittedIssuesCount: 0,
    status: 'Active',
    updatedAt: '2024-11-11T10:30:00.000Z',
  },
  {
    uid: 'deal-011',
    vendorName: 'Cloudflare',
    vendorLogoUrl: null,
    category: 'Security & Compliance',
    audience: 'PL Funded Founders',
    markedAsUsingCount: 45,
    tappedHowToRedeemCount: 14,
    submittedIssuesCount: 0,
    status: 'Active',
    updatedAt: '2024-09-21T14:15:00.000Z',
  },
  {
    uid: 'deal-012',
    vendorName: '1Password',
    vendorLogoUrl: null,
    category: 'Security & Compliance',
    audience: 'All Founders',
    markedAsUsingCount: 9,
    tappedHowToRedeemCount: 14,
    submittedIssuesCount: 0,
    status: 'Deactivated',
    updatedAt: '2024-07-18T09:50:00.000Z',
  },
];

const MOCK_SUBMITTED_DEALS: SubmittedDeal[] = [
  {
    uid: 'sub-001',
    vendorName: 'AWS Activate',
    submittedBy: 'Alice Johnson',
    submittedByEmail: 'alice@startup.io',
    category: 'Cloud Computing',
    audience: 'All Founders',
    description: 'AWS Activate provides startups with free credits and resources.',
    submittedAt: '2026-03-10T09:00:00.000Z',
  },
  {
    uid: 'sub-002',
    vendorName: 'Stripe Atlas',
    submittedBy: 'Bob Smith',
    submittedByEmail: 'bob@newco.com',
    category: 'Finance & Legal',
    audience: 'All Founders',
    description: 'Stripe Atlas helps startups incorporate quickly and easily.',
    submittedAt: '2026-03-12T14:30:00.000Z',
  },
];

const MOCK_REPORTED_ISSUES: ReportedIssue[] = [
  {
    uid: 'issue-001',
    dealUid: 'deal-002',
    vendorName: 'Vercel',
    reportedBy: 'Carol White',
    reportedByEmail: 'carol@founder.dev',
    issueDescription: 'The promo code on the Vercel deal page is expired.',
    reportedAt: '2026-03-14T11:00:00.000Z',
  },
  {
    uid: 'issue-002',
    dealUid: 'deal-005',
    vendorName: 'Figma',
    reportedBy: 'Dan Brown',
    reportedByEmail: 'dan@designco.io',
    issueDescription: 'Figma deal link redirects to a 404 page.',
    reportedAt: '2026-03-15T16:45:00.000Z',
  },
  {
    uid: 'issue-003',
    dealUid: 'deal-008',
    vendorName: 'Datadog',
    reportedBy: 'Eve Davis',
    reportedByEmail: 'eve@monitoring.tech',
    issueDescription: 'The discount percentage listed is incorrect — shows 20% but actual is 10%.',
    reportedAt: '2026-03-16T08:20:00.000Z',
  },
];

// ---------------------------------------------------------------------------
// Service functions — swap internals for real API calls when backend is ready
// ---------------------------------------------------------------------------

interface DealsListParams {
  authToken: string | undefined;
  category?: string;
  audience?: string;
  status?: string;
}

export async function fetchDealsList(params: DealsListParams): Promise<{ data: Deal[] }> {
  // TODO: replace with: api.get(API_ROUTE.ADMIN_DEALS, { headers, params }).then(r => r.data)
  await delay(300);
  let results = [...MOCK_DEALS];
  if (params.category) results = results.filter((d) => d.category === params.category);
  if (params.audience) results = results.filter((d) => d.audience === params.audience);
  if (params.status) results = results.filter((d) => d.status === params.status);
  return { data: results };
}

export async function fetchSubmittedDeals(_params: { authToken: string | undefined }): Promise<{ data: SubmittedDeal[] }> {
  // TODO: replace with: api.get(API_ROUTE.ADMIN_SUBMITTED_DEALS, { headers }).then(r => r.data)
  await delay(300);
  return { data: MOCK_SUBMITTED_DEALS };
}

export async function fetchReportedIssues(_params: { authToken: string | undefined }): Promise<{ data: ReportedIssue[] }> {
  // TODO: replace with: api.get(API_ROUTE.ADMIN_REPORTED_ISSUES, { headers }).then(r => r.data)
  await delay(300);
  return { data: MOCK_REPORTED_ISSUES };
}

export async function fetchDealCounts(_params: { authToken: string | undefined }): Promise<DealCounts> {
  // TODO: replace with: api.get(API_ROUTE.ADMIN_DEALS_COUNTS, { headers }).then(r => r.data)
  await delay(200);
  return { catalog: MOCK_DEALS.length, submitted: MOCK_SUBMITTED_DEALS.length, issues: MOCK_REPORTED_ISSUES.length };
}

export async function createDeal(_params: { authToken: string | undefined; payload: TDealForm }): Promise<Deal> {
  // TODO: replace with: api.post(API_ROUTE.ADMIN_DEALS, payload, { headers }).then(r => r.data)
  await delay(500);
  const newDeal: Deal = {
    uid: `deal-${Date.now()}`,
    vendorName: _params.payload.vendorName,
    vendorLogoUrl: null,
    category: _params.payload.category,
    audience: _params.payload.audience ?? 'All Founders',
    markedAsUsingCount: null,
    tappedHowToRedeemCount: null,
    submittedIssuesCount: 0,
    status: _params.payload.status,
    updatedAt: new Date().toISOString(),
  };
  MOCK_DEALS.unshift(newDeal);
  return newDeal;
}

export async function updateDeal(_params: {
  authToken: string | undefined;
  uid: string;
  payload: Partial<TDealForm & { status: string }>;
}): Promise<Deal> {
  // TODO: replace with: api.patch(`${API_ROUTE.ADMIN_DEALS}/${uid}`, payload, { headers }).then(r => r.data)
  await delay(500);
  const idx = MOCK_DEALS.findIndex((d) => d.uid === _params.uid);
  if (idx !== -1) {
    MOCK_DEALS[idx] = {
      ...MOCK_DEALS[idx],
      ...(_params.payload.vendorName && { vendorName: _params.payload.vendorName }),
      ...(_params.payload.category && { category: _params.payload.category }),
      ...(_params.payload.audience && { audience: _params.payload.audience }),
      ...(_params.payload.status && { status: _params.payload.status as Deal['status'] }),
      updatedAt: new Date().toISOString(),
    };
    return MOCK_DEALS[idx];
  }
  throw new Error('Deal not found');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
