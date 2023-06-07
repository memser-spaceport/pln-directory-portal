/* eslint-disable @next/next/no-img-element */
import { LockClosedIcon } from '@heroicons/react/solid';
import { Tooltip } from '@protocol-labs-network/ui';
import { trackGoal } from 'fathom-client';
import Cookies from 'js-cookie';
import { IMember } from '../../../../utils/members.types';
import { ProfileSocialLink } from '../../../shared/profile/profile-social-link/profile-social-link';
import { TagsGroup } from '../../../shared/tags-group/tags-group';
import { useRouter } from 'next/router';
import { FATHOM_EVENTS } from '../../../../constants';
import { authenticate } from '../../../../utils/services/auth';
import linkedInLogo from '/public/assets/images/icons/linkedIn-contact-logo.svg';
import twitterLogo from '/public/assets/images/icons/twitter-contact-logo.svg';
import discordLogo from '/public/assets/images/icons/discord-contact-logo.svg';
import telegramLogo from '/public/assets/images/icons/telegram-contact-logo.svg';
import emailLogo from '/public/assets/images/icons/email-contact-logo.svg';

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
  const loginAsUserCode = FATHOM_EVENTS.directory.loginAsUser;
  const router = useRouter();

  const handleOnClick = () => {
    if (Cookies.get('userInfo')) {
      Cookies.set('page_params', 'user_logged_in', { expires: 60, path: '/' });
      router.reload();
    } else {
      authenticate();
      trackGoal(loginAsUserCode, 0);
    }
  };

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
      <div className="mt-3 flex gap-3">
        {/* Linked-In */}

        {userInfo?.uid &&
          (linkedinHandle ? (
            <Tooltip
              asChild
              trigger={
                <div>
                  <ProfileSocialLink url={linkedinHandle} type="linkedin" logo={linkedInLogo} height={23} width={23}/>
                </div>
              }
              content={linkedinHandle}
            />
          ) : (
            '-'
          ))}

        {/* Twitter */}

          {userInfo?.uid &&
            (twitter ? (
              <Tooltip
                asChild
                trigger={
                  <div>
                    <ProfileSocialLink url={twitter} type="twitter" logo={twitterLogo} height={23} width={23}/>
                  </div>
                }
                content={twitter}
              />
            ) : (
              '-'
            ))}
        

        {/* Discord */}
        <div className="flex h-9 w-40 items-center gap-2 rounded bg-[#F1F5F9] px-3 font-medium">
          <img src={discordLogo} alt="twitter" height={23} width={23} />
          {userInfo?.uid &&
            (discordHandle ? (
              <Tooltip
                asChild
                trigger={
                  <span className="line-clamp-1 break-all">
                    {discordHandle}
                  </span>
                }
                content={discordHandle}
              />
            ) : (
              '-'
            ))}
        </div>

        {/* Telegram */}
          {userInfo?.uid &&
            (twitter ? (
              <Tooltip
                asChild
                trigger={
                  <div>
                    <ProfileSocialLink url={telegramHandle} type="telegram" logo={telegramLogo} height={23} width={23}/>
                  </div>
                }
                content={twitter}
              />
            ) : (
              '-'
            ))}


        {/* Email */}
          {userInfo?.uid &&
            (email ? (
              <Tooltip
                asChild
                trigger={
                  <div className="">
                    <ProfileSocialLink url={email} type="email" logo={emailLogo} height={30} width={30}/>
                  </div>
                }
                content={email}
              />
            ) : (
              '-'
            ))}


        {/* <div className="flex  flex-col items-start">
          <h2 className="detail-label">Github</h2>
          {userInfo?.uid &&
            (githubHandle ? (
              <Tooltip
                asChild
                trigger={
                  <div>
                    <ProfileSocialLink url={githubHandle} type="github" />
                  </div>
                }
                content={githubHandle}
              />
            ) : (
              '-'
            ))}
        </div> */}
      </div>
      {!userInfo?.uid && (
        <button
          className="flex h-12 w-full justify-center rounded-md border
          border-slate-100 bg-gradient-to-r from-[#f1f5f9] via-[#fefeff] to-[#f1f5f9] text-sm font-medium text-slate-500"
          onClick={handleOnClick}
        >
          <LockClosedIcon className="my-auto h-6"></LockClosedIcon>
          <p className="my-auto ml-0.5 pt-1"> Login to view contact details.</p>
        </button>
      )}
    </>
  );
}
