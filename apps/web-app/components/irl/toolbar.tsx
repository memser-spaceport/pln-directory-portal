import { useEffect, useState } from 'react';
import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';
import { APP_ANALYTICS_EVENTS } from 'apps/web-app/constants';
import { getUserInfo } from 'apps/web-app/utils/shared.utils';
import Search from './search';

const Toolbar = (props: any) => {
  const eventDetails = props?.eventDetails;
  const onLogin = props.onLogin;
  const isUserLoggedIn = props?.isUserLoggedIn;
  const isUserGoing = props?.isUserGoing;
  const isPastEvent = eventDetails?.isPastEvent;
  const filteredList = props?.filteredList;
  const [searchTerm, setSearchTerm] = useState('');
  const analytics = useAppAnalytics();
  const user = getUserInfo();

  const onIAmGoingClick = () => {
    analytics.captureEvent(
      APP_ANALYTICS_EVENTS.IRL_GUEST_LIST_IAM_GOING_BTN_CLICKED,
      {
        type: 'i am going',
        eventId: eventDetails?.id,
        eventName: eventDetails?.name,
        user,
      }
    );

    document.dispatchEvent(
      new CustomEvent('openRsvpModal', {
        detail: {
          isOpen: true,
        },
      })
    );
  };

  const onEditResponse = () => {
    analytics.captureEvent(APP_ANALYTICS_EVENTS.IRL_EDIT_RESPONSE_BTN_CLICKED, {
      type: 'edit response',
      eventId: eventDetails?.id,
      eventName: eventDetails?.name,
      user,
    });
    document.dispatchEvent(
      new CustomEvent('openRsvpModal', {
        detail: {
          isOpen: true,
        },
      })
    );
  };

  const getValue = (event: any) => {
    const searchValue = event?.target?.value;
    setSearchTerm(searchValue);
    document.dispatchEvent(
      new CustomEvent('irl-details-searchlist', {
        detail: {
          searchValue: searchValue,
        },
      })
    );
  };

  const onLoginClick = () => {
    analytics.captureEvent(
      APP_ANALYTICS_EVENTS.IRL_GUEST_LIST_LOGIN_BTN_CLICKED,
      {
        eventId: eventDetails?.id,
        eventName: eventDetails?.name,
        isPastEvent,
      }
    );
    onLogin();
  };

  const onTelegramLinkClick = () => {
    analytics.captureEvent(
      APP_ANALYTICS_EVENTS.IRL_GUEST_LIST_TELEGRAM_BTN_CLICKED,
      {
        eventId: eventDetails?.id,
        eventName: eventDetails?.name,
        telegramUrl: eventDetails?.telegram,
        isPastEvent,
        user,
      }
    );
  };

  useEffect(() => {
    if (searchTerm) {
      const handler = setTimeout(() => {
        analytics.captureEvent(APP_ANALYTICS_EVENTS.IRL_GUEST_LIST_SEARCH, {
          eventId: eventDetails?.id,
          eventName: eventDetails?.name,
          searchTerm,
          user,
        });
      }, 500);

      return () => {
        clearTimeout(handler);
      };
    }
  }, [searchTerm]);

  return (
    <>
      <div className="lg:flex-wrap-[unset] lg:justify-between-[unset] flex flex-wrap items-center justify-between gap-y-2 lg:items-center">
        <span className="w-auto text-[18px] font-[700] lg:text-[20px]">
          Attendees
          <span className="text-[14px] font-[400]"> ({filteredList.length})</span>
        </span>
        <div className="flex w-auto justify-end gap-[8px] lg:order-3 lg:flex-1">
          {eventDetails?.telegram && (
            <a
              href={eventDetails?.telegram}
              target="_blank"
              onClick={onTelegramLinkClick}
              className="flex items-center h-10 gap-1 rounded-lg border border-[#CBD5E1] bg-white py-[6px] px-[12px] text-[14px] font-[500] lg:px-[24px]"
            >
              <img
                width={21}
                height={21}
                src="/assets/images/icons/telegram-contact-logo.svg"
                alt="telegram"
              />
              {/* {eventDetails.type !== "INVITE_ONLY" && <p>Telegram</p>} */}
              <p className="hidden lg:block">Telegram</p>
            </a>
          )}
          {!isUserGoing && isUserLoggedIn && !isPastEvent && (
            <button
              onClick={onIAmGoingClick}
              className="mb-btn flex h-[40px] items-center justify-center gap-[8px] rounded-[8px] border-[1px] border-[#CBD5E1] bg-[#156FF7] px-[24px] py-[10px]  text-[14px] font-[500] text-[#fff] hover:bg-[#1D4ED8]"
            >
              I am Going
            </button>
          )}
          {!isUserLoggedIn && (
            <button
              onClick={onLoginClick}
              className="mb-btn flex h-[40px] items-center justify-center gap-[8px] rounded-[8px] border-[1px] border-[#CBD5E1] bg-[#156FF7] px-[24px] py-[10px] text-[14px] font-[500]  text-[#fff] hover:bg-[#1D4ED8] lg:w-fit "
            >
              {isPastEvent ? 'Login to Access' : 'Login to Respond'}
            </button>
          )}
          {isUserGoing && isUserLoggedIn && !isPastEvent && (
            <button
              onClick={onEditResponse}
              className="mb-btn flex h-[40px] items-center justify-center gap-[8px] rounded-[8px] border-[1px] border-[#CBD5E1] bg-[#156FF7] px-[24px] py-[10px]  text-[14px] font-[500] text-[#fff] hover:bg-[#1D4ED8]"
            >
              Edit Response
            </button>
          )}
        </div>
        {isUserLoggedIn && (
          <div className="w-full lg:order-2 lg:ml-4 lg:w-[256px]">
            <Search onChange={getValue} placeholder="Search by Attendee Name" />
          </div>
        )}
      </div>

      <style jsx>
        {`
          @media (max-width: 375px) {
            .mb-btn {
              font-size: 12px;
            }
          }
        `}
      </style>
    </>
  );
};

export default Toolbar;
