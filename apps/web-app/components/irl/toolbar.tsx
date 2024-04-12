import { useEffect, useState } from 'react';
import AddDetailsPopup from './add-details-popup';
import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';
import { APP_ANALYTICS_EVENTS } from 'apps/web-app/constants';
import { getUserInfo } from 'apps/web-app/utils/shared.utils';

const Toolbar = (props: any) => {
  const teams = props?.teams;
  const eventDetails = props?.eventDetails;
  const userInfo = props?.userInfo;
  const onLogin = props.onLogin;
  const isUserLoggedIn = props?.isUserLoggedIn;
  const registeredGuest = eventDetails.guests.find(
    (guest) => guest.memberUid === userInfo.uid
  );
  
  const [isUserGoing, setIsGoing] = useState(props.isUserGoing);
  const [updatedUser, setUpdatedUser] = useState(registeredGuest);
  const [allGuest, setAllGuest] = useState(eventDetails.guests);
  const [isOpen, setIsOpen] = useState(false);
  const analytics = useAppAnalytics();
  const user = getUserInfo();

  const onClose = () => {
    setIsOpen(false);
  };

  const onIAmGoingClick = () => {
    analytics.captureEvent(
      APP_ANALYTICS_EVENTS.IRL_GUEST_LIST_HEADER_IAM_GOING_BTN_CLICKED,
      {
        type: 'i am going',
        user,
      }
    );
    setIsOpen(true);
  };

  const onEditResponse = () => {
    analytics.captureEvent(
      APP_ANALYTICS_EVENTS.IRL_GUEST_LIST_HEADER_EDIT_RESPONSE_BTN_CLICKED,
      {
        type: 'edit response',
        user,
      }
    );
    setIsOpen(true);
  };

  const onTelegramLinkClick = () => {
    analytics.captureEvent(
      APP_ANALYTICS_EVENTS.IRL_GUEST_LIST_HEADER_TELEGRAM_BTN_CLICKED,
      {
        telegramUrl: eventDetails?.telegram,
        user,
      }
    );
  };

  const onScheduleClick = () => {
    analytics.captureEvent(
      APP_ANALYTICS_EVENTS.IRL_GUEST_LIST_HEADER_VIEW_SCHEDULE_BTN_CLICKED,
      {
        schedulePageUrl: eventDetails?.websiteUrl,
        user,
      }
    );
  };

  const onLoginClick = () => {
    analytics.captureEvent(
      APP_ANALYTICS_EVENTS.IRL_GUEST_LIST_HEADER_LOGIN_BTN_CLICKED
    );
    onLogin();
  };

  useEffect(() => {
    const handler = (e: any) => {
      const eventDetails = e.detail.eventDetails;

      const registeredGuest = eventDetails.guests.find(
        (guest) => guest.memberUid === userInfo.uid
      );
      setAllGuest(eventDetails.guests);
      if(registeredGuest) {
        setIsGoing(true);
      }
      setUpdatedUser(registeredGuest);
    };
    document.addEventListener('updateGuests', handler);
    return () => {
      document.removeEventListener('updateGuests', handler);
    };
  }, []);

  return (
    <>
      <div className="flex w-[100%] flex-col justify-between lg:flex-row lg:items-center">
        <p className="pb-[4px] text-[18px] font-[700] lg:pb-0 lg:text-[20px]">{`Guest List (${allGuest.length})`}</p>
        <div className="flex flex-wrap gap-[8px]">
          <a
            href={eventDetails?.telegram}
            target="_blank"
            rel="noreferrer"
            className="flex cursor-pointer items-center justify-center gap-[8px] rounded-[8px] border-[1px] border-[#CBD5E1] bg-white p-[10px]  text-[14px] font-[500] text-[#156FF7] lg:px-[24px] lg:py-[10px]"
            onClick={onTelegramLinkClick}
          >
            <img
              className="h-[21px] w-[21px]"
              src="/assets/images/icons/telegram-contact-logo.svg"
            />
            <span className="hidden text-[#0F172A] text-sm font-[500] lg:block">Telegram</span>
          </a>
          <a
            target="_blank"
            rel="noreferrer"
            href={eventDetails?.websiteUrl}
            className="flex flex-1 cursor-pointer items-center justify-center gap-[8px] rounded-[8px] border-[1px] border-[#CBD5E1] bg-white px-[16px] py-[10px] text-[14px]  font-[500] text-[#0F172A] text-sm lg:flex-auto lg:px-[24px] lg:py-[10px]"
            onClick={onScheduleClick}
          >
            View Schedule
          </a>
          {!isUserGoing && isUserLoggedIn && (
            <button
              onClick={onIAmGoingClick}
              className="flex h-[40px] items-center justify-center gap-[8px] rounded-[8px] border-[1px] border-[#CBD5E1] bg-[#156FF7] px-[24px]  py-[10px] text-[14px] font-[500] text-[#fff]"
            >
              I am Going
            </button>
          )}
          {!isUserLoggedIn && (
            <button
              onClick={onLoginClick}
              className="flex h-[40px] w-full items-center justify-center gap-[8px] rounded-[8px] border-[1px] border-[#CBD5E1] bg-[#156FF7] px-[24px] py-[10px] text-[14px]  font-[500] text-[#fff] lg:w-fit lg:flex-auto"
            >
              Login to Respond
            </button>
          )}
          {isUserGoing && isUserLoggedIn && (
            <button
              onClick={onEditResponse}
              className="flex h-[40px] items-center justify-center gap-[8px] rounded-[8px] border-[1px] border-[#CBD5E1] bg-[#156FF7] px-[24px]  py-[10px] text-[14px] font-[500] text-[#fff]"
            >
              Edit Response
            </button>
          )}
        </div>
      </div>
      {isOpen && (
        <AddDetailsPopup
          eventDetails={eventDetails}
          teams={teams}
          isOpen={isOpen}
          onClose={onClose}
          userInfo={userInfo}
          isUserGoing={isUserGoing}
          registeredGuest={updatedUser}
        />
      )}
    </>
  );
};

export default Toolbar;
