import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';
import { APP_ANALYTICS_EVENTS } from 'apps/web-app/constants';

function HeaderStrip(props) {
  const analytics = useAppAnalytics();
  const eventDetails = props?.eventDetails;
  const requestFormLink = process.env.IRL_PGF_FORM_URL;

  const onNavigate = () => {
    analytics.captureEvent(
      APP_ANALYTICS_EVENTS.IRL_HEADER_JOIN_BTN_CLICKED,
      {
        eventId: eventDetails?.id,
        eventName: eventDetails?.name,
        url: requestFormLink,
      }
    );
    window.open(requestFormLink, '_blank');
  };


  return (
    <>
      <div className="mt-[18px] flex w-full flex-col items-center justify-center gap-[4px] bg-[#FFE2C8] px-[20px] py-[8px] text-center text-[14px] font-[400] lg:mt-0 lg:flex-row lg:rounded-[8px]">
        <div className="inline-block">
          <img
            className="mr-[4px] -mt-[2px] inline"
            src="/assets/images/icons/info.svg"
          />
          Attending this event but aren&apos;t part of the network yet?{` `}
          <button
            onClick={onNavigate}
            className="ml-[4px] rounded-[8px] bg-white px-[10px] py-[6px] text-[14px] font-[500]"
          >
            Join
          </button>
        </div>
      </div>
    </>
  );
}

export default HeaderStrip;
