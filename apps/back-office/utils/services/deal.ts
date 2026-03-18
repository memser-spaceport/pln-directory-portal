import { Deal, DealCounts, ReportedIssue, SubmittedDeal, TDealForm } from '../../screens/deals/types/deal';
import api from '../api';
import { API_ROUTE } from '../constants';

// ---------------------------------------------------------------------------
// Real API functions
// ---------------------------------------------------------------------------

interface DealsListParams {
  authToken: string | undefined;
  category?: string;
  search?: string;
}

export async function fetchDealsList(params: DealsListParams): Promise<{ data: Deal[] }> {
  const response = await api.get<Deal[]>(API_ROUTE.ADMIN_DEALS, {
    headers: { authorization: `Bearer ${params.authToken}` },
    params: {
      ...(params.category && { category: params.category }),
      ...(params.search && { search: params.search }),
    },
  });
  return { data: response.data };
}

export async function createDeal(params: { authToken: string | undefined; payload: TDealForm }): Promise<Deal> {
  const response = await api.post<Deal>(API_ROUTE.ADMIN_DEALS, params.payload, {
    headers: { authorization: `Bearer ${params.authToken}` },
  });
  return response.data;
}

export async function updateDeal(params: {
  authToken: string | undefined;
  uid: string;
  payload: Partial<TDealForm & { status: string }>;
}): Promise<Deal> {
  const response = await api.patch<Deal>(`${API_ROUTE.ADMIN_DEALS}/${params.uid}`, params.payload, {
    headers: { authorization: `Bearer ${params.authToken}` },
  });
  return response.data;
}

// ---------------------------------------------------------------------------
// Mocked functions — backend endpoints not yet available
// ---------------------------------------------------------------------------

const MOCK_SUBMITTED_DEALS: SubmittedDeal[] = [
  {
    uid: 'sub-001',
    vendorName: 'AWS Activate',
    submittedBy: 'Alice Johnson',
    submittedByEmail: 'alice@startup.io',
    category: 'Cloud Computing',
    description: 'AWS Activate provides startups with free credits and resources.',
    submittedAt: '2026-03-10T09:00:00.000Z',
  },
  {
    uid: 'sub-002',
    vendorName: 'Stripe Atlas',
    submittedBy: 'Bob Smith',
    submittedByEmail: 'bob@newco.com',
    category: 'Finance & Legal',
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
  return { catalog: 0, submitted: MOCK_SUBMITTED_DEALS.length, issues: MOCK_REPORTED_ISSUES.length };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
