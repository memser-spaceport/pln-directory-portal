import { useEffect, useState } from 'react';
import JoinEventStrip from './join-event-strip';
import Toolbar from './toolbar';
import TableHeader from './table-header';
import TeamList from './team-list';
import MemberList from './member-list';
import AddDetailsPopup from './add-details-popup';
import { useIrlDetails } from 'apps/web-app/hooks/irl/use-irl-details';
import { sortByDefault } from 'apps/web-app/utils/irl.utils';

const IrlMain = (props: any) => {
  const eventDetails = props?.eventDetails;
  const onLogin = props?.onLogin;
  const userInfo = props?.userInfo;
  const teams = props?.teams;
  const isUserLoggedIn = props?.isUserLoggedIn;
  // const telegram = eventDetails?.telegram;
  // const resources = eventDetails?.resources ?? [];
  const registeredGuest = eventDetails.guests.find((guest) => guest?.memberUid === userInfo?.uid);

  const [updatedEventDetails, setUpdatedEventDetails] = useState(eventDetails);
  const [isOpen, setIsOpen] = useState(false);
  const [updatedUser, setUpdatedUser] = useState(registeredGuest);
  const [isUserGoing, setIsGoing] = useState(props?.isUserGoing);
  const { filteredList, sortConfig } = useIrlDetails(updatedEventDetails.guests, userInfo);

  const onClose = () => {
    setIsOpen(false);
  };

  //update event details when form submit
  useEffect(() => {
    const handler = (e: any) => {
      const eventInfo = e.detail?.eventDetails;
      const goingGuest = eventInfo?.guests.find((guest) => guest.memberUid === userInfo.uid);
      const sortedGuests = sortByDefault(eventInfo?.guests);
      if (goingGuest) {
        setIsGoing(true);
        const currentUser = [...sortedGuests]?.find((v) => v.memberUid === userInfo?.uid);
        if (currentUser) {
          const filteredList = [...sortedGuests]?.filter((v) => v.memberUid !== userInfo?.uid);
          const formattedGuests = [currentUser, ...filteredList];
          eventInfo.guests = formattedGuests;
        }
      }

      setUpdatedUser(goingGuest);
      setUpdatedEventDetails(eventInfo);
    };
    document.addEventListener('updateGuests', handler);
    return () => {
      document.removeEventListener('updateGuests', handler);
    };
  }, [eventDetails]);

  //toggle attendees details modal
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

  useEffect(() => {
    setUpdatedEventDetails(eventDetails);
    setIsGoing(props?.isUserGoing);
    setUpdatedUser(registeredGuest);
  }, [eventDetails]);

  return (
    <>
      {updatedEventDetails?.guests.length === 0 && (
        <div className="py-2">
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
            className={`g:px-0 w-[100%] bg-slate-100 px-[20px] pt-[16px] pb-[20px] lg:px-[unset] lg:py-[18px] lg:pt-[18px]`}
          >
            <Toolbar
              eventDetails={updatedEventDetails}
              teams={teams}
              userInfo={userInfo}
              isUserGoing={isUserGoing}
              isUserLoggedIn={isUserLoggedIn}
              onLogin={onLogin}
              filteredList={filteredList}
            />
          </div>
          <div
            className={`slim-scroll lg-rounded-tl-[8px] lg-rounded-tr-[8px] mb-[8px] ${
              isUserLoggedIn
                ? 'h-[calc(100svh_-_205px)] lg:h-[calc(100vh_-_161px)]'
                : 'h-[calc(100svh_-_236px)] lg:h-[calc(100vh_-_210px)]'
            } w-[calc(100%_-_2px)] overflow-y-auto overflow-x-scroll lg:overflow-x-hidden`}
          >
            <TableHeader
              userInfo={userInfo}
              isUserLoggedIn={isUserLoggedIn}
              eventDetails={updatedEventDetails}
              filteredList={filteredList}
              sortConfig={sortConfig}
              // filterConfig={filterConfig}
            />
            <div
              className={`relative -mt-[4px] ${
                isUserLoggedIn ? 'w-fit' : 'w-full'
              } lg-rounded-[8px] bg-white shadow-sm lg:w-[calc(100%_-_2px)]`}
            >
              {isUserLoggedIn && (
                <MemberList userInfo={userInfo} items={filteredList} eventDetails={updatedEventDetails} />
              )}
              {!isUserLoggedIn && (
                <TeamList onLogin={onLogin} items={updatedEventDetails.guests} eventDetails={updatedEventDetails} />
              )}
            </div>
          </div>
        </>
      )}
      {isOpen && (
        <AddDetailsPopup
          eventDetails={updatedEventDetails}
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
