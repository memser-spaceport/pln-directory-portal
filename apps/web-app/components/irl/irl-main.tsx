import { useEffect, useState } from 'react';
import JoinEventStrip from './join-event-strip';
import Toolbar from './toolbar';
import TableHeader from './table-header';
import TeamList from './team-list';
import MemberList from './member-list';
import AddDetailsPopup from './add-details-popup';

const IrlMain = (props: any) => {
  const eventDetails = props?.eventDetails;
  const onLogin = props?.onLogin;
  const userInfo = props?.userInfo;
  const teams = props?.teams;
  const isUserLoggedIn = props?.isUserLoggedIn;
  const registeredGuest = eventDetails.guests.find(
    (guest) => guest.memberUid === userInfo.uid
  );

  const [updatedEventDetails, setUpdatedEventDetails] = useState(eventDetails);
  const [isOpen, setIsOpen] = useState(false);
  const [updatedUser, setUpdatedUser] = useState(registeredGuest);
  const [isUserGoing, setIsGoing] = useState(props?.isUserGoing);


  const onClose = () => {
    setIsOpen(false);
  };

  useEffect(() => {
    const handler = (e: any) => {
      const eventDetails = e.detail.eventDetails;
      const registeredGuest = eventDetails?.guests.find(
        (guest) => guest.memberUid === userInfo.uid
      );
      if (registeredGuest) {
        setIsGoing(true);
      }
      setUpdatedUser(registeredGuest);
      setUpdatedEventDetails(eventDetails);
    };
    document.addEventListener('updateGuests', handler);
    return () => {
      document.removeEventListener('updateGuests', handler);
    };
  }, []);

  useEffect(() => {
    const handler = (e: any) => {
      const isOpen = e.detail.isOpen;
      setIsOpen(isOpen);
    };
    document.addEventListener('openRsvpModal', handler);
    return () => {
      document.removeEventListener('openRsvpModal', handler);
    };
  }, []);

  return (
    <>
      {updatedEventDetails?.guests.length === 0 && (
        <div className="pt-2">
          <JoinEventStrip
            onLogin={onLogin}
            isUserGoing={isUserGoing}
            isUserLoggedIn={isUserLoggedIn}
            eventDetails={eventDetails}
          />
        </div>
      )}

      {updatedEventDetails?.guests.length > 0 && (
        <>
          <div
            //  ${
            //   isUserLoggedIn ? 'h-[110px]' : 'h-[152px]'
            // }
            // lg:h-[76px]
            className={`g:px-0 w-[100%] bg-slate-100 px-[20px] pt-[16px] pb-[20px] lg:px-[unset] lg:py-[18px] lg:pt-[18px]`}
          >
            <Toolbar
              eventDetails={updatedEventDetails}
              teams={teams}
              userInfo={userInfo}
              isUserGoing={isUserGoing}
              isUserLoggedIn={isUserLoggedIn}
              onLogin={onLogin}
            />
          </div>
          <div className="slim-scroll lg-rounded-tl-[8px] lg-rounded-tr-[8px] mb-[8px] h-[calc(100svh_-_246px)] w-[calc(100%_-_2px)] overflow-y-auto overflow-x-scroll lg:h-[calc(100vh_-_220px)] lg:overflow-x-hidden">
            <TableHeader
              userInfo={userInfo}
              isUserLoggedIn={isUserLoggedIn}
              eventDetails={updatedEventDetails}
            />
            <div
              className={`relative -mt-[4px] ${
                isUserLoggedIn ? 'w-fit' : 'w-full'
              } lg-rounded-[8px] bg-white shadow-sm lg:w-[calc(100%_-_2px)]`}
            >
              {isUserLoggedIn && (
                <MemberList userInfo={userInfo} items={updatedEventDetails.guests} eventDetails={updatedEventDetails} />
              )}
              {!isUserLoggedIn && (
                <TeamList onLogin={onLogin} items={updatedEventDetails.guests} eventDetails={updatedEventDetails}  />
              )}
            </div>
          </div>
        </>
      )}
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
      <style jsx>
        {`
          ::-webkit-scrollbar {
            width: 6px;
            background: #f7f7f7;
          }
          ::-webkit-scrollbar-track {
            background: transparent;
          }
          ::-webkit-scrollbar-thumb {
            background-color: #cbd5e1;
            border-radius: 10px;
          }
        `}
      </style>
    </>
  );
};

export default IrlMain;
