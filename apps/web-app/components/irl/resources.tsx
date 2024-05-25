import { useState } from 'react';
import ResourcesPopup from './resources-popup';
import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';
import { APP_ANALYTICS_EVENTS } from 'apps/web-app/constants';
import { getUserInfo } from 'apps/web-app/utils/shared.utils';

const Resources = (props: any) => {
  const eventDetails = props?.eventDetails;
  const isUserLoggedIn = props?.isUserLoggedIn;
  const resources = eventDetails?.resources ?? [];
  const onLogin = props?.onLogin;
  const [isOpen, setIsOpen] = useState(false);
  const analytics = useAppAnalytics();
  const user = getUserInfo();

  const splitResources = (resources) => {
    const publicResources = [];
    const privateResources = [];

    resources?.map((resource) => {
      if (resource.isPublic) {
        publicResources.push(resource);
      } else {
        privateResources.push(resource);
      }
    });

    return { publicResources, privateResources };
  };

  const publicResources = splitResources(resources)?.publicResources;

  const totalResources = isUserLoggedIn ? [...resources] : [...publicResources];

  const resourcesNeedToShow = isUserLoggedIn
    ? 5
    : totalResources?.length < 5
    ? totalResources?.length
    : 5;

  const onResourceClick = (resource: any) => {
    analytics.captureEvent(APP_ANALYTICS_EVENTS.IRL_RESOURCE_CLICKED, {
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

  const onLoginClick = (analyticsName) => {
    analytics.captureEvent(analyticsName, {
      eventId: eventDetails?.id,
      eventName: eventDetails?.name,
      type: eventDetails?.type,
      isPastEvent: eventDetails?.isPastEvent,
      user,
    });
    onLogin();
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
            src={resource?.icon || '/assets/images/icons/link-blue.svg'}
            alt="link"
            loading="lazy"
            width={14}
            height={14}
          />
          <span className="resourceLink__text">{resource?.name}</span>
          <img
            src="/assets/images/icons/projects/arrow.svg"
            alt="arrow"
            width={9}
            height={9}
          />
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
      <div
        className={`flex flex-col gap-1 ${
          totalResources?.length === 0 ? 'justify-between lg:flex-row' : ''
        }`}
      >
        <h6 className="text-sm font-semibold text-[#475569]">Resources</h6>
        {totalResources?.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-[14px]">
            {totalResources
              ?.slice(0, resourcesNeedToShow)
              ?.map((item, index) => (
                <div className="flex h-5" key={`resource-${index}`}>
                  <ResourceLink resource={item} onClick={onResourceClick} />
                </div>
              ))}
            {resources?.length > resourcesNeedToShow && (
              <button
                className="flex h-6 items-center rounded-[29px] border border-[#cbd5e1] px-[6px] text-[13px] font-medium leading-5 text-[#156ff7]"
                onClick={onToggleModal}
              >
                {`+${resources?.length - resourcesNeedToShow} more`}
              </button>
            )}
          </div>
        )}
        {totalResources?.length === 0 && (
          <div className="flex items-start gap-1 lg:items-center">
            <img
              className="pt-[2px] lg:p-[unset]"
              src="/assets/images/icons/lock-grey.svg"
              alt="lock"
            />
            <span className=" text-[13px] leading-5 text-[#64748B]">
              Resources are set to private. Please{' '}
              <span
                onClick={() =>
                  onLoginClick(
                    APP_ANALYTICS_EVENTS.IRL_RESOURCES_LOGIN_BTN_CLICKED
                  )
                }
                className="cursor-pointer text-[13px] font-medium leading-5 text-[#156FF7]"
              >
                login
              </span>
              {` `}
              to access
            </span>
          </div>
        )}
      </div>
      <ResourcesPopup
        isOpen={isOpen}
        onClose={onToggleModal}
        resourceLink={ResourceLink}
        allResources={resources}
        resourcesToShow={totalResources}
        onResourceClick={onPopupResourceClick}
        onLogin={onLoginClick}
      />
    </>
  );
};

export default Resources;
