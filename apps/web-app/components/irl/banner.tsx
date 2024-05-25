import { EVENT_TYPE } from 'apps/web-app/constants';
import { formatIrlEventDate } from 'apps/web-app/utils/irl.utils';

const Banner = (props: any) => {
  const eventDetails = props?.eventDetails;
  const description = eventDetails?.description;
  const name = eventDetails?.name;
  const bannerUrl = eventDetails?.bannerUrl;
  const startDate = eventDetails?.startDate;
  const endDate = eventDetails?.endDate;
  const eventLocation = eventDetails?.eventLocation;

  const eventDateRange = formatIrlEventDate(startDate, endDate);
  return (
    <div className="p-[20px]">
      <div className="pb-3 lg:pb-[14px]">
        <div className="h-[153px] w-[100%] rounded-[8px] bg-gray-400">
          <img
            src={bannerUrl}
            className="h-[153px] w-[100%] rounded-[8px] object-cover object-center"
            alt="banner"
            loading="lazy"
          />
        </div>
        <div className="mt-[12px] flex flex-col items-start justify-between gap-1 lg:mt-[24px] lg:flex-row lg:items-center">
          <p className="text-[24px] font-[700]">{name}</p>
          <div className="flex flex-wrap gap-[8px]">
            {eventDetails?.type === EVENT_TYPE.INVITE_ONLY && (
              <div className="lg:order-0 h-7 flex items-center gap-1 rounded-[24px] bg-[#F1F5F9] py-[6px] px-[12px] text-[12px] font-[500] text-[#0F172A]">
                <img
                  src="/assets/images/icons/invite-only.svg"
                  alt="invite-only"
                  width={16}
                />
                <p>Invite Only</p>
              </div>
            )}
            <div className="h-7 flex items-center gap-1 rounded-[24px] bg-[#F1F5F9] py-[6px] px-[12px] text-[12px] font-[500] text-[#475569] lg:order-1">
              <img
                src="/assets/images/icons/flat_calendar.svg"
                alt="calender"
                width={16}
                height={16}
              />
              <p>{eventDateRange}</p>
            </div>
            <div className="h-7 flex items-center gap-1 rounded-[24px] bg-[#F1F5F9] py-[6px] px-[12px] text-[12px] font-[500] text-[#475569] lg:order-2">
              <img
                src="/assets/images/icons/location-grey.svg"
                alt="calender"
                width={16}
                height={16}
              />
              <p title={eventLocation} className='h-full max-w-[100px] overflow-hidden text-ellipsis'>{eventLocation}</p>
            </div>
          </div>
        </div>
        <div
          className="mt-[10px] text-[15px] font-[400] leading-6 text-[#0F172A]"
          dangerouslySetInnerHTML={{ __html: description }}
        ></div>
      </div>
    </div>
  );
};

export default Banner;
