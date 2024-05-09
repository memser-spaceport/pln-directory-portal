import { APP_ANALYTICS_EVENTS } from 'apps/web-app/constants';
import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';
import { getUserInfo } from 'apps/web-app/utils/shared.utils';
import { useState } from 'react';

const TableHeader = (props: any) => {
  const isUserLoggedIn = props.isUserLoggedIn ?? false;
  const eventDetails = props?.eventDetails;
  // const guests = eventDetails?.guests;
  const filteredList = props?.filteredList;
  const analytics = useAppAnalytics();
  const user = getUserInfo();

  const [sortConfig, setSortConfig] = useState({ key: null, order: null });

  const onSort = (key) => {
    analytics.captureEvent(
      APP_ANALYTICS_EVENTS.IRL_GUEST_LIST_TABLE_SORT_CLICKED,
      {
        eventId: eventDetails?.id,
        eventName: eventDetails?.name,
        column: key,
        user,
      }
    );

    setSortConfig((old) => {
      if (old.key === key) {
        if (old.order === 'asc') {
          return { key: old.key, order: 'desc' };
        }
        return { key: old.key, order: 'asc' };
      } else {
        return { key, order: 'desc' };
      }
    });

    document.dispatchEvent(
      new CustomEvent('irl-details-sortlist', {
        detail: {
          sortColumn: key,
        },
      })
    );
  };

  return (
    <>
      {isUserLoggedIn && (
        <div className="sticky top-0  z-[2] flex h-[42px] w-fit rounded-tl-[8px] rounded-tr-[8px] border-b-[1px] border-b-[#64748B] bg-white text-[13px] font-[600] shadow-sm lg:w-[calc(100%_-_2px)]">
          <div className="flex w-[200px] items-center justify-start  pl-[20px]">
            <div
              onClick={() => onSort('memberName')}
              className="flex cursor-pointer items-center gap-1"
            >
              <img
                src={
                  sortConfig.order === 'asc'
                    ? '/assets/images/icons/sort-asc-black.svg'
                    : sortConfig.order === 'desc'
                    ? '/assets/images/icons/sort-desc-black.svg'
                    : '/assets/images/icons/sort-black.svg'
                }
                alt="sort"
              />
              {` Attendee Name (${filteredList.length})`}
            </div>
          </div>
          <div className="flex w-[200px] items-center justify-start">Team</div>
          <div className="flex w-[150px] items-center justify-start">
            Telegram
          </div>
          <div className="flex w-[340px] items-center justify-start pr-[20px]">
            Topics are you interested in connecting on? Why?
          </div>
        </div>
      )}
      {!isUserLoggedIn && (
        <div className="hideInMobile sticky top-0  z-[2] flex h-[42px] w-[calc(100%_-_2px)] rounded-tl-[8px] rounded-tr-[8px] border-b-[1px] border-b-[#64748B] bg-white text-[13px] font-[600] shadow-sm">
          <div className="flex w-[200px] items-center justify-start pl-[20px]">
            Team
          </div>
          <div className="flex w-[200px] items-center justify-start">
            {` Attendee Name (${filteredList.length})`}
          </div>
          <div className="flex w-[150px] items-center justify-start">
            Telegram
          </div>
          <div className="flex w-[340px] items-center justify-start pr-[20px]">
            Topics are you interested in connecting on? Why?
          </div>
        </div>
      )}
      {!isUserLoggedIn && (
        <div className="hideInDesktop sticky top-0  z-[2] flex h-[42px] w-[calc(100%_-_2px)] items-center justify-between rounded-tl-[8px] rounded-tr-[8px] border-b-[1px] border-b-[#64748B] bg-white px-5 text-[13px] font-[600] shadow-sm">
          <div className="flex w-[200px] items-center justify-start">Team</div>
          <div className="text-[13px] font-[400] leading-6 text-[#0F172A]">{`${filteredList.length} Attendees`}</div>
        </div>
      )}
      <style jsx>
        {`
          .hideInMobile {
            display: none;
          }
          .hideInDesktop {
            display: flex;
          }
          @media (min-width: 1024px) {
            .hideInMobile {
              display: flex;
            }
            .hideInDesktop {
              display: none;
            }
          }
        `}
      </style>
    </>
  );
};

export default TableHeader;
