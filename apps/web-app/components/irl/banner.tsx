import { useEffect, useState } from "react";

const Banner = (props: any) => {

  const eventDetails = props?.eventDetails;

  const eventCount = eventDetails?.eventCount;
  const peopleCount = eventDetails?.guests.length;
  const description = eventDetails?.description;
  const name = eventDetails?.name;
  const bannerUrl = eventDetails?.bannerUrl;

  const [memberCount, setMemberCount] = useState(peopleCount);
  useEffect(() => {
    const handler = (e: any) => {
      const eventDetails = e.detail.eventDetails;
      setMemberCount(eventDetails?.guests?.length ?? 0);
    };
    document.addEventListener('updateGuests', handler);
    return () => {
      document.removeEventListener('updateGuests', handler);
    };
  }, []);

  return (
    <div className="p-[20px]">
      <div className="h-[153px] w-[100%] rounded-[8px] bg-gray-400">
        <img src={bannerUrl} className="h-[153px] w-[100%] rounded-[8px] object-cover object-bottom" />
      </div>
      <div className="mt-[24px] flex flex-col lg:flex-row justify-between items-start lg:items-center">
        <p className="text-[24px] font-[700]">
          {name}
        </p>
        <div className="flex gap-[8px]">
          <div className="py-[6px] px-[12px] bg-[#F1F5F9] text-[12px] font-[500] flex gap-[6px] rounded-[24px] items-center">
            <img src="/assets/images/icons/thumbs-up.svg"/>
            <p>{memberCount} Going</p>
          </div>
          <div className="py-[6px] px-[12px] bg-[#F1F5F9] text-[12px] font-[500] flex gap-[6px] rounded-[24px] items-center">
            <img src="/assets/images/icons/flat_calendar.svg"/>
            <p>{eventCount} Events</p>
          </div>
        </div>
      </div>
      <p className="mt-[10px] text-[15px] font-[400]">
        {description}
      </p>
    </div>
  );
};

export default Banner;