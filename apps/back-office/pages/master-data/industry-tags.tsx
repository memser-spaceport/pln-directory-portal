import { ApprovalLayout } from '../../layout/approval-layout';
import { MasterDataTable } from '../../components/master-data/master-data-table';

export default function IndustryTagsPage() {
  const fields = [
    { key: 'title' as const, label: 'Title', type: 'text' as const },
    { key: 'definition' as const, label: 'Definition', type: 'textarea' as const },
  ];

  return (
    <ApprovalLayout>
      <MasterDataTable
        type="industry-tags"
        title="Industry Tags"
        fields={fields}
      />
    </ApprovalLayout>
  );
}