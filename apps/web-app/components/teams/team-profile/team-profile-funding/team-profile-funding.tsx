import { ITeam } from '@protocol-labs-network/api';
import { TagsGroup } from '../../../shared/tags-group/tags-group';

export function TeamProfileFunding({
  fundingStage,
  acceleratorPrograms,
}: ITeam) {
  return (
    <div className="flex">
      <div className="grow basis-0 rounded-l-lg border border-slate-200 p-5">
        <h2 className="detail-label">Funding Stage</h2>
        <div>{fundingStage ? <TagsGroup items={[fundingStage]} /> : '-'}</div>
      </div>
      <div className="grow basis-0 rounded-r-lg border border-l-0 border-slate-200 p-5">
        <h2 className="detail-label">Accelerator Programs</h2>
        <div>
          {acceleratorPrograms?.length ? (
            <TagsGroup items={acceleratorPrograms} />
          ) : (
            '-'
          )}
        </div>
      </div>
    </div>
  );
}
