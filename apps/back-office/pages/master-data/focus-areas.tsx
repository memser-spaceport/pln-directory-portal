import { ApprovalLayout } from '../../layout/approval-layout';
import { MasterDataTable } from '../../components/master-data/master-data-table';

export default function FocusAreasPage() {
  const fields = [
    { key: 'title' as const, label: 'Title', type: 'text' as const },
    { key: 'description' as const, label: 'Description', type: 'textarea' as const },
    { key: 'parentUid' as const, label: 'Parent UID', type: 'text' as const },
  ];

  return (
    <ApprovalLayout>
      <MasterDataTable
        type="focus-areas"
        title="Focus Areas"
        fields={fields}
      />
    </ApprovalLayout>
  );
}