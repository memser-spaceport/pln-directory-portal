import { ArrowSmRightIcon } from '@heroicons/react/outline';
import { AnchorLink, Tooltip } from '@protocol-labs-network/ui';
import { trackGoal } from 'fathom-client';
import Cookies from 'js-cookie';
import { useRouter } from 'next/router';
import {
  APP_ANALYTICS_EVENTS,
  FATHOM_EVENTS,
  OFFICE_HOURS_MSG,
} from '../../../../constants';
import { authenticate } from '../../../../utils/services/auth';
import { IMember } from '../../../../../web-app/utils/members.types';
import useAppAnalytics from '../../../../../web-app/hooks/shared/use-app-analytics';
import {ReactComponent as CalendarIcon} from '../../../../public/assets/images/icons/ScheduleCalendar.svg'

type MemberProfileOfficeHoursProps = {
  url?: string;
  userInfo: any;
  member?: IMember;
  officeHoursFlag?: boolean;
};

const LEARN_MORE_URL =
  'https://protosphere.plnetwork.io/posts/Office-Hours-Guidelines-and-Tips-clsdgrbkk000ypocoqsceyfaq';

export function MemberProfileOfficeHours({
  url,
  userInfo,
  member,
  officeHoursFlag
}: MemberProfileOfficeHoursProps) {
  const loginAsUserCode = FATHOM_EVENTS.directory.loginAsUser;
  const router = useRouter();
  const analytics = useAppAnalytics();
  const handleOnClick = () => {
    if (Cookies.get('userInfo')) {
      Cookies.set('page_params', 'schedule_meeting', { expires: 60, path: '/' });
      router.reload();
    } else {
      router.push(`${window.location.pathname}${window.location.search}#login`)
    }
  };

  const onScheduleMeeting = () => {
    trackGoal(FATHOM_EVENTS.members.profile.officeHours.scheduleMeeting, 0);
    if (member) {
      analytics.captureEvent(APP_ANALYTICS_EVENTS.MEMBER_OFFICEHOURS_CLICKED, {
        name: member.name,
        uid: member.id,
      });
    }
  };

  return (
    <>
      {((!userInfo?.uid && officeHoursFlag) || userInfo.uid) && (
        <div className="mt-6 flex items-center justify-between rounded-xl bg-slate-50 p-4">
          <div className="flex items-center ">
            <span className="mr-3">
              <CalendarIcon />
            </span>
            {!userInfo.uid ? (
              <p className="flex select-none items-center gap-1 text-sm font-normal">
                {OFFICE_HOURS_MSG}{' '}
                <span>
                  <Tooltip
                    asChild
                    trigger={
                      <p className="w-[80px] truncate">{member?.name}</p>
                    }
                    content={member?.name}
                  />
                </span>
              </p>
            ) : (
              <h3 className="text-lg font-semibold">Office Hours</h3>
            )}
          </div>
          <div className="flex space-x-4">
            <AnchorLink
              href={LEARN_MORE_URL}
              linkClassName="flex items-center text-sm font-semibold group outline-none"
              handleOnClick={() =>
                trackGoal(
                  FATHOM_EVENTS.members.profile.officeHours.learnMore,
                  0
                )
              }
            >
              <span className="group-focus-within:shadow-[0_1px_0_#156ff7] group-focus:shadow-[0_1px_0_#156ff7] group-focus-visible:shadow-[0_1px_0_#156ff7]">
                Learn more
              </span>
              <ArrowSmRightIcon className="stroke-1.5 ml-1 h-4 w-4 -rotate-45" />
            </AnchorLink>
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
              </>
            ) : (
              <>
                <button
                  onClick={handleOnClick}
                  className="shadow-request-button hover:shadow-on-hover on-focus rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium hover:text-slate-600 active:border-blue-600 active:ring-2"
                >
                  Login to Schedule
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
