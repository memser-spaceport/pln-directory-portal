import { ITeam } from '@protocol-labs-network/api';
import { TagsGroup } from '../../../shared/tags-group/tags-group';

export function TeamProfileFunding({
  fundingStage,
  acceleratorPrograms,
}: ITeam) {
  return (
    <div className="flex rounded-lg border border-slate-200">
      {fundingStage ? (
        <div className="grow basis-1/2 p-5">
          <h2 className="detail-label">Funding Stage</h2>
          <div>
            <TagsGroup items={[fundingStage]} />
          </div>
        </div>
      ) : null}
      {acceleratorPrograms?.length ? (
        <div className="grow basis-1/2 p-5 even:border-l even:border-l-slate-200">
          <h2 className="detail-label">Accelerator Programs</h2>
          <div>
            <TagsGroup items={acceleratorPrograms} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
