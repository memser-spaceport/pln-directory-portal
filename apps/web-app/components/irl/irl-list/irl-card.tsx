'use client';

import { IIrlCard } from 'apps/web-app/utils/irl.types';
import { formatIrlEventDate, isPastDate } from 'apps/web-app/utils/irl.utils';

export default function IrlCard(props: IIrlCard) {
  //props
  const id = props?.id;
  const name = props?.name;
  const slugUrl = props?.slugUrl;
  const description = props?.description;
  const location = props?.location;
  const isInviteOnly = props?.type === 'INVITE_ONLY' ? true : false;
  const attendees = props?.attendees;
  const startDate = props?.startDate;
  const endDate = props?.endDate;
  const bannerImage = props?.bannerUrl;

  //variables
  const formattedDate = formatIrlEventDate(startDate, endDate);
  const isPastEvent = isPastDate(endDate);
  const isLongName = name?.length > 25;


  return (
    <>

          <div className={`irlCard ${isPastEvent ? 'irlCard--grayscale' : ''}`}>
            <div className="irlCard__hdr">
              <img src={bannerImage} alt="IRL header" />
            </div>
            <div className="irlCard__body">
              <div className={`irlCard__body__name ${isLongName ? "irlCard__body__name--long" : ""}`}>{name}</div>
              <div className={`irlCard__body__desc ${isLongName ? "irlCard__body__desc--short" : ""}`} dangerouslySetInnerHTML={{__html:description}}></div>
              <div className="irlCard__body__location">
                <img src="/assets/images/icons/location.svg" alt="location" />
                <span>{location}</span>
              </div>
            </div>
            <div className="irlCard__footer__separator" />
            <div className="irlCard__footer">
              <div className="irlCard__footer__left">
                {isInviteOnly ? (
                  <div className="irlCard__footer__left__invite">
                    <img
                      src="/assets/images/icons/invite-only.svg"
                      alt="Invite Only"
                    />
                    <span>Invite Only</span>
                  </div>
                ) : attendees > 0 && (
                  <div className="irlCard__footer__left__attendee">
                    <img
                      src="/assets/images/icons/thumbs-up.svg"
                      alt="Thumbs Up"
                    />
                    <span>{`${attendees} ${
                      isPastEvent ? 'Joined' : 'Going'
                    }`}</span>
                  </div>
                )}
              </div>
              <div className="irlCard__footer__right">
                <img
                  src="/assets/images/icons/flat_calendar.svg"
                  alt="Calendar"
                />
                <span>{formattedDate}</span>
              </div>
            </div>
          </div>

      <style jsx>{`
        .irlCard {
          height: 311px;
          width: 289px;
          border-radius: 12px;
          background-color: #ffffff;
          box-shadow: 0px 4px 4px 0px #0f172a0a;
          cursor: pointer;
        }

        .irlCard--grayscale {
          filter: grayscale(1);
        }

        .irlCard:hover {
          box-shadow: 0 0 0 2px rgba(21, 111, 247, 0.25);
        }

        .irlCard__hdr {
          height: 93px;
          border-bottom: 1px solid #e2e8f0;
        }

        .irlCard__hdr img {
          height: 100%;
          width: 100%;
          object-fit: cover;
          object-position: center;
          border-top-left-radius: 12px;
          border-top-right-radius: 12px;
        }

        .irlCard__body {
          display: flex;
          flex-direction: column;
          height: 156px;
          gap: 8px;
          padding: 16px 20px;
          justify-content: center;
          text-align: center;
        }

        .irlCard__body__name {
          font-weight: 600;
          font-size: 18px;
          line-height: 25px;
          color: #0f172a;
        }

        .irlCard__body__name--long{
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          height: 54px;
          -webkit-box-orient: vertical;
        }

        .irlCard__body__desc {
          font-weight: 400;
          font-size: 14px;
          line-height: 20px;
          color: #0f172a;
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
        }

        .irlCard__body__desc--short {
          height: 45px;
          -webkit-line-clamp: 2;
        }

        .irlCard__body__location {
          display: flex;
          align-items: center;
          gap: 2px;
          justify-content: center;
        }

        .irlCard__body__location img{
          height: 16px;
          width: 16px;
        }

        .irlCard__body__location span {
          font-weight: 400;
          font-size: 14px;
          line-height: 20px;
          color: #475569;
        }

        .irlCard__footer__separator {
          border-bottom: 1px solid #e2e8f0;
        }

        .irlCard__footer {
          display: flex;
          gap: 8px;
          align-items: center;
          justify-content: center;
          padding: 16px 0;
        }

        .irlCard__footer__left__invite {
          display: flex;
          gap: 5px;
          align-items: center;
          padding: 5px 8px;
          border-radius: 24px;
          background-color: #f9f3e9;
          border: 1px solid #f19100;
        }

        .irlCard__footer__left__invite span {
          font-weight: 500;
          font-size: 12px;
          line-height: 14px;
          color: #0f172a;
        }

        .irlCard__footer__left__attendee {
          display: flex;
          gap: 1px;
          align-items: center;
          padding: 6px 12px;
          border-radius: 24px;
          background-color: #f1f5f9;
        }

        .irlCard__footer__left__attendee span {
          font-weight: 500;
          font-size: 12px;
          line-height: 14px;
          color: #475569;
        }

        .irlCard__footer__right {
          display: flex;
          gap: 1px;
          align-items: center;
          padding: 6px 12px;
          border-radius: 24px;
          background-color: #f1f5f9;
        }

        .irlCard__footer__right span {
          font-weight: 500;
          font-size: 12px;
          line-height: 14px;
          color: #475569;
        }
      `}</style>
    </>
  );
}
