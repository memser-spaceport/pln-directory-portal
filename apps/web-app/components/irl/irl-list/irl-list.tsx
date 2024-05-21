'use client';

import { IIrlCard } from 'apps/web-app/utils/irl.types';
import IrlCard from './irl-card';
import Link from 'next/link';
import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';
import {
  ADMIN_ROLE,
  APP_ANALYTICS_EVENTS,
  INVITE_ONLY_RESTRICTION_ERRORS,
} from 'apps/web-app/constants';
import { getUserInfo } from 'apps/web-app/utils/shared.utils';
import { IrlInviteOnlyUnauthorized } from './irl-invite-only-unauthorized';
import { IrlInviteOnlyLoggedOut } from './irl-invite-only-logged-out';
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
  const pastEvents = props.conference?.filter((item) => item.isPastEvent);
  const upcomingEvents = props.conference?.filter((item) => !item.isPastEvent);
  const analytics = useAppAnalytics();
  const user = getUserInfo();

  //methods
  const onCardClick = (event, item) => {
    const isPastEvent = isPastDate(item.endDate);
    const isInviteOnly = item.type === 'INVITE_ONLY';
    let restrictedReason = '';

    if (isInviteOnly && !user.email) {
      event.preventDefault();
      restrictedReason = INVITE_ONLY_RESTRICTION_ERRORS.NOT_LOGGED_IN;
      setRestrictionReason(INVITE_ONLY_RESTRICTION_ERRORS.NOT_LOGGED_IN);
    } else if (
      isInviteOnly &&
      !userEvents.includes(item.id) &&
      !user.roles.includes(ADMIN_ROLE)
    ) {
      event.preventDefault();
      restrictedReason = INVITE_ONLY_RESTRICTION_ERRORS.NOT_LOGGED_IN;
      setRestrictionReason(INVITE_ONLY_RESTRICTION_ERRORS.UNAUTHORIZED);
    }

    analytics.captureEvent(APP_ANALYTICS_EVENTS.IRL_GATHERING_CARD_CLICKED, {
      uid: item.id,
      name: item.name,
      slugUrl: item.slugUrl,
      isInviteOnly,
      user: user,
      isPastEvent,
      restrictedReason,
    });
  };

  const onPopupClose = () => {
    setRestrictionReason('');
  };

  return (
    <>
      <div className="irlList">
        <div className="irlList__upcoming">
          {/* <h2 className="irlList__upcoming__title">Upcoming Conferences</h2> */}
          <div className="irlList__upcoming__events">
            {upcomingEvents.length > 0 ? (
              upcomingEvents?.map((item, index: number) => (
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
        </div>

        {pastEvents.length > 0 && (
          <div className="irlList__past">
            <h2 className="irlList__past__title">Past Gatherings</h2>
            <div className="irlList__past__events">
              {pastEvents?.map((item, index: number) => (
                <Link key={index} href={`/irl/${item.slugUrl}`} passHref>
                  <a onClick={(e) => onCardClick(e, item)}>
                    <IrlCard {...item} />
                  </a>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="">
        <IrlInviteOnlyUnauthorized
          isOpen={
            restrictionReason === INVITE_ONLY_RESTRICTION_ERRORS.UNAUTHORIZED
          }
          onClose={onPopupClose}
        />
        <IrlInviteOnlyLoggedOut
          isOpen={
            restrictionReason === INVITE_ONLY_RESTRICTION_ERRORS.NOT_LOGGED_IN
          }
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
            flex-direction: column;
            align-items: center;
            flex-wrap: wrap;
            justify-content: center;
            gap: 34px;
            margin: auto;
          }

          .irlList__upcoming {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            flex-wrap: wrap;
            justify-content: flex-start;
            gap: 16px;
          }

          .irlList__upcoming__events {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            justify-content: center;
            gap: 16px;
          }

          .irlList__past{
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            flex-wrap: wrap;
            // justify-content: flex-start;
            gap: 16px;
            width: 100%;
          }

          .irlList__past__title{
            width: 100%;
            font-weight:700;
            font-size:18px;
            line-height:20px;
            color:#0F172A;
            padding-left: 20px;
            padding-bottom: 16px;
            border-bottom: 1px solid #CBD5E1;
          }

          .irlList__past__events {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            justify-content: center;
            gap: 16px;
            width: 100%;
          }

          .irlList__modal {
            width: 656px;
            height: 196px;
          }

          @media (min-width: 1024px) {
            .irlList {
              padding: 24px 0;
              gap: 24px;
            }

            .irlList__upcoming__title{
              font-size:28px;
              line-height:40px;
            }
            
            .irlList__upcoming__events {
              justify-content: flex-start;
            }

            .irlList__past__title{
              font-size:28px;
              line-height:40px;
              padding-left: 0;
            }

            .irlList__past__events {
              justify-content: flex-start;
            }
          }
        `}
      </style>
    </>
  );
}
