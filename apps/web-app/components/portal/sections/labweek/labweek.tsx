import { trackGoal } from 'fathom-client';
import { APP_ANALYTICS_EVENTS, FATHOM_EVENTS } from '../../../../constants';

import { ArrowSmRightIcon } from '@heroicons/react/solid';
import { EventCard } from '../../event-card/event-card';
import useAppAnalytics from '../../../../hooks/shared/use-app-analytics';

export const LabWeek = () => {
  const appAnalytics = useAppAnalytics();
  const onWebsiteLinkClicked = () => {
    appAnalytics.captureEvent(APP_ANALYTICS_EVENTS.HOME_LABWEEK_WEBSITE_LINK_CLICKED)
  }

  const onEventScheduleLinkClicked = () => {
    appAnalytics.captureEvent(APP_ANALYTICS_EVENTS.HOME_LABWEEK_SCHEDULE_LINK_CLICKED)
  }
  return (
    <section className="text-left md:text-center py-[24px] relative">

      <div className="md:mb-18 mb-6">
        <h2 className="text-4xl font-bold leading-[46px] md:text-5xl md:leading-[60px]">
          LabWeek23
        </h2>
        <p className="text-[16px] leading-6 text-slate-600 md:mx-auto mt-[8px] lg:mt-[16px] md:text-lg w-full lg:w-[880px] xl:w-[920px]">
          LabWeek23 is Protocol Lab's annual decentralized global conference. It features several days of curated events, all organized by the visionary teams in the Protocol Labs Network to advance our mission — to drive breakthroughs in computing to push humanity forward.
        </p>
      </div>

      <div className="w-full h-fit relative  bg-[#156FF7]">
        <picture className="object-cover w-full -mt-[24px]">
          <source media="(max-width: 767px)" srcSet="/assets/images/home/labweek_banner_mobile.jpg, /assets/images/home/labweek_banner_mobile2x.jpg 2x" />
          <source media="(max-width: 1199px)" srcSet="/assets/images/home/labweek_banner_tab.jpg, /assets/images/home/labweek_banner_tab2x.jpg 2x" />
          <source media="(min-width: 1200px)" srcSet="/assets/images/home/labweek_banner_desktop.jpg, /assets/images/home/labweek_banner_desktop2x.jpg 2x" />
          <img className="w-full" src="/assets/images/home/labweek_banner_tab.jpg" />
        </picture>
        <div className="w-full h-full py-[36px] absolute top-0 left-0 flex flex-col items-center justify-center">
          <img className="w-[70px] lg:w-[98px]" src="/assets/images/icons/labweek23.svg" />
          <h2 className="text-[46px] lg:text-[55px] mt-[19px] leading-[46px] lg:leading-[55px] text-[#fff]">LabWeek23</h2>
          <p className="text-[16px] my-[16px] md:my-[12px] text-[#fff] text-center w-[238px] font-[400]">Happening at Istanbul between 13th - 17th Nov</p>
          <div className="flex flex-col lg:flex-row gap-[12px] items-center">
            <a onClick={onWebsiteLinkClicked} target="_blank" href="https://23.labweek.io" className="bg-white px-[24px] w-fit py-[10px] rounded-[8px] text-[14px] font-[500] text-[#0F172A] cursor-pointer" rel="noreferrer">Visit Website</a>
            <a onClick={onEventScheduleLinkClicked} target="_blank" href="https://23.labweek.io/schedule/calendar" className="border-solid w-fit border-white border-[1px] px-[24px] py-[10px] rounded-[8px] text-[14px] font-[500] text-[#fff] cursor-pointer bg-[#156FF7]" rel="noreferrer">See Event Schedule</a>
          </div>
        </div>
      </div>
    </section>
  );
};
