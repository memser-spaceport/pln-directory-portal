import { Tooltip } from '@protocol-labs-network/ui';
import { useIsEmail } from '../../../../../hooks/shared/use-is-email.hook';
import { ProfileSocialLink } from '../../../../shared/profile/profile-social-link/profile-social-link';
import contactLogo from '/public/assets/images/icons/team-contact-logo.svg';
import pinIcon from '/public/assets/images/icons/pin.svg';
type TContactMethodProps = {
  contactMethod?: string;
};

export function ContactMethod({ contactMethod }: TContactMethodProps) {
  const isEmail = useIsEmail(contactMethod);
  const profileSocialLinkType = isEmail ? 'email' : null;

  return (
    <>
      { contactMethod && (
        <>
          <Tooltip
            asChild
            trigger={
              <img className = "p-1.5 bg-[#CFF2D2] rounded-l" src={pinIcon} alt={''}/>
            }
            content={<span className="break-all">{'Preferred'}</span>}
          />
          <Tooltip
            asChild
            trigger={
              <div>
                <ProfileSocialLink
                  profile={contactMethod}
                  url={contactMethod}
                  logo={contactLogo}
                  height={14}
                  width={14}
                  type={profileSocialLinkType}
                  preferred={true}
                />
              </div>
            }
            content={<span className="break-all">{contactMethod}</span>}
          />
        </>
      )}
    </>
  );
}
