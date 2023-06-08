import { Tooltip } from '@protocol-labs-network/ui';
import { useIsEmail } from '../../../../../hooks/shared/use-is-email.hook';
import { ProfileSocialLink } from '../../../../shared/profile/profile-social-link/profile-social-link';
import emailLogo from '/public/assets/images/icons/email-contact-logo.svg';


type TContactMethodProps = {
  contactMethod?: string;
};

export function ContactMethod({ contactMethod }: TContactMethodProps) {
  const isEmail = useIsEmail(contactMethod);
  const profileSocialLinkType = isEmail ? 'email' : null;

  return (
    <>
      {contactMethod && (
        <Tooltip
          asChild
          trigger={
            <div>
              <ProfileSocialLink
                url={contactMethod}
                logo={emailLogo}
                type={profileSocialLinkType}
              />
            </div>
          }
          content={<span className="break-all">{contactMethod}</span>}
        />
      )}
    </>
  );
}
