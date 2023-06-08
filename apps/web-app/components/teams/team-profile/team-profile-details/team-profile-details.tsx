import { CollapsibleText } from '@protocol-labs-network/ui';
import SocialProfile from '../../../../../web-app/components/shared/directory/social-profile/social-profile';
import { ITeam } from '../../../../utils/teams.types';
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
          <SocialProfile handle={website} type="website" logo={websiteLogo} height={24} width={24}
          />
        ) : (
          '-'
        )}

        {/* Twitter */}
        {twitter ? (
              <SocialProfile handle={twitter} type="twitter" logo={twitterLogo} height={23} width={23}
          />
        ) : (
          '-'
        )}

        {/* Linked-In */}
        {linkedinHandle ? (
          <SocialProfile handle={linkedinHandle} type="linkedin" logo={linkedInLogo} height={23} width={23}
          />
        ) : (
          '-'
        )}

        {/* Contact details */}
        <div className="flex">
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
