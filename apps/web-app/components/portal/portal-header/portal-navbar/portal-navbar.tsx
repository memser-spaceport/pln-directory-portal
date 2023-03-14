import { Menu, Transition } from '@headlessui/react';
import { trackGoal } from 'fathom-client';
import { Fragment } from 'react';
import { FATHOM_EVENTS } from '../../../../constants';
import { ReactComponent as ArrowDownFilled } from '../../../../public/assets/images/icons/arrow-down-filled.svg';
import { PORTAL_HEADER_LINKS } from '../portal-header.constants';

interface PortalNavbarProps {
  floating: boolean;
}

function getNavItems() {
  const navItems = PORTAL_HEADER_LINKS.map((item) => {
    if (item.subMenu?.length) {
      return (
        <Menu key={item.label}>
          <div className="w-20">
            <Menu.Button className="flex w-full flex-row flex-nowrap items-center justify-around rounded py-1 px-2 font-medium outline-none transition-all duration-300 ease-in-out focus:ring-opacity-25 focus:ring-offset-1">
              <span>{item.label}</span>
              <span>
                <ArrowDownFilled />
              </span>
            </Menu.Button>
          </div>

          <Transition
            as={Fragment}
            enter="transform transition duration-300"
            enterFrom="opacity-0 -translate-y-2"
            enterTo="opacity-100 translate-y-0"
            leave="transform transition duration-300"
            leaveFrom="opacity-100 translate-y-0"
            leaveTo="opacity-0 -translate-y-2"
          >
            <Menu.Items className="absolute right-0 z-40 mt-11 rounded-lg bg-white p-2 shadow-[0_2px_4px_2px_rgba(15,23,42,.04)] focus:outline-none">
              {item.subMenu.map((option) => {
                const eventCode = FATHOM_EVENTS.portal.nav[option.eventCode];

                return (
                  <Menu.Item key={option.label}>
                    <a
                      href={option.url}
                      className="block rounded px-3 py-2 text-sm hover:bg-blue-600 hover:text-white focus:outline-1 focus:outline-offset-1 focus:outline-blue-600 focus:ring-2 focus:ring-blue-600 focus:ring-opacity-25 focus:ring-offset-1"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => eventCode && trackGoal(eventCode, 0)}
                    >
                      {option.label}
                    </a>
                  </Menu.Item>
                );
              })}
            </Menu.Items>
          </Transition>
        </Menu>
      );
    } else {
      const eventCode = FATHOM_EVENTS.portal.nav[item.eventCode];

      return (
        <a
          className="rounded py-1 px-2 outline-none transition-all duration-300 ease-in-out hover:bg-blue-600 hover:text-white focus:outline-1 focus:outline-offset-0 focus:outline-blue-600 focus:ring-2 focus:ring-blue-600 focus:ring-opacity-25 focus:ring-offset-1"
          href={item.url}
          key={item.label}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => eventCode && trackGoal(eventCode, 0)}
        >
          {item.label}
        </a>
      );
    }
  });
  return navItems;
}

export function PortalNavbar({ floating }: PortalNavbarProps) {
  return (
    <div
      className={`flex gap-2 rounded-lg text-sm font-medium leading-6  ${
        floating
          ? 'bg-white/[.92] shadow-[0_1px_4px_2px_rgba(15,23,42,.04)]'
          : 'bg-white shadow-[0_2px_4px_2px_rgba(15,23,42,.04)]'
      } p-2 transition-all duration-700 ease-in-out`}
    >
      {getNavItems()}
    </div>
  );
}
