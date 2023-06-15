import { LockClosedIcon } from '@heroicons/react/outline';
import { FATHOM_EVENTS } from '../../../../../web-app/constants';
import { IMember } from '../../../../../web-app/utils/members.types';
import { authenticate } from '../../../../../web-app/utils/services/auth';
import { trackGoal } from 'fathom-client';
import Cookies from 'js-cookie';
import { useRouter } from 'next/router';

export function MemberProfileLoginStrip({
  member,
  userInfo,
}: {
  member: IMember;
  userInfo: any;
}) {
  const router = useRouter();
  const loginAsUserCode = FATHOM_EVENTS.directory.loginAsUser;

  const handleOnClick = () => {
    if (Cookies.get('userInfo')) {
      Cookies.set('page_params', 'user_logged_in', { expires: 60, path: '/' });
      router.reload();
    } else {
      authenticate(router.asPath);
      trackGoal(loginAsUserCode, 0);
    }
  };
  return (
    <>
        <div className="shadow-card--slate-900 w-full rounded-t-xl bg-blue-100 p-2.5">
          <div className="flex items-center justify-center gap-1">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="blue"
              className="h-5 w-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
              />
            </svg>

            <p className="items-center text-xs font-bold leading-5">
              You are viewing {member?.name.concat("'s")} limited profile.{' '}
              <span
                className="cursor-pointer text-blue-700"
                onClick={handleOnClick}
              >
                Login
              </span>{' '}
              to access details such as social profiles, projects & office hours.
            </p>
          </div>
        </div>
    </>
  );
}
