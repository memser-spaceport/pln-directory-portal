import { ITeam } from '@protocol-labs-network/api';
import { CollapsibleText, Tooltip } from '@protocol-labs-network/ui';
import { TeamProfileSocialLink } from './team-profile-social-link';

export function TeamProfileDetails({
  website,
  twitter,
  longDescription,
  shortDescription,
}: ITeam) {
  return (
    <>
      <div className="flex">
        <div className="w-1/2">
          <h2 className="detail-label">Website</h2>
          {website ? (
            <Tooltip Trigger={() => <TeamProfileSocialLink url={website} />}>
              {website}
            </Tooltip>
          ) : (
            '-'
          )}
        </div>
        <div className="w-1/2">
          <h2 className="detail-label">Twitter</h2>
          {twitter ? (
            <Tooltip
              Trigger={() => (
                <TeamProfileSocialLink url={twitter} type="twitter" />
              )}
            >
              {twitter}
            </Tooltip>
          ) : (
            '-'
          )}
        </div>
      </div>
      <div>
        <h2 className="detail-label">About</h2>
        <CollapsibleText
          maxChars={500}
          txt={longDescription || shortDescription || '-'}
        />
      </div>
    </>
  );
}
