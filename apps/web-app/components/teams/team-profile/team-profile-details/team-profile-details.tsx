import { CollapsibleText, Tooltip } from '@protocol-labs-network/ui';
import { ITeam } from '../../../../utils/teams.types';
import { ProfileSocialLink } from '../../../shared/profile/profile-social-link/profile-social-link';
import { ContactMethod } from './contact-method/contact-method';

export function TeamProfileDetails({
  website,
  twitter,
  contactMethod,
  longDescription,
  shortDescription,
}: ITeam) {
  return (
    <>
      <div className="mt-6 flex space-x-6">
        <div className="flex flex-1 flex-col items-start">
          <h2 className="detail-label">Website</h2>
          {website ? (
            <Tooltip
              asChild
              trigger={
                <div>
                  <ProfileSocialLink url={website} />
                </div>
              }
              content={<span className="break-all">{website}</span>}
            />
          ) : (
            '-'
          )}
        </div>
        <div className="flex flex-1 flex-col items-start">
          <h2 className="detail-label">Contact us</h2>
          <ContactMethod contactMethod={contactMethod} />
        </div>
        <div className="flex flex-1 flex-col items-start">
          <h2 className="detail-label">Twitter</h2>
          {twitter ? (
            <Tooltip
              asChild
              trigger={
                <div>
                  <ProfileSocialLink url={twitter} type="twitter" />
                </div>
              }
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
          classname="profile-description"
          maxHeight={120}
          txt={longDescription || shortDescription || '-'}
        />
      </div>
    </>
  );
}
