import { TagsGroup } from '../../../shared/tags-group/tags-group';

interface TeamProfileAcceleratorProgramsProps {
  acceleratorPrograms?: string[];
}

export default function TeamProfileAcceleratorPrograms({
  acceleratorPrograms,
}: TeamProfileAcceleratorProgramsProps) {
  const hasAcceleratorPrograms =
    acceleratorPrograms && acceleratorPrograms.length;

  return (
    <div className="card w-1/2">
      <h3 className="mb-3 text-sm font-semibold">Accelerator Programs</h3>
      <div>
        {hasAcceleratorPrograms ? (
          <TagsGroup items={acceleratorPrograms} />
        ) : (
          'Not provided'
        )}
      </div>
    </div>
  );
}
