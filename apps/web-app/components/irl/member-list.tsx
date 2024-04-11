import Link from 'next/link';
import { useEffect, useState } from 'react';

const MemberList = (props: any) => {
  const items = props?.items ?? [];
  const userInfo = props?.userInfo;

  const [guests, setGuests] = useState(items);
  useEffect(() => {
    const handler = (e: any) => {
      const eventDetails = e.detail.eventDetails;

      const isUserGoing = eventDetails.guests.some(
        (guest) => guest.memberUid === userInfo.uid && guest.memberUid
      );

      if (isUserGoing) {
        const currentUser = [...eventDetails.guests].find(
          (v) => v.memberUid === userInfo.uid
        );
        if (currentUser) {
          currentUser.memberName = `(You) ${currentUser.memberName}`;
          const filteredList = [...eventDetails.guests].filter(
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
              <div className="h-[32px] w-[32px] rounded-[58px] bg-gray-200">
                {item?.memberLogo && (
                  <img
                    alt="member image"
                    src={item?.memberLogo}
                    className="h-[32px] w-[32px] rounded-[58px] bg-gray-200"
                  />
                )}
              </div>
              <Link href={`/members/${item.memberUid}`}>
              <a target='_blank' title={item.memberName} className="text-clamp flex-1 break-words pr-[3px]">
                {item.memberName}
              </a>
              </Link>
            </div>
            <div className="flex w-[200px] items-center justify-start gap-[4px]">
              <div className="h-[32px] w-[32px] bg-gray-200">
                {item?.teamLogo && (
                  <img
                    alt="team logo"
                    src={item?.teamLogo}
                    className="h-[32px] w-[32px] bg-gray-200"
                  />
                )}
              </div>
              <Link href={`/teams/${item.teamUid}`}>
              <a target='_blank' title={item.teamName} className="text-clamp flex-1 break-words pr-[2px]">
                {item.teamName}
              </a>
              </Link>
            </div>
            <div className="flex w-[150px] items-center justify-start">
              <p className="text-clamp break-words pr-[2px]">
                {item.telegramId}
              </p>
            </div>
            <div className="flex w-[330px] items-center justify-start pr-[20px]">
              <p className="text-clamp break-words">{item.reason}</p>
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
