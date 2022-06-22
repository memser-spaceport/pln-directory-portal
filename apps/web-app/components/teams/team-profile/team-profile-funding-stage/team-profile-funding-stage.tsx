import { TagsGroup } from '../../../shared/tags-group/tags-group';
import { parseStringsIntoTagsGroupItems } from '../../../shared/tags-group/tags-group.utils';
interface TeamProfileFundingStageProps {
  fundingStage?: string;
}

export default function TeamProfileFundingStage({
  fundingStage,
}: TeamProfileFundingStageProps) {
  const hasFundingStage = fundingStage && fundingStage.length;

  return (
    <div className="card w-1/2">
      <h3 className="mb-3 text-sm font-semibold">Funding Stage</h3>
      <div>
        {hasFundingStage ? (
          <TagsGroup items={parseStringsIntoTagsGroupItems([fundingStage])} />
        ) : (
          'Not provided'
        )}
      </div>
    </div>
  );
}
