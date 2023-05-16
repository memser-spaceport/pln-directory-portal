import { ArrowSmRightIcon, CalendarIcon } from '@heroicons/react/outline';
import { AnchorLink } from '@protocol-labs-network/ui';
import { trackGoal } from 'fathom-client';
import Cookies from 'js-cookie';
import { useRouter } from 'next/router';
import { FATHOM_EVENTS } from '../../../../constants';
import { authenticate } from '../../../../utils/services/auth';
import { IMember } from 'apps/web-app/utils/members.types';
import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';

type MemberProfileOfficeHoursProps = {
  url?: string;
  userInfo: any;
  member?: IMember
};

const LEARN_MORE_URL =
  'https://protocol.almanac.io/handbook/protocol-labs-spaceport-JzKymu/0ljck9mPhMLfQN6P7ihodQSQPWmWcIfb';

export function MemberProfileOfficeHours({
  url,
  userInfo,
  member,
}: MemberProfileOfficeHoursProps) {
  const loginAsUserCode = FATHOM_EVENTS.directory.loginAsUser;
  const router = useRouter();
  const analytics = useAppAnalytics()
  const handleOnClick = () => {
    if (Cookies.get("userInfo")) {
      Cookies.set('page_params', 'user_logged_in', { expires: 60, path: '/' });
      router.reload();
    } else {
      authenticate();
      trackGoal(loginAsUserCode, 0);
    }
  };

  const onScheduleMeeting = () => {
    trackGoal(FATHOM_EVENTS.members.profile.officeHours.scheduleMeeting, 0);
    if(member) {
      analytics.captureEvent('office-hours-clicked', {
        name: member.name,
        uid: member.id
      })
    }
  }

  return (
    <div className="mt-6 rounded-xl bg-slate-50 p-4">
      <div className="flex items-center">
        <span className="mr-3 w-7 rounded bg-blue-100 p-1.5">
          <CalendarIcon className="stroke-1.5 h-4 w-4 rounded text-blue-700" />
        </span>
        <h3 className="text-lg font-semibold">Office Hours</h3>
      </div>
      <p className="mt-4 text-base">
        A 15 minute time slot for meetings that Members can use to discuss some
        of the most pressing issues their team or organization is currently
        facing.
      </p>
      <div className="mt-6 flex space-x-4">
        {userInfo.uid ? (
          <>
            {url ? (
              <AnchorLink
                href={url}
                linkClassName="shadow-request-button rounded-lg border border-slate-300 bg-white px-6 py-2.5 text-sm font-medium hover:shadow-on-hover hover:text-slate-600 on-focus active:border-blue-600 active:ring-2"
                handleOnClick={onScheduleMeeting}
              >
                Schedule Meeting
              </AnchorLink>
            ) : (
              <span className="rounded-lg border border-slate-200 bg-white px-6 py-2.5 text-sm font-medium text-slate-400">
                Not Available
              </span>
            )}
          </>) :
          (url ?
            <>
              <button
                onClick={handleOnClick}
                className="shadow-request-button rounded-lg border border-slate-300 bg-white px-6 py-2.5 text-sm font-medium hover:shadow-on-hover hover:text-slate-600 on-focus active:border-blue-600 active:ring-2"
              >
                Login to Schedule
              </button>
            </> : <></>
          )
        }

        <AnchorLink
          href={LEARN_MORE_URL}
          linkClassName="flex items-center text-sm font-semibold group outline-none"
          handleOnClick={() =>
            trackGoal(FATHOM_EVENTS.members.profile.officeHours.learnMore, 0)
          }
        >
          <span className="group-focus-within:shadow-[0_1px_0_#156ff7] group-focus:shadow-[0_1px_0_#156ff7] group-focus-visible:shadow-[0_1px_0_#156ff7]">
            Learn more
          </span>
          <ArrowSmRightIcon className="stroke-1.5 ml-1 h-4 w-4 -rotate-45" />
        </AnchorLink>
      </div>
    </div>
  );
}
