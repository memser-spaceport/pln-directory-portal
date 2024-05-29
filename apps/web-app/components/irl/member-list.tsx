import { APP_ANALYTICS_EVENTS } from 'apps/web-app/constants';
import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';
import { getUserInfo } from 'apps/web-app/utils/shared.utils';
import Link from 'next/link';
import GuestDescription from './guest-description';
import { formatDateRange } from 'apps/web-app/utils/irl.utils';
import { Tooltip } from './tooltip';

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
        {filteredList?.length > 0 &&
          filteredList?.map((item, itemIndex) => {
            const isUserGoing = item.memberUid === userInfo.uid;
            const topicsNeedToShow = 2;
            const topics = item?.topics;
            const remainingTopics = topics
              ?.slice(topicsNeedToShow, topics?.length)
              ?.map((topic) => topic);
            return (
              <div
                key={`${itemIndex}-event-list`}
                className={`${isUserGoing ? 'bg-[#FFFAE6]' : ''} flex w-fit ${
                  itemIndex !== filteredList?.length - 1
                    ? 'border-b-[1px] border-b-[#CBD5E1]'
                    : ''
                } py-[12px] px-5 text-[13px] font-[400] lg:w-[100%]`}
              >
                    <div className="flex w-[160px] items-center justify-start gap-[4px] pr-4">
                  <Link href={`/members/${item.memberUid}`}>
                    <a
                      title={item.memberName}
                      target="_blank"
                      className="flex w-fit items-start gap-2 items-center"
                      onClick={() =>
                        onMemberClick(item?.memberUid, item?.memberName)
                      }
                    >
                      <div className="h-[32px] w-[32px] rounded-[58px]">
                        <img
                          alt="member image"
                          src={
                            item?.memberLogo ||
                            '/assets/images/icons/memberdefault.svg'
                          }
                          loading="lazy"
                          className="h-[32px] w-[32px] rounded-[58px] bg-gray-200 object-cover"
                        />
                      </div>
                      <div
                        style={{ wordBreak: 'break-word' }}
                        className="flex flex-1 flex-col"
                      >
                        <div className="text-clamp text-[13px] leading-5 text-[#000000]">
                          {item.memberName}
                        </div>
                        {item?.telegramId ? (
                          <span className="flex items-center gap-1">
                            <img
                              src="/assets/images/icons/telegram-solid.svg"
                              alt="telegram"
                            />
                            <a
                              target="_blank"
                              title={item.telegramId}
                              href={`https://t.me/${item.telegramId}`}
                              className="text-clamp text-[12px] leading-5 text-[#156FF7]"
                              onClick={(e) => {
                                e.stopPropagation();
                                onTelegramClick(
                                  item.telegramId,
                                  item?.memberUid,
                                  item?.memberName
                                );
                              }} 
                              rel="noreferrer"
                            >
                              @{item?.telegramId}
                            </a>
                          </span>
                        ) : (
                          <span onClick={(e) => e.preventDefault()} className="text-[#156FF7] cursor-default">-</span>
                        )}
                      </div>
                    </a>
                  </Link>
                </div>
                <div className="flex w-[160px] items-center justify-start gap-[4px]">
                  <span>
                    <Link href={`/teams/${item.teamUid}`}>
                      <a
                        target="_blank"
                        title={item.teamName}
                        className="flex w-fit items-center gap-1"
                        onClick={() =>
                          onTeamClick(item?.teamUid, item?.teamName)
                        }
                      >
                        <div className="h-[32px] w-[32px]">
                          <img
                            alt="team logo"
                            src={
                              item?.teamLogo ||
                              '/assets/images/icons/teamdefault.svg'
                            }
                            className="h-[32px] w-[32px] "
                            loading="lazy"
                          />
                        </div>
                        <div style={{ wordBreak: 'break-word' }}>
                          {item.teamName}
                        </div>
                      </a>
                    </Link>
                  </span>
                </div>
            
                {!eventDetails?.isExclusionEvent && (
                  <div className="w-[160px]">
                    <span className="flex h-full items-center text-[13px] leading-6 text-[#0F172A]">
                      {item?.memberRole}
                    </span>
                  </div>
                )}
                {eventDetails?.isExclusionEvent && (
                  <div className="w-[160px]">
                    <span className="flex h-full items-center text-[13px] leading-6 text-[#0F172A]">
                      {formatDateRange(
                        item?.additionalInfo?.checkInDate,
                        item?.additionalInfo?.checkOutDate
                      )}
                    </span>
                  </div>
                )}
                <div className="flex w-[380px] flex-col justify-start gap-1">
                  <GuestDescription description={item?.reason} />
                  <div className="flex flex-wrap items-center gap-1">
                    {topics?.slice(0, topicsNeedToShow).map((topic, index) => (
                      <Tooltip
                      key={`${topic}-${index}`}
                      asChild
                      align='start'
                      content={
                      <div className="word-break rounded max-w-[200px] bg-slate-900 px-2 py-1 text-xs font-medium text-white">
                        {topic}
                          </div>
                      }
                      trigger={
                      <div
                        key={`topic-${index}`}
                        className="word-break text-ellipsis max-w-[250px]  whitespace-nowrap overflow-hidden py-[2px] px-[8px] items-center rounded-[24px] border border-[#CBD5E1] bg-[#F1F5F9] text-xs font-[500] leading-[14px] text-[#475569]"
                      >
                        {topic}
                      </div>
                      }
                      />
                    ))}
                    {topics?.length > topicsNeedToShow && (
                      <Tooltip
                        asChild
                        content={
                          <>
                          <div className="rounded max-w-[200px] max-h-[250px] overflow-auto bg-slate-900 px-2 py-1 text-xs font-medium text-white">
                          {remainingTopics.map((topic: string, index: any) => (
                            <span className='word-break' key={`${topic} + ${index}`}> {topic}
                            {index !== remainingTopics.length -1 ? "," : ""}
                            <br/></span>
                            
                          ))}
                          </div>

                         
                          </>
                        }
                        align="start"
                        trigger={
                          <span className="cursor-default flex h-[20px] items-center rounded-[24px] border border-[#CBD5E1] bg-[#F1F5F9] px-2 text-xs font-[500] leading-[14px] text-[#475569]">
                            {`+${topics?.length - topicsNeedToShow}`}
                          </span>
                        }
                      />
                    )}
                  </div>
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

          .word-break {
            word-break: break-word;
          }
        `}
      </style>
    </>
  );
};

export default MemberList;
