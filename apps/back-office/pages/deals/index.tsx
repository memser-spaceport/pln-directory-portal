import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { flexRender, PaginationState, SortingState, Table } from '@tanstack/react-table';
import { useCookie } from 'react-use';
import clsx from 'clsx';

import s from './styles.module.scss';
import { ApprovalLayout } from '../../layout/approval-layout';
import { useAuth } from '../../context/auth-context';
import { SortIcon } from '../../screens/members/components/icons';
import PaginationControls from '../../screens/members/components/PaginationControls/PaginationControls';

import { useDealsList } from '../../hooks/deals/useDealsList';
import { useSubmittedDealsList } from '../../hooks/deals/useSubmittedDealsList';
import { useReportedIssuesList } from '../../hooks/deals/useReportedIssuesList';
import { useDealCounts } from '../../hooks/deals/useDealCounts';
import { useCreateDeal } from '../../hooks/deals/useCreateDeal';
import { useUpdateDeal } from '../../hooks/deals/useUpdateDeal';
import { useUpdateIssueStatus } from '../../hooks/deals/useUpdateIssueStatus';
import { useDealsWhitelist } from '../../hooks/deals/useDealsWhitelist';

import { DealsWhitelistSection } from '../../components/deals/DealsWhitelistSection';

import { useDealsTable } from '../../screens/deals/hooks/useDealsTable';
import { useSubmittedDealsTable } from '../../screens/deals/hooks/useSubmittedDealsTable';
import { useReportedIssuesTable } from '../../screens/deals/hooks/useReportedIssuesTable';

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import type { DealForm as DealFormType } from '../../screens/deals/components/DealForm/DealForm';

const DealForm = dynamic<ComponentProps<typeof DealFormType>>(
  () => import('../../screens/deals/components/DealForm/DealForm').then((m) => m.DealForm),
  { ssr: false }
);
import { Deal, DealStatus, IssueStatus, ReportedIssue, SubmittedDeal, TDealForm } from '../../screens/deals/types/deal';
import type { DealFormMode } from '../../screens/deals/components/DealForm/DealForm';
import { ReportedIssueModal } from '../../screens/deals/components/ReportedIssueModal/ReportedIssueModal';
import { approveSubmission } from '../../utils/services/deal';
import { DEAL_AUDIENCE_OPTIONS, DEAL_CATEGORIES } from '../../screens/deals/constants';

const STATUSES: { value: DealStatus; label: string }[] = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'DEACTIVATED', label: 'Deactivated' },
];

type Tab = 'catalog' | 'submitted' | 'issues' | 'access';

