import { APP_ANALYTICS_EVENTS } from 'apps/web-app/constants';
import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';
import { formatIrlEventDate } from 'apps/web-app/utils/irl.utils';
import { getUserInfo } from 'apps/web-app/utils/shared.utils';
import Resources from './resources';

const Banner = (props: any) => {
  const eventDetails = props?.eventDetails;
  const description = eventDetails?.description;
  const name = eventDetails?.name;
  const bannerUrl = eventDetails?.bannerUrl;
  const startDate = eventDetails?.startDate;
  const endDate = eventDetails?.endDate;
  const isUserLoggedIn = props?.isUserLoggedIn;
  const resources = eventDetails?.resources ?? [];

  const analytics = useAppAnalytics();
  const user = getUserInfo();
  const eventDateRange = formatIrlEventDate(startDate, endDate);
  const isPastEvent = eventDetails?.isPastEvent;
  const addEventLink = process.env.IRL_ADD_EVENT_URL;

  const onScheduleClick = () => {
    analytics.captureEvent(
      APP_ANALYTICS_EVENTS.IRL_BANNER_VIEW_SCHEDULE_BTN_CLICKED,
      {
        eventId: eventDetails?.id,
        eventName: eventDetails?.name,
        isPastEvent,
        schedulePageUrl: eventDetails?.websiteUrl,
        user,
      }
    );
  };

  const onAddScheduleClick = () => {
    analytics.captureEvent(
      APP_ANALYTICS_EVENTS.IRL_BANNER_ADD_EVENT_BTN_CLICKED,
      {
        eventId: eventDetails?.id,
        eventName: eventDetails?.name,
        addEventUrl: addEventLink,
        isPastEvent,
        user,
      }
    );
    window.open(addEventLink, '_blank');
  };

  return (
    <div className="p-[20px]">
      <div className="pb-3 lg:pb-[14px]">
        <div className="h-[153px] w-[100%] rounded-[8px] bg-gray-400">
          <img
            src={bannerUrl}
            className="h-[153px] w-[100%] rounded-[8px] object-cover object-center"
          />
        </div>
        <div className="mt-[12px] flex flex-col items-start justify-between gap-1 lg:mt-[24px] lg:flex-row lg:items-center">
          <p className="text-[24px] font-[700]">{name}</p>
          <div className="flex gap-[8px]">
            <div className="flex items-center gap-1 rounded-[24px] bg-[#F1F5F9] py-[6px] px-[12px] text-[12px] font-[500] text-[#475569] lg:order-1">
              <img src="/assets/images/icons/flat_calendar.svg" />
              <p>{eventDateRange}</p>
            </div>
            {eventDetails.type === 'INVITE_ONLY' && (
              <div className="flex items-center gap-1 rounded-[24px] bg-[#F1F5F9] py-[6px] px-[12px] text-[12px] font-[500] text-[#0F172A]">
                <img src="/assets/images/icons/invite-only.svg" />
                <p>Invite Only</p>
              </div>
            )}
          </div>
        </div>
        <div
          className="mt-[10px] text-[15px] font-[400] leading-6 text-[#0F172A]"
          dangerouslySetInnerHTML={{ __html: description }}
        ></div>
      </div>
      {(eventDetails?.websiteUrl ||
        (resources?.length > 0 && isUserLoggedIn)) && (
        <div className="flex flex-col items-center justify-between gap-5 border-t border-[#E2E8F0] pt-5 lg:flex-row">
          {isUserLoggedIn && resources?.length > 0 && (
            <div className="w-full lg:w-[unset]">
              <Resources eventDetails={eventDetails} />
            </div>
          )}
          {eventDetails?.websiteUrl && (
            <div className="flex w-full items-center justify-start gap-3 lg:w-[unset]">
              <a
                target="_blank"
                rel="noreferrer"
                href={eventDetails?.websiteUrl}
                className="flex h-[40px] items-center justify-center gap-[8px] rounded-[8px] border border-[#CBD5E1] bg-white px-[18px] py-[10px] text-[14px] font-[500] leading-5 text-[#0F172A] lg:w-[unset] lg:px-6"
                onClick={onScheduleClick}
              >
                View Schedule
              </a>

              {/* {!eventDetails?.websiteUrl && (
            <Tooltip
              content="Coming Soon"
              align='center'
              asChild
              trigger={
                <button
                  className="flex h-[40px] items-center justify-center gap-[8px] rounded-[8px] border border-[#CBD5E1] bg-white px-[18px] py-[10px] text-[14px] font-[500] leading-5 text-[#0F172A] lg:w-[unset] lg:px-6 cursor-default"
                >
                  Network Side Events
                </button>
              }
            ></Tooltip>
          )} */}
              {/* {!isPastEvent && isUserLoggedIn && (
            <button
              onClick={onAddScheduleClick}
              className=" flex h-10 w-[154px] items-center justify-center gap-2 rounded-lg border border-[#CBD5E1] bg-white py-[10px] text-[14px] font-[500] leading-5 text-[#0F172A] lg:w-[unset] lg:px-6"
            >
              <img src="/assets/images/icons/plus-black.svg" alt="add" />
              Add Event
            </button>
          )} */}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Banner;
