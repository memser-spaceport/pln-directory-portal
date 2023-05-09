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
    githubHandle
  } = member;
  const loginAsUserCode = FATHOM_EVENTS.directory.loginAsUser;
  const router = useRouter();

  const handleOnClick = () => {
    if (Cookies.get("userInfo")) {
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
      <div className="mt-4 flex space-x-6">
        <div className="flex w-1/4 flex-col items-start">
          <h2 className="detail-label">Email</h2>
          { userInfo?.uid && (email ? (
              <Tooltip
                asChild
                trigger={
                  <div>
                    <ProfileSocialLink url={email} type="email" />
                  </div>
                }
                content={email}
              />
            ) : (
              '-'
            ))
          }
        </div>
        <div className="flex w-1/4 flex-col items-start">
          <h2 className="detail-label">Twitter</h2>
          { userInfo?.uid && (twitter ? (
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
            ))
          }
        </div>
        <div className="flex w-1/4 flex-col items-start">
          <h2 className="detail-label">Discord</h2>
          { userInfo?.uid && (discordHandle ? (
              <Tooltip
                asChild
                trigger={
                  <span className="line-clamp-1 break-all">{discordHandle}</span>
                }
                content={discordHandle}
              />
            ) : (
              '-'
            ))
          }
        </div>
        <div className="flex w-1/4 flex-col items-start">
          <h2 className="detail-label">Github</h2>
          { userInfo?.uid && (githubHandle ? (
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
            ))
          }
        </div>
      </div>
      { !userInfo?.uid && 
        <button className="w-full flex h-12 rounded-md text-slate-500 justify-center
          text-sm font-medium border border-slate-100 bg-gradient-to-r from-[#f1f5f9] via-[#fefeff] to-[#f1f5f9]"
          onClick={handleOnClick}> 
            <LockClosedIcon className='h-6 my-auto'></LockClosedIcon> 
            <p className='my-auto ml-0.5 pt-1'> Login to view contact details.</p>
        </button>
      }
    </>
  );
}
