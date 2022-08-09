import { ITeam } from '@protocol-labs-network/api';
import { CollapsibleText, Tooltip } from '@protocol-labs-network/ui';
import { ProfileSocialLink } from '../../../shared/profile/profile-social-link/profile-social-link';

export function TeamProfileDetails({
  website,
  twitter,
  longDescription,
  shortDescription,
}: ITeam) {
  return (
    <>
      <div className="mt-6 flex">
        <div className="w-1/2">
          <h2 className="detail-label">Website</h2>
          {website ? (
            <Tooltip
              trigger={<ProfileSocialLink url={website} />}
              content={website}
            />
          ) : (
            '-'
          )}
        </div>
        <div className="w-1/2">
          <h2 className="detail-label">Twitter</h2>
          {twitter ? (
            <Tooltip
              trigger={<ProfileSocialLink url={twitter} type="twitter" />}
              content={twitter}
            />
          ) : (
            '-'
          )}
        </div>
      </div>
      <div className="mt-6">
        <h2 className="detail-label">About</h2>
        <CollapsibleText
          maxChars={500}
          txt={longDescription || shortDescription || '-'}
        />
      </div>
    </>
  );
}
