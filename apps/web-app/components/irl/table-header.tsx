import { APP_ANALYTICS_EVENTS } from 'apps/web-app/constants';
import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';
import { getUserInfo } from 'apps/web-app/utils/shared.utils';
import { useState } from 'react';
import { getTopics, getUniqueRoles } from 'apps/web-app/utils/irl.utils';
import useFloatingMultiSelect from 'apps/web-app/hooks/shared/use-floating-multi-select';
import FloatingMultiSelect from './floating-multi-select';

const TableHeader = (props: any) => {
  const isUserLoggedIn = props.isUserLoggedIn ?? false;
  const eventDetails = props?.eventDetails;
  const sortConfig = props?.sortConfig;

  const analytics = useAppAnalytics();
  const user = getUserInfo();

  const roles = getUniqueRoles([...eventDetails?.guests]);
  const topics = getTopics([...eventDetails?.guests]);
  const [roleFilterItems, setRoleFilterItems] = useState([]);
  const [topicFilterItems, setTopicFilterItems] = useState([]);

  const roleFilterProps = useFloatingMultiSelect({
    items: roles,
    selectedItems: roleFilterItems,
  });

  const topicFilterProps = useFloatingMultiSelect({
    items: topics,
    selectedItems: topicFilterItems,
  });

  // sort columns
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

    document.dispatchEvent(
      new CustomEvent('irl-details-sortlist', {
        detail: {
          sortColumn: key,
        },
      })
    );
  };

  //get updated sort icon
  const getSortIcon = (column: string) => {
    if (sortConfig.key === column) {
      if (sortConfig.order === 'asc') {
        return '/assets/images/icons/sort-asc-blue.svg';
      } else if (sortConfig.order === 'desc') {
        return '/assets/images/icons/sort-desc-blue.svg';
      } else {
        return '/assets/images/icons/sort-grey.svg';
      }
    } else {
      return '/assets/images/icons/sort-grey.svg';
    }
  };

  //filter column by roles
  const onFilterByRoles = (items: any, from: string) => {

    if(from !== "reset") {
      analytics.captureEvent(
        APP_ANALYTICS_EVENTS.IRL_GUEST_LIST_TABLE_FILTER_APPLY_BTN_CLICKED,
        {
          eventId: eventDetails?.id,
          eventName: eventDetails?.name,
          column: 'member roles',
          filterValues: items,
          user,
      }
    );
  }
    document.dispatchEvent(
      new CustomEvent('irl-details-filterList', {
        detail: {
          key: 'roles',
          selectedItems: items,
        },
      })
    );
    setRoleFilterItems(items);
    roleFilterProps?.onClosePane();
    roleFilterProps?.setFilteredItems(roles);
  };

  //filter column by topics
  const onFilterByTopics = (items: any, from: string) => {

    if(from !== "reset") {
      analytics.captureEvent(
        APP_ANALYTICS_EVENTS.IRL_GUEST_LIST_TABLE_FILTER_APPLY_BTN_CLICKED,
        {
        eventId: eventDetails?.id,
        eventName: eventDetails?.name,
        column: 'topics',
        filterValues: items,
        user,
      }
    );
  }

    document.dispatchEvent(
      new CustomEvent('irl-details-filterList', {
        detail: {
          key: 'topics',
          selectedItems: items,
        },
      })
    );
    setTopicFilterItems(items);
    topicFilterProps?.onClosePane();
    topicFilterProps?.setFilteredItems(topics);
  };

  //claer role filter
  const onClearRoleFilter = (e) => {
    document.dispatchEvent(
      new CustomEvent('irl-details-filterList', {
        detail: {
          key: 'roles',
          selectedItems: [],
        },
      })
    );
    setRoleFilterItems([]);
    roleFilterProps?.onClearSelection(e);
  };

  //clear topic filter
  const onClearTopicFilter = (e) => {
    document.dispatchEvent(
      new CustomEvent('irl-details-filterList', {
        detail: {
          key: 'topics',
          selectedItems: [],
        },
      })
    );
    setTopicFilterItems([]);
    topicFilterProps?.onClearSelection(e);
  };

  const onTopicsFilterclicked = () => {
    analytics.captureEvent(
      APP_ANALYTICS_EVENTS.IRL_GUEST_LIST_TABLE_FILTER_BTN_CLICKED,
      {
        eventId: eventDetails?.id,
        eventName: eventDetails?.name,
        column: 'topics',
        user,
      }
    );
    topicFilterProps?.onOpenPane();
    roleFilterProps?.onClosePane();
  }

  const onMemberRoleFilterClicked = () => {
    analytics.captureEvent(
      APP_ANALYTICS_EVENTS.IRL_GUEST_LIST_TABLE_FILTER_BTN_CLICKED,
      {
        eventId: eventDetails?.id,
        eventName: eventDetails?.name,
        column: 'member roles',
        user,
      }
    );

    roleFilterProps?.onOpenPane();
    topicFilterProps.onClosePane();
  } 

  return (
    <>
      {isUserLoggedIn && (
        <div className="sticky top-0 z-[2]  flex h-[42px] w-fit rounded-tl-[8px] rounded-tr-[8px] border-b-[1px] border-b-[#64748B] bg-white px-5 text-[13px] font-[600] shadow-sm lg:w-[calc(100%_-_2px)]">
          <div className="flex w-[160px] items-center justify-start">
            <div
              onClick={() => onSort('memberName')}
              className="flex cursor-pointer items-center gap-1"
            >
              <img
                src={getSortIcon('memberName')}
                alt="sort"
                width={16}
                height={16}
              />
              Attendee Name
            </div>
          </div>
          <div className="flex w-[160px] items-center justify-start">
            <div
              className="flex cursor-pointer items-center gap-1"
              onClick={() => onSort('teamName')}
            >
              <img
                src={getSortIcon('teamName')}
                alt="sort"
                width={16}
                height={16}
              />
              Team
            </div>
          </div>
      
          {/* {!eventDetails?.isExclusionEvent && ( */}
            {/* <div className="relative flex w-[200px] items-center justify-start gap-[10px]">
              Member Role
              {roles?.length > 0 && (
                <>
                  <div className="flex items-center gap-[2px]">
                    <button
                      onClick={onMemberRoleFilterClicked}
                    >
                      <img
                        width={16}
                        height={16}
                        src="/assets/images/icons/filter-blue.svg"
                        alt="filter"
                      />
                    </button>
                    {roleFilterItems?.length > 0 && (
                      <div className="flex h-[18px] items-center gap-[2px] rounded-[36px] bg-[#156FF7] px-2 text-white">
                        {roleFilterItems?.length}
                        <button onClick={onClearRoleFilter}>
                          <img
                            width={10}
                            height={10}
                            src="/assets/images/icons/close-white.svg"
                            alt="count"
                          />
                        </button>
                      </div>
                    )}
                  </div>
                  {roleFilterProps?.isPaneActive && (
                    <div className="absolute top-[33px] left-0 w-[238px]">
                      <FloatingMultiSelect
                        {...roleFilterProps}
                        items={roles}
                        onFilter={onFilterByRoles}
                      />
                    </div>
                  )}
                </>
              )}
            </div> */}
          {/* )} */}
          <div className="relative flex w-[340px] items-center justify-start gap-[10px]">
            Topics you are interested in
            {topics?.length > 0 && (
              <>
                <div className="flex items-center gap-[2px]">
                  <button
                    onClick={onTopicsFilterclicked}
                  >
                    <img
                      width={16}
                      height={16}
                      src="/assets/images/icons/filter-blue.svg"
                      alt="filter"
                    />
                  </button>
                  {topicFilterItems?.length > 0 && (
                    <div className="flex h-[18px] items-center gap-[2px] rounded-[36px] bg-[#156FF7] px-2 text-white">
                      {topicFilterItems?.length}
                      <button onClick={onClearTopicFilter}>
                        <img
                          width={10}
                          height={10}
                          src="/assets/images/icons/close-white.svg"
                          alt="count"
                        />
                      </button>
                    </div>
                  )}
                </div>
                {topicFilterProps?.isPaneActive && (
                  <div className="absolute top-[33px] left-0 w-[238px]">
                    <FloatingMultiSelect
                      {...topicFilterProps}
                      items={topics}
                      onFilter={onFilterByTopics}
                    />
                  </div>
                )}
              </>
            )}
          </div>
          {eventDetails?.isExclusionEvent && (
            <div className="flex w-[160px] items-center justify-start gap-[10px]">
              {`Date(s) Attending`}
            </div>
          )}
            <div className="flex w-[170px] items-center justify-start gap-[10px]">
              Connect
            </div>
        </div>
      )}
      {!isUserLoggedIn && (
        <div className="hideInMobile sticky top-0  z-[2] flex h-[42px] w-[calc(100%_-_2px)] rounded-tl-[8px] rounded-tr-[8px] border-b-[1px] border-b-[#64748B] bg-white text-[13px] font-[600] shadow-sm">
          <div className="flex w-[200px] items-center justify-start pl-[20px]">
            Team
          </div>
          <div className="flex w-[160px] items-center justify-start">
            Attendee Name
          </div>
          {/* {!eventDetails?.isExclusionEvent && ( */}
            {/* <div className="flex w-[160px] items-center justify-start">
              Member Role
            </div> */}
          {/* )} */}
          {eventDetails?.isExclusionEvent && (
            <div className="flex w-[160px] items-center justify-start">
              {`Date(s) Attending`}
            </div>
          )}
          <div className="flex  items-center justify-start pr-[20px]">
            Topics you are interested in
          </div>
          <div className="flex  items-center justify-start pr-[20px]">
            Connect 
          </div>
        </div>
      )}
      {!isUserLoggedIn && (
        <div className="hideInDesktop sticky top-0  z-[2] flex h-[42px] w-[calc(100%_-_2px)] items-center justify-between rounded-tl-[8px] rounded-tr-[8px] border-b-[1px] border-b-[#64748B] bg-white px-5 text-[13px] font-[600] shadow-sm">
          <div className="flex w-[200px] items-center justify-start">Team</div>
          {/* <div className="text-[13px] font-[400] leading-6 text-[#0F172A]">{`${filteredList.length} Attendees`}</div> */}
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