const DealsPage = () => {
  const router = useRouter();
  const { isDirectoryAdmin, isLoading, user } = useAuth();
  const [authToken] = useCookie('plnadmin');

  const tab = (router.query.tab as Tab | undefined) ?? 'catalog';

  const [catalogSorting, setCatalogSorting] = useState<SortingState>([]);
  const [catalogPagination, setCatalogPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [catalogFilter, setCatalogFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [audienceFilter, setAudienceFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<DealStatus | ''>('');

  const [submittedSorting, setSubmittedSorting] = useState<SortingState>([]);
  const [submittedPagination, setSubmittedPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [submittedFilter, setSubmittedFilter] = useState('');
  const [submittedCategoryFilter, setSubmittedCategoryFilter] = useState('');

  const [issuesSorting, setIssuesSorting] = useState<SortingState>([]);
  const [issuesPagination, setIssuesPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [issuesFilter, setIssuesFilter] = useState('');
  const [issuesStatusFilter, setIssuesStatusFilter] = useState<IssueStatus | ''>('');

  const [formOpen, setFormOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | undefined>();
  const [formMode, setFormMode] = useState<DealFormMode>('create');
  const [reviewingSubmissionUid, setReviewingSubmissionUid] = useState<string | null>(null);
  const [viewingIssue, setViewingIssue] = useState<ReportedIssue | null>(null);

  const { data: dealsData } = useDealsList({ authToken });
  const { data: submittedData } = useSubmittedDealsList({ authToken });
  const { data: issuesData } = useReportedIssuesList({ authToken });
  // TODO: fetchDealCounts must return real submitted count after API wiring
  const { data: counts } = useDealCounts({ authToken });
  const { data: whitelistData } = useDealsWhitelist({ authToken });

  const createDeal = useCreateDeal();
  const updateDeal = useUpdateDeal();
  const updateIssueStatus = useUpdateIssueStatus();

  const handleEdit = (deal: Deal) => {
    setEditingDeal(deal);
    setFormMode('edit');
    setReviewingSubmissionUid(null);
    setFormOpen(true);
  };

  const handleStatusChange = (uid: string, status: DealStatus) => {
    updateDeal.mutate({ authToken, uid, payload: { status } });
  };

  const handleIssueStatusChange = (uid: string, status: IssueStatus) => {
    updateIssueStatus.mutate(
      { authToken: authToken ?? undefined, uid, status },
      { onSuccess: () => setViewingIssue(null) }
    );
  };

  const handleFormSubmit = async (data: TDealForm) => {
    // Use editingDeal?.uid (not just editingDeal) so Review Deal pre-population
    // uses the create path — a submitted deal uid is not a catalog deal uid.
    if (editingDeal?.uid) {
      await updateDeal.mutateAsync({ authToken, uid: editingDeal.uid, payload: data });
    } else {
      await createDeal.mutateAsync({ authToken, payload: data });
      // Approve the submission after successfully creating the catalog deal
      if (reviewingSubmissionUid) {
        await approveSubmission({ authToken: authToken ?? undefined, uid: reviewingSubmissionUid, status: 'APPROVED' });
      }
    }
  };

  const handleReview = (submitted: SubmittedDeal) => {
    // Map SubmittedDeal → Deal for DealForm pre-population.
    // uid is intentionally empty so handleFormSubmit takes the createDeal path
    // (creating a catalog deal from the submission).
    setFormMode('complete');
    setReviewingSubmissionUid(submitted.uid);
    const prefilled: Deal = {
      uid: '',
      vendorName: submitted.vendorName,
      vendorTeamUid: submitted.vendorTeamUid,
      logoUid: submitted.logoUid,
      logoUrl: submitted.logo?.url ?? null,
      category: submitted.category,
      audience: submitted.audience,
      shortDescription: submitted.shortDescription,
      fullDescription: submitted.fullDescription,
      redemptionInstructions: submitted.redemptionInstructions,
      status: 'DRAFT',
      createdAt: submitted.createdAt,
      updatedAt: submitted.updatedAt,
      tappedHowToRedeemCount: 0,
      markedAsUsingCount: 0,
      submittedIssuesCount: 0,
    };
    setEditingDeal(prefilled);
    setFormOpen(true);
  };

  useEffect(() => {
    setCatalogPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [catalogFilter, categoryFilter, audienceFilter, statusFilter]);

  useEffect(() => {
    setSubmittedPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [submittedFilter, submittedCategoryFilter]);

  useEffect(() => {
    setIssuesPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [issuesFilter, issuesStatusFilter]);

  // Apply client-side filters on top of global filter
  const filteredDeals = useMemo(
    () =>
      (dealsData?.data ?? []).filter((deal) => {
        if (categoryFilter && deal.category !== categoryFilter) return false;
        if (audienceFilter && deal.audience !== audienceFilter) return false;
        if (statusFilter && deal.status !== statusFilter) return false;
        return true;
      }),
    [dealsData?.data, categoryFilter, audienceFilter, statusFilter]
  );

  const filteredSubmittedDeals = useMemo(
    () =>
      (submittedData?.data ?? []).filter((deal) => {
        if (submittedCategoryFilter && deal.category !== submittedCategoryFilter) return false;
        return true;
      }),
    [submittedData?.data, submittedCategoryFilter]
  );

  const { table: catalogTable } = useDealsTable({
    deals: filteredDeals,
    sorting: catalogSorting,
    setSorting: setCatalogSorting,
    pagination: catalogPagination,
    setPagination: setCatalogPagination,
    globalFilter: catalogFilter,
    setGlobalFilter: setCatalogFilter,
    onEdit: handleEdit,
    onStatusChange: handleStatusChange,
  });

  const { table: submittedTable } = useSubmittedDealsTable({
    deals: filteredSubmittedDeals,
    sorting: submittedSorting,
    setSorting: setSubmittedSorting,
    pagination: submittedPagination,
    setPagination: setSubmittedPagination,
    globalFilter: submittedFilter,
    setGlobalFilter: setSubmittedFilter,
    onReview: handleReview,
  });

  const filteredIssues = useMemo(
    () =>
      (issuesData?.data ?? []).filter((issue) => {
        if (issuesStatusFilter && issue.status !== issuesStatusFilter) return false;
        return true;
      }),
    [issuesData?.data, issuesStatusFilter]
  );

  const { table: issuesTable } = useReportedIssuesTable({
    issues: filteredIssues,
    sorting: issuesSorting,
    setSorting: setIssuesSorting,
    pagination: issuesPagination,
    setPagination: setIssuesPagination,
    globalFilter: issuesFilter,
    setGlobalFilter: setIssuesFilter,
    onStatusChange: handleIssueStatusChange,
    onView: setViewingIssue,
    onDeactivateDeal: (dealUid: string) => handleStatusChange(dealUid, 'DEACTIVATED'),
  });

  useEffect(() => {
    if (!authToken) {
      router.push(`/?backlink=${router.asPath}`);
    }
  }, [authToken, router]);

  useEffect(() => {
    if (!isLoading && user && !isDirectoryAdmin) {
      router.replace('/demo-days');
    }
  }, [isLoading, user, isDirectoryAdmin, router]);

  if (!isLoading && user && !isDirectoryAdmin) {
    return null;
  }

  const setTab = (t: Tab) => {
    router.replace({ query: { tab: t } }, undefined, { shallow: true });
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderTable = (activeTable: Table<any>, noTopBorder = false) => (
    <div className={clsx(s.table, { [s.tableWithControlBar]: noTopBorder })}>
      {activeTable.getHeaderGroups().map((headerGroup) => (
        <div key={headerGroup.id} className={s.tableRow}>
          {headerGroup.headers.map((header, i) =>
            header.isPlaceholder ? null : (
              <div
                key={header.id}
                className={clsx(s.headerCell, {
                  [s.first]: i === 0,
                  [s.sortable]: header.column.getCanSort(),
                  [s.fixed]: !!header.column.columnDef.size,
                  [s.flexible]: !header.column.columnDef.size,
                })}
                style={{
                  width: header.column.getSize(),
                  flexBasis: header.column.getSize(),
                  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                  // @ts-ignore
                  justifyContent: header.column.columnDef.meta?.align === 'center' ? 'center' : 'flex-start',
                }}
                onClick={header.column.getToggleSortingHandler()}
              >
                {flexRender(header.column.columnDef.header, header.getContext())}
                {header.column.getCanSort() && <SortIcon />}
              </div>
            )
          )}
        </div>
      ))}

      {activeTable.getRowModel().rows.length === 0 ? (
        <div className={s.emptyState}>No records found.</div>
      ) : (
        activeTable.getRowModel().rows.map((row) => (
          <div key={row.id} className={s.tableRow}>
            {row.getVisibleCells().map((cell, i) => (
              <div
                key={cell.id}
                className={clsx(s.bodyCell, {
                  [s.first]: i === 0,
                  [s.fixed]: !!cell.column.columnDef.size,
                  [s.flexible]: !cell.column.columnDef.size,
                })}
                style={{
                  width: cell.column.getSize(),
                  flexBasis: cell.column.getSize(),
                  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                  // @ts-ignore
                  justifyContent: cell.column.columnDef.meta?.align === 'center' ? 'center' : 'flex-start',
                }}
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );

  return (
    <ApprovalLayout>
      <div className={s.root}>
        <div className={s.header}>
          <span className={s.title}>Deals</span>
        </div>

        <div className={s.tabs}>
          <button className={clsx(s.tab, { [s.active]: tab === 'catalog' })} onClick={() => setTab('catalog')}>
            Deals Catalog
            <span className={clsx(s.tabCount, { [s.active]: tab === 'catalog' })}>
              {counts?.catalog ?? dealsData?.data?.length ?? 0}
            </span>
          </button>
          <button className={clsx(s.tab, { [s.active]: tab === 'submitted' })} onClick={() => setTab('submitted')}>
            Submitted Deals
            <span className={clsx(s.tabCount, { [s.active]: tab === 'submitted' })}>
              {counts?.submitted ?? submittedData?.data?.length ?? 0}
            </span>
          </button>
          <button className={clsx(s.tab, { [s.active]: tab === 'issues' })} onClick={() => setTab('issues')}>
            Reported Issues
            <span className={clsx(s.tabCount, { [s.active]: tab === 'issues' })}>
              {counts?.issues ?? issuesData?.data?.length ?? 0}
            </span>
          </button>
          <button className={clsx(s.tab, { [s.active]: tab === 'access' })} onClick={() => setTab('access')}>
            Access Management
            <span className={clsx(s.tabCount, { [s.active]: tab === 'access' })}>{whitelistData?.length ?? 0}</span>
          </button>
        </div>

        <div className={s.body}>
          {tab === 'catalog' && (
            <>
              <div className={s.controlBar}>
                <input
                  value={catalogFilter}
                  onChange={(e) => setCatalogFilter(e.target.value)}
                  placeholder="Search deals"
                  className={s.searchInput}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setCatalogFilter('');
                  }}
                />
                <select
                  className={s.filterSelect}
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  <option value="">All categories</option>
                  {DEAL_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <select
                  className={s.filterSelect}
                  value={audienceFilter}
                  onChange={(e) => setAudienceFilter(e.target.value)}
                >
                  <option value="">All audiences</option>
                  {DEAL_AUDIENCE_OPTIONS.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>
                <select
                  className={s.filterSelect}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as DealStatus | '')}
                >
                  <option value="">All statuses</option>
                  {STATUSES.map((st) => (
                    <option key={st.value} value={st.value}>
                      {st.label}
                    </option>
                  ))}
                </select>
                <button
                  className={s.addNewBtn}
                  onClick={() => {
                    setEditingDeal(undefined);
                    setFormOpen(true);
                  }}
                >
                  + Create new deal
                </button>
              </div>
              {renderTable(catalogTable, true)}
              <PaginationControls table={catalogTable} />
            </>
          )}
          {tab === 'submitted' && (
            <>
              <div className={s.controlBar}>
                <input
                  value={submittedFilter}
                  onChange={(e) => setSubmittedFilter(e.target.value)}
                  placeholder="Search deals"
                  className={s.searchInput}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setSubmittedFilter('');
                  }}
                />
                <select
                  className={s.filterSelect}
                  value={submittedCategoryFilter}
                  onChange={(e) => setSubmittedCategoryFilter(e.target.value)}
                >
                  <option value="">All categories</option>
                  {DEAL_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                {/* status filter not applicable to submitted deals — rendered for visual parity with Figma */}
                <select className={s.filterSelect} disabled>
                  <option value="">All statuses</option>
                </select>
                <button
                  className={s.addNewBtn}
                  onClick={() => {
                    setEditingDeal(undefined);
                    setFormOpen(true);
                  }}
                >
                  + Create new deal
                </button>
              </div>
              {renderTable(submittedTable, true)}
              <PaginationControls table={submittedTable} />
            </>
          )}
          {tab === 'issues' && (
            <>
              <div className={s.controlBar}>
                <input
                  value={issuesFilter}
                  onChange={(e) => setIssuesFilter(e.target.value)}
                  placeholder="Search deals"
                  className={s.searchInput}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setIssuesFilter('');
                  }}
                />
                <select
                  className={s.filterSelect}
                  value={issuesStatusFilter}
                  onChange={(e) => setIssuesStatusFilter(e.target.value as IssueStatus | '')}
                >
                  <option value="">All statuses</option>
                  <option value="OPEN">Open</option>
                  <option value="RESOLVED">Resolved</option>
                </select>
                <button
                  className={s.addNewBtn}
                  onClick={() => {
                    setEditingDeal(undefined);
                    setFormOpen(true);
                  }}
                >
                  + Create new deal
                </button>
              </div>
              {renderTable(issuesTable, true)}
              <PaginationControls table={issuesTable} />
            </>
          )}
          {tab === 'access' && <DealsWhitelistSection authToken={authToken} />}
        </div>
      </div>

      {formOpen && (
        <DealForm
          onClose={() => {
            setFormOpen(false);
            setEditingDeal(undefined);
            setFormMode('create');
            setReviewingSubmissionUid(null);
          }}
          onSubmit={handleFormSubmit}
          initialData={editingDeal}
          mode={formMode}
        />
      )}
      {viewingIssue && (
        <ReportedIssueModal
          issue={viewingIssue}
          isUpdating={updateIssueStatus.isPending}
          onClose={() => setViewingIssue(null)}
          onStatusChange={handleIssueStatusChange}
        />
      )}
    </ApprovalLayout>
  );
};

export default DealsPage;
