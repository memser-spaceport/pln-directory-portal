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
      <Menu.Button className="inline-flex w-full justify-center rounded-full px-6 py-2 leading-6 text-[15px] font-semibold text-white bg-gradient-to-r from-[#427DFF] to-[#44D5BB] hover:from-[#1A61FF] hover:to-[#2CC3A8] shadow-special-button-default hover:shadow-special-button-hover focus:shadow-special-button-focus outline-none">
        Join the Network
        <div className="ml-3.5 my-auto">
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
        <Menu.Items className="absolute right-0 mt-2 p-2 w-full rounded-lg bg-white shadow-md focus:outline-none">
          {JOIN_NETWORK_MENU_OPTIONS.map((option) => {
            const OptionIcon = option.icon;
            return (
              <Menu.Item key={option.label}>
                {({ active }) => (
                  <OptionLink href={option.url} active={active}>
                    <OptionIcon className="mr-2 w-5 h-5" />
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
        className={`group flex w-full items-center rounded-lg px-3 py-2 text-sm ${
          active ? 'bg-slate-100' : ''
        } `}
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
