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
      <h3 className=" mt-6 font-medium text-slate-500">Contact Details</h3>
      <div className="mt-3 flex gap-2 flex-wrap">
        {/* Website */}
        {website && (
          <SocialProfile
            handle={website}
            type="website"
            logo={websiteLogo}
            height={14}
            width={14}
          />
        )}

        {/* Twitter */}
        {twitter && (
          <SocialProfile
            handle={twitter}
            type="twitter"
            logo={twitterLogo}
            height={14}
            width={14}
          />
        )}

        {/* Linked-In */}
        {linkedinHandle && (
          <SocialProfile
            handle={linkedinHandle}
            type="linkedin"
            logo={linkedInLogo}
            height={14}
            width={14}
          />
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
