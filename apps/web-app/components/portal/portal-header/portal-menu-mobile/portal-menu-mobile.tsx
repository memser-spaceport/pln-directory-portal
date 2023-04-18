import { Menu, Transition } from '@headlessui/react';
import { MenuIcon } from '@protocol-labs-network/ui';
import { trackGoal } from 'fathom-client';
import { Fragment } from 'react';
import { FATHOM_EVENTS } from '../../../../constants';
import { PORTAL_HEADER_LINKS } from '../portal-header.constants';

export function PortalMenuMobile() {
  return (
    <Menu>
      <Menu.Button className="flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-[0_2px_4px_2px_rgba(15,23,42,.04)] outline-none">
        <MenuIcon />
      </Menu.Button>

      <Transition
        as={Fragment}
        enter="transform transition duration-300"
        enterFrom="opacity-0 -translate-y-2"
        enterTo="opacity-100 translate-y-0"
        leave="transform transition duration-300"
        leaveFrom="opacity-100 translate-y-0"
        leaveTo="opacity-0 -translate-y-2"
      >
        <Menu.Items className="absolute right-0 z-40 mt-2 w-full rounded-lg bg-white p-2 shadow-[0_2px_4px_2px_rgba(15,23,42,.04)] focus:outline-none">
          {PORTAL_HEADER_LINKS.map((option) => {
            if (option.subMenu?.length) {
              return option.subMenu.map((item) => {
                const eventCode = FATHOM_EVENTS.portal.nav[item.eventCode];

                return (
                  <Menu.Item key={item.label}>
                    <a
                      href={item.url}
                      className="block px-3 py-2 text-sm"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => eventCode && trackGoal(eventCode, 0)}
                    >
                      {item.label}
                    </a>
                  </Menu.Item>
                );
              });
            } else {
              const eventCode = FATHOM_EVENTS.portal.nav[option.eventCode];

              return (
                <Menu.Item key={option.label}>
                  <a
                    href={option.url}
                    className="block px-3 py-2 text-sm"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => eventCode && trackGoal(eventCode, 0)}
                  >
                    {option.label}
                  </a>
                </Menu.Item>
              );
            }
          })}
        </Menu.Items>
      </Transition>
    </Menu>
  );
}
