import { ITeam } from '@protocol-labs-network/api';
import { TagsGroup } from '../../../shared/tags-group/tags-group';

export function TeamProfileFunding({ fundingStage, membershipSources }: ITeam) {
  return (
    <div className="mt-6 flex rounded-lg border border-slate-200">
      {fundingStage ? (
        <div className="grow basis-1/2 p-5 pb-3">
          <h2 className="detail-label">Funding Stage</h2>
          <div>
            <TagsGroup items={[fundingStage]} />
          </div>
        </div>
      ) : null}
      {membershipSources?.length ? (
        <div className="grow basis-1/2 p-5 pb-3 even:border-l even:border-l-slate-200">
          <h2 className="detail-label">Membership Source</h2>
          <div>
            <TagsGroup
              items={membershipSources.map((source) => source.title)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
