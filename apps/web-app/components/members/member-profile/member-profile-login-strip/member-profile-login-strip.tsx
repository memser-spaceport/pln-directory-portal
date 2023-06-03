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
      authenticate();
      trackGoal(loginAsUserCode, 0);
    }
  };
  return (
    <>
      {!userInfo?.uid && (
        <div className="shadow-card--slate-900 w-full rounded-t-xl bg-blue-100 p-2.5">
          <div className="flex justify-center">
            <p className="text-xs font-bold leading-5">
              You are viewing {member?.name} limited profile.{' '}
              <span
                className="cursor-pointer text-blue-700"
                onClick={handleOnClick}
              >
                Login
              </span>{' '}
              to access details such as social profiles, projects & office hours
            </p>
          </div>
        </div>
      )}
    </>
  );
}
