import { APP_ANALYTICS_EVENTS } from 'apps/web-app/constants';
import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';
import { getUserInfo } from 'apps/web-app/utils/shared.utils';
import Link from 'next/link';

const TeamList = (props: any) => {
  const items = props?.items ?? [];
  const onLogin = props.onLogin;
  const eventDetails = props?.eventDetails;
  const analytics = useAppAnalytics();
  const user = getUserInfo();

  const onLoginClick = () => {
    analytics.captureEvent(
      APP_ANALYTICS_EVENTS.IRL_GUEST_LIST_TABLE_LOGIN_BTN_CLICKED,
      {
        eventId: eventDetails?.id,
        eventName: eventDetails?.name,
      }
    );
    onLogin();
  };

  const onTeamClick = (teamUid: string, teamName: string) => {
    analytics.captureEvent(
      APP_ANALYTICS_EVENTS.IRL_GUEST_LIST_TABLE_TEAM_CLICKED,
      {
        eventId: eventDetails?.id,
        eventName: eventDetails?.name,
        teamUid,
        teamName,
        user,
      }
    );
  };

  return (
    <>
      <div className="relative flex h-fit w-[100%] flex-col pt-[8px]">
        {items.map((item, itemIndex) => (
          <div
            key={`${itemIndex}-event-list`}
            className="flex w-[100%] border-b-[1px] border-b-[#CBD5E1] py-[12px] text-[13px] font-[400]"
          >
            <div className="flex w-full items-center justify-start gap-[4px] pl-[20px] lg:w-[200px]">
              <Link href={`/teams/${item.teamUid}`}>
                <a
                  target="_blank"
                  className="text-clamp w-fit break-words"
                  onClick={() => onTeamClick(item?.teamUid, item?.teamName)}
                >
                  <span className="inline-flex items-center gap-1">
                    <div className=" h-[32px] w-[32px]">
                      <img
                        src={
                          item.teamLogo ||
                          '/assets/images/icons/teamdefault.svg'
                        }
                        className=" h-[32px] w-[32px]"
                      />
                    </div>
                    <span className="w-fit">{item.teamName}</span>
                  </span>
                </a>
              </Link>
            </div>
            <div className="hidden w-[180px] items-center justify-start gap-[4px] lg:flex">
              <div className="h-[32px] w-[32px] rounded-[58px] bg-gray-200"></div>
              <p className="">aaaaaa aaa</p>
            </div>

            <div className="hidden w-[150px] items-center justify-start lg:flex">
              @aaaaaaa
            </div>
            <div className="hidden w-[330px] items-center justify-start pr-[20px] lg:flex">
              aaaa aaaaaaa aaaaaaaa aaaaaaa aaaaaaa aaaa
            </div>
          </div>
        ))}

        <div className="absolute top-[4px] right-[1px] bottom-0 hidden w-[calc(100%_-_200px)] bg-[#C8C8C8AB] bg-opacity-60 backdrop-blur-[2.5px] lg:block">
          <div className="relative flex h-[100%] w-[100%] justify-center">
            <button
              onClick={onLoginClick}
              className="sticky top-[50%] flex h-[36px] w-[156px] cursor-pointer items-center justify-center rounded-[8px] bg-white text-[14px] font-[500]"
            >
              Login To Access
            </button>
          </div>
        </div>
      </div>
      <style jsx>
        {`
          .text-clamp {
            display: -webkit-box;
            -webkit-box-orient: vertical;
            overflow: hidden;
            -webkit-line-clamp: 2;
          }
        `}
      </style>
    </>
  );
};

export default TeamList;
