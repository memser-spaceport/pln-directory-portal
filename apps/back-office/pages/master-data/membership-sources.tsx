import { ApprovalLayout } from '../../layout/approval-layout';
import { MasterDataTable } from '../../components/master-data/master-data-table';

export default function MembershipSourcesPage() {
  const fields = [
    { key: 'title' as const, label: 'Title', type: 'text' as const },
  ];

  return (
    <ApprovalLayout>
      <MasterDataTable
        type="membership-sources"
        title="Membership Sources"
        fields={fields}
      />
    </ApprovalLayout>
  );
}