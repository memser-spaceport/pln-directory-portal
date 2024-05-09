import { useEffect, useState } from 'react';
import JoinEventStrip from './join-event-strip';
import Toolbar from './toolbar';
import TableHeader from './table-header';
import TeamList from './team-list';
import MemberList from './member-list';
import AddDetailsPopup from './add-details-popup';
import { useIrlDetails } from 'apps/web-app/hooks/irl/use-irl-details';

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
  const { filteredList } = useIrlDetails(updatedEventDetails.guests, userInfo);

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

      const notAvailableTeams = eventDetails?.guests.filter(
        (item) => item.teamUid === 'cleeky1re000202tx3kex3knn'
      );
      const otherTeams = eventDetails?.guests.filter(
        (item) => item.teamUid !== 'cleeky1re000202tx3kex3knn'
      );

      const sortedGuests = otherTeams.sort((a, b) =>
        a.memberName?.localeCompare(b.memberName)
      );
      const sortedNotAvailableTeamGuests = notAvailableTeams.sort((a, b) =>
        a.memberName?.localeCompare(b.memberName)
      );

      const combinedTeams = [...sortedGuests, ...sortedNotAvailableTeamGuests];
      eventDetails.guests = combinedTeams;

      const isUserGoing = eventDetails.guests.some(
        (guest) => guest.memberUid === userInfo.uid && guest.memberUid
      );

      if (isUserGoing) {
        const currentUser = [...combinedTeams].find(
          (v) => v.memberUid === userInfo.uid
        );
        if (currentUser) {
          // currentUser.memberName = `(You) ${currentUser.memberName}`;
          const filteredList = [...combinedTeams].filter(
            (v) => v.memberUid !== userInfo.uid
          );
          const formattedGuests = [currentUser, ...filteredList];
          eventDetails.guests = formattedGuests;
        }
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
            />
          </div>
          <div className={`slim-scroll lg-rounded-tl-[8px] lg-rounded-tr-[8px] mb-[8px] ${isUserLoggedIn ? "h-[calc(100svh_-_205px)] lg:h-[calc(100vh_-_161px)]": 'h-[calc(100svh_-_236px)] lg:h-[calc(100vh_-_210px)]' } w-[calc(100%_-_2px)] overflow-y-auto overflow-x-scroll lg:overflow-x-hidden`}>
            <TableHeader
              userInfo={userInfo}
              isUserLoggedIn={isUserLoggedIn}
              eventDetails={updatedEventDetails}
              filteredList={filteredList}
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
