import { Menu, Transition } from '@headlessui/react';
import { UserGroupIcon, UserIcon } from '@heroicons/react/outline';
import { ArrowIcon } from '@protocol-labs-network/ui';
import Link from 'next/link';
import React, { forwardRef, Fragment } from 'react';

type HeroIcon = (props: React.ComponentProps<'svg'>) => JSX.Element;

interface IMenuOption {
  icon: HeroIcon;
  label: string;
  url: string;
}

const JOIN_NETWORK_MENU_OPTIONS: IMenuOption[] = [
  {
    icon: UserIcon,
    label: 'As a Member',
    url: 'https://airtable.com/shridgH41yhbvCYXW',
  },
  {
    icon: UserGroupIcon,
    label: 'As a Team',
    url: 'https://airtable.com/shrCUt3HKrxd7EDEw',
  },
];

export function JoinNetworkMenu() {
  return (
    <Menu as="div" className="relative">
      <Menu.Button className="shadow-special-button-default hover:shadow-special-button-hover focus:shadow-special-button-focus inline-flex w-full justify-center rounded-full bg-gradient-to-r from-[#427DFF] to-[#44D5BB] px-6 py-2 text-base font-semibold leading-6 text-white outline-none hover:from-[#1A61FF] hover:to-[#2CC3A8]">
        Join the network
        <div className="my-auto ml-3.5">
          <ArrowIcon />
        </div>
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
        <Menu.Items className="absolute right-0 mt-2 w-full rounded-lg bg-white p-2 shadow-md focus:outline-none">
          {JOIN_NETWORK_MENU_OPTIONS.map((option) => {
            const OptionIcon = option.icon;
            return (
              <Menu.Item key={option.label}>
                {({ active }) => (
                  <OptionLink href={option.url} active={active}>
                    <OptionIcon className="stroke-1.5 mr-2 h-4 w-4" />
                    {option.label}
                  </OptionLink>
                )}
              </Menu.Item>
            );
          })}
        </Menu.Items>
      </Transition>
    </Menu>
  );
}

const OptionLink = forwardRef<
  HTMLAnchorElement,
  { href: string; children: React.ReactNode; active: boolean }
>(({ href, children, active }, ref) => {
  return (
    <Link href={href}>
      <a
        className="flex items-center rounded-md px-3 py-2 text-sm transition duration-150 ease-in-out hover:bg-slate-100 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-300"
        target="_blank"
        rel="noopener noreferrer"
        ref={ref}
      >
        {children}
      </a>
    </Link>
  );
});
OptionLink.displayName = 'OptionLink';
