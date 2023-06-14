/* eslint-disable @next/next/no-img-element */
import { Tooltip } from '@protocol-labs-network/ui';
import SocialProfile from '../../../../../web-app/components/shared/directory/social-profile/social-profile';
import { IMember } from '../../../../utils/members.types';
import { TagsGroup } from '../../../shared/tags-group/tags-group';
import discordLogo from '/public/assets/images/icons/discord-contact-logo.svg';
import emailLogo from '/public/assets/images/icons/email-contact-logo.svg';
import gitLogo from '/public/assets/images/icons/git-contact-logo.svg';
import linkedInLogo from '/public/assets/images/icons/linkedIn-contact-logo.svg';
import telegramLogo from '/public/assets/images/icons/telegram-contact-logo.svg';
import twitterLogo from '/public/assets/images/icons/twitter-contact-logo.svg';

// import emailLogo from '/public/assets/images/icons/email-contact-logo.svg';

export function MemberProfileDetails({
  member,
  userInfo,
}: {
  member: IMember;
  userInfo: any;
}) {
  const {
    skills,
    email,
    twitter,
    discordHandle,
    githubHandle,
    telegramHandle,
    linkedinHandle,
  } = member;

  return (
    <>
      <div className="mt-6">
        {skills.length ? (
          <TagsGroup items={skills.map((skill) => skill.title)} />
        ) : (
          '-'
        )}
      </div>
      <h3 className=" mt-6 font-medium text-slate-500">Contact Details</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {userInfo.uid && (
          <>
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

            {/* Discord */}
            {discordHandle && (
              <SocialProfile
                handle={discordHandle}
                type="discord"
                logo={discordLogo}
                height={14}
                width={14}
              />
            )}

            {/* Telegram */}
            {telegramHandle && (
              <SocialProfile
                handle={telegramHandle}
                type="telegram"
                logo={telegramLogo}
                height={14}
                width={14}
              />
            )}

            {/* Email */}
            {email && (
              <SocialProfile
                handle={email}
                type="email"
                logo={emailLogo}
                height={14}
                width={14}
              />
            )}

            {/* GitHub */}
            {githubHandle && (
              <SocialProfile
                handle={githubHandle}
                type="github"
                logo={gitLogo}
                height={14}
                width={14}
              />
            )}
          </>
        )}
      </div>
    </>
  );
}
