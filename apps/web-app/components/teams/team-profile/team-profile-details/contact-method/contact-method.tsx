import { Tooltip } from '@protocol-labs-network/ui';
import { useIsEmail } from '../../../../../hooks/shared/use-is-email.hook';
import { ProfileSocialLink } from '../../../../shared/profile/profile-social-link/profile-social-link';
import contactLogo from '/public/assets/images/icons/team-contact-logo.svg';

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
                logo={contactLogo}
                height={30}
                width={30}
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
