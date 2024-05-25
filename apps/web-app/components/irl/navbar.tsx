import { APP_ANALYTICS_EVENTS } from 'apps/web-app/constants';
import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';
import { getUserInfo } from 'apps/web-app/utils/shared.utils';
import Link from 'next/link';

const Navbar = (props) => {
  const analytics = useAppAnalytics();
  const eventDetails = props?.eventDetails;
  const user = getUserInfo();

  const onNavigate = () => {
    analytics.captureEvent(APP_ANALYTICS_EVENTS.IRL_NAVBAR_BACK_BTN_CLICKED, {
      eventId: eventDetails?.id,
      eventName: eventDetails?.name,
      user,
    });
  };

  return (
    <>
      <div className="flex h-full items-center justify-between px-4 lg:px-[unset]">
        <Link href="/irl">
          <a
            onClick={onNavigate}
            className="flex items-center gap-1 text-sm font-[500] leading-6 text-[#156FF7] lg:hidden"
          >
            <img
              src="/assets/images/icons/left-arrow-blue.svg"
              alt="left arrow"
              width={16}
              height={16}
            />
            Back
          </a>
        </Link>
        <Link href="/irl">
          <a
            onClick={onNavigate}
            className="hidden items-center gap-1 text-sm font-[500] leading-6 text-[#156FF7] lg:flex"
          >
            <img
              src="/assets/images/icons/left-arrow-blue.svg"
              alt="left arrow"
            />
            Back to IRL Gatherings
          </a>
        </Link>
        <button className="hidden items-center gap-1 text-sm font-[500] leading-6 text-[#64748B] ">
          <img src="/assets/images/icons/settings-grey.svg" alt="settings" />
          Manage
        </button>
      </div>
      <style jsx>{`
        .nav {
          height: inherit;
          display: flex;
          align-items: center;
          padding-inline: 20px;
        }

        .nav__backBtn__mob,
        .nav__backBtn__desc {
          color: #64748b;
          font-weight: 500;
          font-size: 14px;
          font-weight: 500;
          line-height: 24px;
        }

        .nav__backBtn__desc {
          display: none;
        }

        @media (min-width: 1024px) {
          .nav {
            padding-inline: unset;
          }

          .nav__backBtn__mob {
            display: none;
          }

          .nav__backBtn__desc {
            display: block;
          }
        }
      `}</style>
    </>
  );
};

export default Navbar;
