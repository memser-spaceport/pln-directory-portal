'use client';

import { IIrlCard } from 'apps/web-app/utils/irl.types';
import IrlCard from './irl-card';
import Link from 'next/link';
import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';
import {
  APP_ANALYTICS_EVENTS,
  INVITE_ONLY_RESTRICTION_ERRORS,
} from 'apps/web-app/constants';
import { getUserInfo } from 'apps/web-app/utils/shared.utils';
import { IrlInviteOnlyRestrict } from './irl-invite-only-restrict';
import { useState } from 'react';
import { isPastDate } from 'apps/web-app/utils/irl.utils';

interface IIrlList {
  conference: IIrlCard[];
  userEvents: string[];
}

export default function IrlList(props: IIrlList) {
  //props
  const conference = props.conference;
  const userEvents = props.userEvents;

  //variable
  const [restrictionReason, setRestrictionReason] = useState<string>('');
  const [isPopupOpen, setIsPopupOpen] = useState<boolean>(false);
  const analytics = useAppAnalytics();
  const user = getUserInfo();

  //methods
  const onCardClick = (event, item) => {
    const isPastEvent = isPastDate(item.endDate);
    const isInviteOnly = item.type === 'INVITE_ONLY';
    let restrictedReason = "";

    if (isInviteOnly && !user.email) {
      event.preventDefault();
      restrictedReason=INVITE_ONLY_RESTRICTION_ERRORS.NOT_LOGGED_IN;
      setRestrictionReason(INVITE_ONLY_RESTRICTION_ERRORS.NOT_LOGGED_IN);
      setIsPopupOpen(true);
    } else if (isInviteOnly && userEvents.includes(item.id)) {
      event.preventDefault();
      restrictedReason=INVITE_ONLY_RESTRICTION_ERRORS.NOT_LOGGED_IN;
      setRestrictionReason(INVITE_ONLY_RESTRICTION_ERRORS.UNAUTHORIZED);
      setIsPopupOpen(true);
    }
    
    analytics.captureEvent(APP_ANALYTICS_EVENTS.IRL_GATHERING_CARD_CLICKED, {
      uid: item.id,
      name: item.name,
      slugUrl: item.slugUrl,
      isInviteOnly,
      user: user,
      isPastEvent,
      restrictedReason
    });
  };

  const onPopupClose = () => {
    setIsPopupOpen(false);
    setRestrictionReason('');
  }

  return (
    <>
      <div className="irlList">
        {conference.length > 0 ? (
          conference?.map((item, index: number) => (
            <Link key={index} href={`/irl/${item.slugUrl}`} passHref>
              <a onClick={(e) => onCardClick(e, item)}>
                <IrlCard {...item} />
              </a>
            </Link>
          ))
        ) : (
          <p>No events available</p>
        )}
      </div>

      <div className="">
        <IrlInviteOnlyRestrict
          isOpen={isPopupOpen}
          restrictionReason={restrictionReason}
          onClose={onPopupClose}
        />
      </div>

      <style jsx>
        {`
          .irlList {
            width: 100%;
            height: 100%;
            padding: 20px 0;
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            justify-content: center;
            gap: 16px;
            margin: auto;
          }

          .irlList__modal {
            width: 656px;
            height: 196px;
          }

          @media (min-width: 1024px) {
            .irlList {
              padding: 24px 0;
              justify-content: flex-start;
            }
          }
        `}
      </style>
    </>
  );
}
