import { useState } from 'react';
import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';
import { APP_ANALYTICS_EVENTS } from 'apps/web-app/constants';

function HeaderStrip(props) {
  const onJoin = props.onJoin;
  const analytics = useAppAnalytics();

  const onNavigate = () => {
    analytics.captureEvent(
      APP_ANALYTICS_EVENTS.IRL_HEADER_REQUEST_TO_ACCESS_BTN_CLICKED,
      {
        url: 'https://airtable.com/embed/appHT5ErKdHcsFznj/pagndJEJUpSoMD6LM/form',
      }
    );
    window.open('https://airtable.com/embed/appHT5ErKdHcsFznj/pagndJEJUpSoMD6LM/form', '_blank');
  };


  return (
    <>
      <div className="mb-[18px] mt-[18px] flex w-full flex-col items-center justify-center gap-[4px] bg-[#FFE2C8] px-[20px] py-[8px] text-center text-[14px] font-[400] lg:mt-0 lg:flex-row lg:rounded-[8px]">
        <div className="inline-block">
          <img
            className="mr-[4px] -mt-[2px] inline"
            src="/assets/images/icons/info.svg"
          />
          Joining this event but you aren&apos;t a network member yet?{` `}
          <button
            onClick={onNavigate}
            className="ml-[4px] rounded-[8px] bg-white px-[10px] py-[6px] text-[14px] font-[500]"
          >
            Request To Access
          </button>
        </div>
      </div>
    </>
  );
}

export default HeaderStrip;
