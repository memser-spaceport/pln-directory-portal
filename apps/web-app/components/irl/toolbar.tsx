import { useEffect, useState } from 'react';
import AddDetailsPopup from './add-details-popup';

const Toolbar = (props: any) => {
  const teams = props?.teams;
  const eventDetails = props?.eventDetails;
  const userInfo = props?.userInfo;
  const onLogin = props.onLogin;
  const isUserGoing = props?.isUserGoing;
  const isUserLoggedIn = props?.isUserLoggedIn;
  const registeredGuest = eventDetails.guests.find(
    (guest) => guest.memberUid === userInfo.uid
  );

  const [updatedUser, setUpdatedUser] = useState(registeredGuest);

  const [isOpen, setIsOpen] = useState(false);

  const onClose = () => {
    setIsOpen(false);
  };

  const onOpen = () => {
    setIsOpen(true);
  };

  useEffect(() => {
    const handler = (e: any) => {
      const eventDetails = e.detail.eventDetails;

      const registeredGuest = eventDetails.guests.find(
        (guest) => guest.memberUid === userInfo.uid
      );
      console.log(registeredGuest)
      setUpdatedUser(registeredGuest);
    };
    document.addEventListener('updateGuests', handler);
    return () => {
      document.removeEventListener('updateGuests', handler);
    };
  }, []);

  return (
    <>
      <div className="flex w-[100%] flex-col justify-between lg:flex-row">
        <p className="pb-[4px] text-[18px] font-[700] lg:pb-0 lg:text-[20px]">{`Guest List (${eventDetails.guests.length})`}</p>
        <div className="flex flex-wrap gap-[8px]">
          <a
            href={eventDetails.telegram}
            target="_blank"
            className="flex cursor-pointer items-center justify-center gap-[8px] rounded-[8px] border-[1px] border-[#CBD5E1] bg-white p-[10px]  text-[14px] font-[500] text-[#156FF7] lg:px-[24px] lg:py-[10px]"
          >
            <img
              className="h-[21px] w-[21px]"
              src="/assets/images/icons/telegram-contact-logo.svg"
            />
            <span className="hidden lg:block">Telegram</span>
          </a>
          <a
            target="_blank"
            rel="noreferrer"
            href={eventDetails.websiteUrl}
            className="flex flex-1 cursor-pointer items-center justify-center gap-[8px] rounded-[8px] border-[1px] border-[#CBD5E1] bg-white px-[16px] py-[10px] text-[14px]  font-[500] text-[#156FF7] lg:flex-auto lg:px-[24px] lg:py-[10px]"
          >
            View Schedule
          </a>
          {!isUserGoing && isUserLoggedIn && (
            <button
              onClick={onOpen}
              className="flex h-[40px] items-center justify-center gap-[8px] rounded-[8px] border-[1px] border-[#CBD5E1] bg-[#156FF7] px-[24px]  py-[10px] text-[14px] font-[500] text-[#fff]"
            >
              I am Going
            </button>
          )}
          {!isUserLoggedIn && (
            <button
              onClick={onLogin}
              className="flex h-[40px] w-full items-center justify-center gap-[8px] rounded-[8px] border-[1px] border-[#CBD5E1] bg-[#156FF7] px-[24px] py-[10px] text-[14px]  font-[500] text-[#fff] lg:w-fit lg:flex-auto"
            >
              Login to Respond
            </button>
          )}
          {isUserGoing && isUserLoggedIn && (
            <button
              onClick={onOpen}
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
