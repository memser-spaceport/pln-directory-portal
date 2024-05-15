import { APP_ANALYTICS_EVENTS } from 'apps/web-app/constants';
import { useIrlDetails } from 'apps/web-app/hooks/irl/use-irl-details';
import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';
import { getUserInfo } from 'apps/web-app/utils/shared.utils';
import Link from 'next/link';

const MemberList = (props: any) => {
  const userInfo = props?.userInfo;
  const eventDetails = props?.eventDetails;
  const analytics = useAppAnalytics();
  const user = getUserInfo();

  const filteredList = props?.items;

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

  const onMemberClick = (memberUid: string, memberName: string) => {
    analytics.captureEvent(
      APP_ANALYTICS_EVENTS.IRL_GUEST_LIST_TABLE_MEMBER_CLICKED,
      {
        eventId: eventDetails?.id,
        eventName: eventDetails?.name,
        memberUid,
        memberName,
        user,
      }
    );
  };

  const onTelegramClick = (
    telegramUrl: string,
    memberUid: string,
    memberName: string
  ) => {
    analytics.captureEvent(
      APP_ANALYTICS_EVENTS.IRL_GUEST_LIST_TABLE_TELEGRAM_LINK_CLICKED,
      {
        eventId: eventDetails?.id,
        eventName: eventDetails?.name,
        telegramUrl,
        memberUid,
        memberName,
        user,
      }
    );
  };

  return (
    <>
      <div className="flex flex-col lg:w-full">
        {filteredList.length > 0 &&
          filteredList.map((item, itemIndex) => {
            const isUserGoing = item.memberUid === userInfo.uid;
            return (
              <div
                key={`${itemIndex}-event-list`}
                className={`${isUserGoing ? 'bg-[#FFFAE6]' : ''} flex w-fit ${
                  itemIndex !== filteredList?.length - 1
                    ? 'border-b-[1px] border-b-[#CBD5E1]'
                    : ''
                } py-[12px] text-[13px] font-[400] lg:w-[100%]`}
              >
                <div className="flex w-[200px] items-center justify-start gap-[4px] pl-[20px]">
                  <Link href={`/members/${item.memberUid}`}>
                    <a
                      target="_blank"
                      title={item.memberName}
                      className="w-fit break-words pr-[3px]"
                      onClick={() =>
                        onMemberClick(item?.memberUid, item?.memberName)
                      }
                    >
                      <span className="flex w-fit items-center gap-1">
                        <div className="h-[32px] w-[32px] rounded-[58px] ">
                          <img
                            alt="member image"
                            src={
                              item?.memberLogo ||
                              '/assets/images/icons/memberdefault.svg'
                            }
                            className="h-[32px] w-[32px] rounded-[58px] bg-gray-200 object-cover"
                          />
                        </div>
                        <span className="w-fit">{item.memberName}</span>
                      </span>
                    </a>
                  </Link>
                </div>
                <div className="flex w-[200px] items-center justify-start gap-[4px]">
                  <span>
                    <Link href={`/teams/${item.teamUid}`}>
                      <a
                        target="_blank"
                        title={item.teamName}
                        className="text-clamp flex-1 break-words pr-[2px]"
                        onClick={() =>
                          onTeamClick(item?.teamUid, item?.teamName)
                        }
                      >
                        <span className="flex items-center gap-1">
                          <div className="h-[32px] w-[32px]">
                            <img
                              alt="team logo"
                              src={
                                item?.teamLogo ||
                                '/assets/images/icons/teamdefault.svg'
                              }
                              className="h-[32px] w-[32px] "
                            />
                          </div>
                          <span>{item.teamName}</span>
                        </span>
                      </a>
                    </Link>
                  </span>
                </div>
                <div className="flex w-[150px] items-center justify-start">
                  {/* <p className="text-clamp break-words pr-[2px]">
                {item.telegramId}
              </p> */}
                  <Link href={`https://t.me/${item.telegramId}`}>
                    <a
                      target="_blank"
                      title={item.telegramId}
                      className="text-clamp w-fit break-words pr-[2px]"
                      onClick={() =>
                        onTelegramClick(
                          `https://t.me/${item.telegramId}`,
                          item?.memberUid,
                          item?.memberName
                        )
                      }
                    >
                      {item.telegramId}
                    </a>
                  </Link>
                </div>
                <div className="flex w-[330px] items-center justify-start pr-[20px]">
                  <p
                    style={{ wordBreak: 'break-word' }}
                    className="break-words"
                  >
                    {item.reason}
                  </p>
                </div>
              </div>
            );
          })}
        {filteredList.length === 0 && (
          <div className="flex w-[896px] justify-center border-b-[1px] border-b-[#CBD5E1]  py-5 text-sm font-[500] text-[#64748B]">
            No results found
          </div>
        )}
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

export default MemberList;
