import { ApprovalLayout } from '../../layout/approval-layout';
import { MasterDataTable } from '../../components/master-data/master-data-table';

export default function SkillsPage() {
  const fields = [
    { key: 'title' as const, label: 'Title', type: 'text' as const },
    { key: 'description' as const, label: 'Description', type: 'textarea' as const },
  ];

  return (
    <ApprovalLayout>
      <MasterDataTable
        type="skills"
        title="Skills"
        fields={fields}
      />
    </ApprovalLayout>
  );
}