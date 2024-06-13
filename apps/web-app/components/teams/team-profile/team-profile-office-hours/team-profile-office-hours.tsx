import { ArrowSmRightIcon } from '@heroicons/react/outline';
import { AnchorLink, Tooltip } from '@protocol-labs-network/ui';
import Cookies from 'js-cookie';
import { useRouter } from 'next/router';
import {
  APP_ANALYTICS_EVENTS,
  OFFICE_HOURS_MSG,
} from '../../../../constants';
import { ITeam } from '../../../../utils/teams.types';
import useAppAnalytics from '../../../../hooks/shared/use-app-analytics';
import {ReactComponent as CalendarIcon} from '../../../../public/assets/images/icons/ScheduleCalendar.svg'

type TeamProfileOfficeHoursProps = {
  url?: string;
  userInfo: any;
  team?: ITeam;
  officeHoursFlag?: boolean;
};

const LEARN_MORE_URL =
  'https://protocol.almanac.io/handbook/protocol-labs-spaceport-JzKymu/0ljck9mPhMLfQN6P7ihodQSQPWmWcIfb';

export function TeamProfileOfficeHours({
  url,
  userInfo,
  team,
  officeHoursFlag
}: TeamProfileOfficeHoursProps) {

  const router = useRouter();
  const analytics = useAppAnalytics();
  const handleOnClick = () => {
    analytics.captureEvent(APP_ANALYTICS_EVENTS.TEAM_OFFICEHOURS_LOGIN_BTN_CLICKED, {
      name: team.name,
      uid: team.id,
    });
    if (Cookies.get('userInfo')) {
      Cookies.set('page_params', 'schedule_meeting', { expires: 60, path: '/' });
      router.reload();
    } else {
      router.push(`${window.location.pathname}${window.location.search}#login`)
    }
  };

  const onScheduleMeeting = () => {
    if (team) {
      analytics.captureEvent(APP_ANALYTICS_EVENTS.TEAM_OFFICEHOURS_CLICKED, {
        name: team.name,
        uid: team.id,
      });
    }
  };

  const handleLearnMoreClick = () => {
    analytics.captureEvent(APP_ANALYTICS_EVENTS.TEAM_OFFICEHOURS_LEARN_MORE_CLICKED, {
      name: team.name,
      uid: team.id,
    });
  }

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
                      <p className="w-[80px] truncate">{team?.name}</p>
                    }
                    content={team?.name}
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
              handleOnClick={handleLearnMoreClick}
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
