import { CollapsibleText, Tooltip } from '@protocol-labs-network/ui';
import { ITeam } from '../../../../utils/teams.types';
import { ProfileSocialLink } from '../../../shared/profile/profile-social-link/profile-social-link';
import { ContactMethod } from './contact-method/contact-method';
import linkedInLogo from '/public/assets/images/icons/linkedIn-contact-logo.svg';
import twitterLogo from '/public/assets/images/icons/twitter-contact-logo.svg';
import websiteLogo from '/public/assets/images/icons/website-contact-logo.svg';

export function TeamProfileDetails({
  website,
  twitter,
  contactMethod,
  longDescription,
  shortDescription,
  linkedinHandle,
}: ITeam) {
  return (
    <>
      <div className="mt-6 flex space-x-6">
        {/* Website */}
        {website ? (
          <Tooltip
            asChild
            trigger={
              <div>
                <ProfileSocialLink
                  url={website}
                  logo={websiteLogo}
                  height={24}
                  width={24}
                />
              </div>
            }
            content={<span className="break-all">{website}</span>}
          />
        ) : (
          '-'
        )}

        {/* Twitter */}
        {twitter ? (
          <Tooltip
            asChild
            trigger={
              <div>
                <ProfileSocialLink
                  url={twitter}
                  type="twitter"
                  logo={twitterLogo}
                  width={23}
                  height={23}
                />
              </div>
            }
            content={twitter}
          />
        ) : (
          '-'
        )}

        {/* Linked-In */}
        {linkedinHandle ? (
          <Tooltip
            asChild
            trigger={
              <div>
                <ProfileSocialLink
                  url={linkedinHandle}
                  type="linkedin"
                  logo={linkedInLogo}
                  height={23}
                  width={23}
                />
              </div>
            }
            content={linkedinHandle}
          />
        ) : (
          '-'
        )}

        <div className="flex flex-col">
          <h2 className="detail-label">Contact us</h2>
          <ContactMethod contactMethod={contactMethod} />
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
