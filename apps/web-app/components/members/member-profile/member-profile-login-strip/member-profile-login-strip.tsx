import { FATHOM_EVENTS } from '../../../../../web-app/constants';
import { IMember } from '../../../../../web-app/utils/members.types';
import { authenticate } from '../../../../../web-app/utils/services/auth';
import { ReactComponent as LockIcon } from '../../../../public/assets/images/icons/lock-indicator.svg';
import { trackGoal } from 'fathom-client';
import Cookies from 'js-cookie';
import { useRouter } from 'next/router';
import { cookiePrefix } from "../../../../utils/common.utils";

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
    if (Cookies.get(`${cookiePrefix()}userInfo`)) {
      Cookies.set(`${cookiePrefix()}page_params`, 'user_logged_in', { expires: 60, path: '/' });
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
          <span className="pb-1"><LockIcon /></span>
          <p className="items-center text-xs font-medium leading-5">
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
