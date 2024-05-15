import { useState } from 'react';
import Modal from '../layout/navbar/modal/modal';
import ResourcesPopup from './resources-popup';
import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';
import { APP_ANALYTICS_EVENTS } from 'apps/web-app/constants';
import { getUserInfo } from 'apps/web-app/utils/shared.utils';

const Resources = (props: any) => {
  const eventDetails = props?.eventDetails;
  const resources = eventDetails?.resources ?? [];
  const resourcesNeedToShow = 3;
  const [isOpen, setIsOpen] = useState(false);
  const analytics = useAppAnalytics();
  const user = getUserInfo();

  const onResourceClick = (resource: any) => {
    analytics.captureEvent(APP_ANALYTICS_EVENTS.IRL_BANNER_RESOURCE_CLICKED, {
      eventId: eventDetails?.id,
      eventName: eventDetails?.name,
      type: eventDetails?.type,
      isPastEvent: eventDetails?.isPastEvent,
      ...resource,
      user,
    });
  };

  const onPopupResourceClick = (resource: any) => {
    analytics.captureEvent(
      APP_ANALYTICS_EVENTS.IRL_RESOURCE_POPUP_RESOURCE_LINK_CLICKED,
      {
        eventId: eventDetails?.id,
        eventName: eventDetails?.name,
        type: eventDetails?.type,
        isPastEvent: eventDetails?.isPastEvent,
        ...resource,
        user,
      }
    );
  };

  const onToggleModal = () => {
    analytics.captureEvent(
      APP_ANALYTICS_EVENTS.IRL_RESOURCES_SEE_MORE_CLICKED,
      {
        eventId: eventDetails?.id,
        eventName: eventDetails?.name,
        type: eventDetails?.type,
        isPastEvent: eventDetails?.isPastEvent,
        user,
      }
    );
    setIsOpen((prev) => !prev);
  };

  const ResourceLink = (props: any) => {
    const resource = props?.resource;
    const onClick = props?.onClick;
    return (
      <>
        <a
          href={resource?.link}
          target="_blank"
          className="resourceLink"
          onClick={() => onClick(resource)}
        >
          <img
            width={20}
            height={20}
            src="/assets/images/icons/projects/link.svg"
            alt="link"
          />
          <span className="resourceLink__text">{resource?.name}</span>
          <img src="/assets/images/icons/projects/arrow.svg" alt="arrow" />
        </a>
        <style jsx>{`
          .resourceLink {
            display: inline-flex;
            align-items: center;
            gap: 7px;
          }

          .resourceLink__text {
            font-size: 13px;
            font-weight: 500;
            line-height: 20px;
            color: #156ff7;
          }
        `}</style>
      </>
    );
  };

  return (
    <>
      <div className="resources">
        <h6 className="resources__title">Resources</h6>
        <div className="resources__list">
          {resources?.slice(0, resourcesNeedToShow)?.map((item, index) => (
            <div
              className="resources__list__resource"
              key={`resource-${index}`}
            >
              <ResourceLink resource={item} onClick={onResourceClick} />
            </div>
          ))}
          {resources?.length > resourcesNeedToShow && (
            <button className="reosources__remaining" onClick={onToggleModal}>
              {`+${resources?.length - resourcesNeedToShow} more`}
            </button>
          )}
        </div>
      </div>
      <ResourcesPopup
        isOpen={isOpen}
        onClose={onToggleModal}
        resourceLink={ResourceLink}
        resources={resources}
        onResourceClick={onPopupResourceClick}
      />
      <style jsx>{`
        .resources {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .resources__title {
          font-size: 14px;
          font-weight: 600;
          line-height: 20px;
          color: #475569;
        }

        .resources__list {
          display: flex;
          flex-wrap: wrap;
          column-gap: 12px;
          row-gap: 14px;
          align-items: center;
        }

        .resources__list__resource {
          height: 20px;
        }

        .reosources__remaining {
          border: 1px solid #cbd5e1;
          border-radius: 29px;
          font-size: 13px;
          font-weight: 500;
          line-height: 20px;
          color: #156ff7;
          height: 24px;
          display: flex;
          align-items: center;
          padding-inline: 8px;
        }
      `}</style>
    </>
  );
};

export default Resources;
