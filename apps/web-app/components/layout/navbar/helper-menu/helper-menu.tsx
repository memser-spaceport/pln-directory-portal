import { Menu, Transition } from '@headlessui/react';
import { APP_ANALYTICS_EVENTS } from 'apps/web-app/constants';
import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';
import { getUserInfo } from 'apps/web-app/utils/shared.utils';
import { useRouter } from 'next/router';
import { Fragment } from 'react';

interface IHelperMenu {
  userInfo: any;
}

export function HelperMenu(props: IHelperMenu) {
  const router = useRouter();
  const analytics = useAppAnalytics();
  const user = getUserInfo();

  const HELPER_MENU_OPTIONS = [
    {
      icon: '/assets/images/icons/message.svg',
      name: 'ProtoSphere',
      type: '_blank',
      url: process.env.PROTOSPHERE_URL,
    },
    {
      icon: '/assets/images/icons/question-circle-grey.svg',
      name: 'Get Support',
      type: '_blank',
      url: process.env.GET_SUPPORT_URL,
    },
    {
      icon: '/assets/images/icons/changelog.svg',
      name: 'Changelog',
      url: '/changelog',
      type: 'in-app',
    },
  ];

  const onInfoClick = () => {
    analytics.captureEvent(APP_ANALYTICS_EVENTS.NAVBAR_MENU_ITEM_CLICKED, {
      name: 'get-help',
      user,
    });
  };

  const onItemClick = (item: any) => {
    analytics.captureEvent(APP_ANALYTICS_EVENTS.NAVBAR_GET_HELP_ITEM_CLICKED, {
      name: item.name,
      user,
    });
    if (item.type === 'in-app') {
      router.push('/changelog');
    }
  };

  return (
    <Menu as="div" className="relative">
      {({ open }) => (
        <>
          <Menu.Button onClick={onInfoClick} className="flex h-6 w-6">
            <img src="/assets/images/icons/question.svg" />
          </Menu.Button>
          <Transition
            as={Fragment}
            enter="transition duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="transition duration-100"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <Menu.Items
              static
              className="absolute top-5 right-0 mt-5 flex w-[133px] flex-col gap-4 rounded-lg bg-white p-4 shadow-md focus:outline-none"
            >
              {HELPER_MENU_OPTIONS.map((item, index) => {
                return (
                  <Menu.Item as={'div'} key={`menu-item-${index}`}>
                    {({ active }) => (
                      <>
                        {item?.type === '_blank' ? (
                          <a
                            className="flex cursor-pointer items-center gap-1"
                            href={item.url}
                            target="_blank"
                            onClick={() => onItemClick(item)}
                          >
                            <img
                              width={16}
                              height={16}
                              src={item.icon}
                              alt="icon"
                              className="h-4 w-4"
                            />
                            <span className="text-sm text-[#0F172A] ">
                              {item.name}
                            </span>
                          </a>
                        ) : (
                          <div
                            className="flex cursor-pointer items-center gap-1"
                            onClick={() => onItemClick(item)}
                          >
                            <img
                              width={16}
                              height={16}
                              src={item.icon}
                              alt="icon"
                            />
                            <span className="text-sm text-[#0F172A] ">
                              {item.name}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </Menu.Item>
                );
              })}

              {/* <Menu.Item key="get-help-01">
                {({ active }) => {
                  return (
                    <div
                      className="flex cursor-pointer items-center gap-1"
                      onClick={onClickChangeLog}
                    >
                      <img
                        width={16}
                        height={16}
                        src="/assets/images/icons/changelog.svg"
                        alt="icon"
                      />
                      <span className="text-sm text-[#0F172A] ">Changelog</span>
                    </div>
                  );
                }}
              </Menu.Item>
              <Menu.Item key="get-help-02">
                {({ active }) => (
                  <a
                    className="flex cursor-pointer items-center gap-1"
                    href={forumUrl}
                    target="_blank"
                    onClick={onForumLinkClick}
                  >
                    <img
                      width={16}
                      height={16}
                      src="/assets/images/icons/message.svg"
                      alt="icon"
                      className="h-4 w-4"
                    />
                    <span className="text-sm text-[#0F172A] ">ProtoSphere</span>
                  </a>
                )}
              </Menu.Item> */}
            </Menu.Items>
          </Transition>
        </>
      )}
    </Menu>
  );
}
