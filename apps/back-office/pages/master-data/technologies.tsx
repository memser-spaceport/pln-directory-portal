import { ApprovalLayout } from '../../layout/approval-layout';
import { MasterDataTable } from '../../components/master-data/master-data-table';

export default function TechnologiesPage() {
  const fields = [
    { key: 'title' as const, label: 'Title', type: 'text' as const },
    { key: 'description' as const, label: 'Description', type: 'textarea' as const },
  ];

  return (
    <ApprovalLayout>
      <MasterDataTable
        type="technologies"
        title="Technologies"
        fields={fields}
      />
    </ApprovalLayout>
  );
}