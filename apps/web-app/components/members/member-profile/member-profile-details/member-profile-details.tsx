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
      <div className="mt-3 flex gap-3 flex-wrap">
        {userInfo.uid && (
          <>
            {/* Linked-In */}
            {linkedinHandle && (
              <SocialProfile
                handle={linkedinHandle}
                type="linkedin"
                logo={linkedInLogo}

              />
            )}

            {/* Twitter */}
            {twitter && (
              <SocialProfile
                handle={twitter}
                type="twitter"
                logo={twitterLogo}
   
              />
            )}

            {/* Discord */}
            {discordHandle && (
              <div className="flex h-9 items-center gap-2 rounded bg-[#F1F5F9] px-3 font-medium">
                <img src={discordLogo} alt="discord"/>
                <Tooltip
                  asChild
                  trigger={
                    <span className="line-clamp-1 break-all">
                      {discordHandle}
                    </span>
                  }
                  content={discordHandle}
                />
              </div>
            )}

            {/* Telegram */}
            {telegramHandle && (
              <SocialProfile
                handle={telegramHandle}
                type="telegram"
                logo={telegramLogo}
      
              />
            )}

            {/* Email */}
            {email && (
              <SocialProfile
                handle={email}
                type="email"
                logo={emailLogo}
              
              />
            )}

            {/* GitHub */}
            {githubHandle && (
              <SocialProfile
                handle={githubHandle}
                type="github"
                logo={gitLogo}
           
              />
            )}
          </>
        )}
      </div>
    </>
  );
}
