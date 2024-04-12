import { APP_ANALYTICS_EVENTS } from 'apps/web-app/constants';
import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';
import { getUserInfo } from 'apps/web-app/utils/shared.utils';
import Link from 'next/link';
import { useEffect, useState } from 'react';

const MemberList = (props: any) => {
  const items = props?.items ?? [];
  const userInfo = props?.userInfo;

  const analytics = useAppAnalytics();
  const user = getUserInfo();
  const [guests, setGuests] = useState(items);

  const onTeamClick = (teamUid: string, teamName: string) => {
    analytics.captureEvent(
      APP_ANALYTICS_EVENTS.IRL_GUEST_LIST_TABLE_TEAM_CLICKED,
      {
        teamUid,
        teamName,
        user,
      }
    );
  };

  const onMemberClick = (memberUid: string, memberName: string) => {
    analytics.captureEvent(
      APP_ANALYTICS_EVENTS.IRL_GUEST_LIST_TABLE_TELEGRAM_LINK_CLICKED,
      {
        memberUid,
        memberName,
        user,
      }
    );
  };

  const onTelegramClick = (telegramUrl: string) => {
    analytics.captureEvent(
      APP_ANALYTICS_EVENTS.IRL_GUEST_LIST_TABLE_TELEGRAM_LINK_CLICKED,
      {
        telegramUrl,
        user,
      }
    );
  };

  useEffect(() => {
    const handler = (e: any) => {
      const eventDetails = e.detail.eventDetails;

      const notAvailableTeams = eventDetails?.guests.filter(
        (item) => item.teamUid === 'cleeky1re000202tx3kex3knn'
      );
      const otherTeams = eventDetails?.guests.filter(
        (item) => item.teamUid !== 'cleeky1re000202tx3kex3knn'
      );
      const combinedTeams = [...otherTeams, ...notAvailableTeams];
      eventDetails.guests = combinedTeams;

      const isUserGoing = eventDetails.guests.some(
        (guest) => guest.memberUid === userInfo.uid && guest.memberUid
      );

      if (isUserGoing) {
        const currentUser = [...combinedTeams].find(
          (v) => v.memberUid === userInfo.uid
        );
        if (currentUser) {
          currentUser.memberName = `(You) ${currentUser.memberName}`;
          const filteredList = [...combinedTeams].filter(
            (v) => v.memberUid !== userInfo.uid
          );
          const formattedGuests = [currentUser, ...filteredList];
          eventDetails.guests = formattedGuests;
        }
      }

      setGuests(eventDetails.guests);
    };
    document.addEventListener('updateGuests', handler);
    return () => {
      document.removeEventListener('updateGuests', handler);
    };
  }, []);

  return (
    <>
      <div className="flex flex-col pt-[8px] lg:w-full">
        {guests.map((item, itemIndex) => (
          <div
            key={`${itemIndex}-event-list`}
            className="flex w-fit border-b-[1px] border-b-[#CBD5E1] py-[12px] text-[13px] font-[400] lg:w-[100%]"
          >
            <div className="flex w-[200px] items-center justify-start gap-[4px] pl-[20px]">
              <Link href={`/members/${item.memberUid}`}>
                <a
                  target="_blank"
                  title={item.memberName}
                  className="break-words pr-[3px] w-fit"
                  onClick={() =>
                    onMemberClick(item?.memberUid, item?.memberName)
                  }
                >
                  <span className="flex items-center w-fit gap-1">
                    <div className="h-[32px] w-[32px] rounded-[58px] ">
                        <img
                          alt="member image"
                          src={item?.memberLogo || '/assets/images/icons/memberdefault.svg'}
                          className="h-[32px] w-[32px] rounded-[58px] bg-gray-200 object-cover"
                        />
                    </div>
                    <span className='w-fit'>{item.memberName}</span>
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
                    onClick={() => onTeamClick(item?.teamUid, item?.teamName)}
                  >
                    <span className="flex items-center gap-1">
                      <div className="h-[32px] w-[32px]">
                          <img
                            alt="team logo"
                            src={item?.teamLogo || '/assets/images/icons/teamdefault.svg'}
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
                    onTelegramClick(`https://t.me/${item.telegramId}`)
                  }
                >
                  {item.telegramId}
                </a>
              </Link>
            </div>
            <div className="flex w-[330px] items-center justify-start pr-[20px]">
              <p className="break-words">{item.reason}</p>
            </div>
          </div>
        ))}
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
