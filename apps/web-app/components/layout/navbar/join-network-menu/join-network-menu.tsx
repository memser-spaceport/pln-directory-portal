import { Menu, Transition } from '@headlessui/react';
import { UserGroupIcon, UserIcon } from '@heroicons/react/outline';
import { ArrowIcon } from '@protocol-labs-network/ui';
import { trackGoal } from 'fathom-client';
import Link from 'next/link';
import React, { forwardRef, Fragment, useState } from 'react';
import { FATHOM_EVENTS } from '../../../../constants';
import { AddMemberModal } from '../../../members/member-enrollment/addmember';
import { AddTeamModal } from '../../../teams/team-enrollment/addteam';

type HeroIcon = (props: React.ComponentProps<'svg'>) => JSX.Element;

interface IMenuOption {
  icon: HeroIcon;
  label: string;
  url: string;
  eventCode: string;
}

const JOIN_NETWORK_MENU_OPTIONS: IMenuOption[] = [
  {
    icon: UserIcon,
    label: 'As a Member',
    url: 'https://airtable.com/shr7xzCLmEiatgcNK',
    eventCode: FATHOM_EVENTS.directory.joinNetworkAsMember,
  },
  {
    icon: UserGroupIcon,
    label: 'As a Team',
    url: 'https://airtable.com/shr5o6bOrdx9gWBY0',
    eventCode: FATHOM_EVENTS.directory.joinNetworkAsTeam,
  },
];

export function JoinNetworkMenu() {
  const joinNetworkCode = FATHOM_EVENTS.directory.joinNetwork;
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);

  const handleOpenModal = (label: string) => {
    // if (
    //   typeof document !== 'undefined' &&
    //   document.getElementsByClassName('grecaptcha-badge').length
    // ) {
    //   document
    //     .getElementsByClassName('grecaptcha-badge')[0]
    //     .classList.add('width-full');
    // }
    label.includes('Member')
      ? setIsMemberModalOpen(true)
      : setIsTeamModalOpen(true);
  };

  return (
    <>
      <Menu as="div" className="relative">
        {({ open }) => (
          <>
            <Menu.Button
              onClick={() =>
                !open && joinNetworkCode && trackGoal(joinNetworkCode, 0)
              }
              className="shadow-special-button-default hover:shadow-on-hover focus:shadow-special-button-focus inline-flex w-full justify-center rounded-full bg-gradient-to-r from-[#427DFF] to-[#44D5BB] px-6 py-2 text-base font-semibold leading-6 text-white outline-none hover:from-[#1A61FF] hover:to-[#2CC3A8]"
            >
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
              <Menu.Items
                static
                className="absolute right-0 mt-2 w-full rounded-lg bg-white p-2 shadow-md focus:outline-none"
              >
                {JOIN_NETWORK_MENU_OPTIONS.map((option) => {
                  const OptionIcon = option.icon;
                  return (
                    <Menu.Item key={option.label}>
                      {(active) => (
                        <OptionLink
                          href={'#'}
                          eventCode={option.eventCode}
                          onClick={() => handleOpenModal(option.label)}
                        >
                          <OptionIcon className="stroke-1.5 mr-2 h-4 w-4" />
                          {option.label}
                        </OptionLink>
                      )}
                    </Menu.Item>
                  );
                })}
              </Menu.Items>
            </Transition>
          </>
        )}
      </Menu>
      <AddMemberModal
        isOpen={isMemberModalOpen}
        setIsModalOpen={setIsMemberModalOpen}
      />
      <AddTeamModal
        isOpen={isTeamModalOpen}
        setIsModalOpen={setIsTeamModalOpen}
      />
    </>
  );
}

const OptionLink = forwardRef<
  HTMLAnchorElement,
  {
    href: string;
    children: React.ReactNode;
    active?: boolean;
    eventCode: string;
    onClick: () => void;
  }
>(({ href, children, active, onClick, eventCode }, ref) => {
  return (
    <Link href={href}>
      <a
        className="on-focus flex items-center rounded-md px-3 py-2 text-sm transition duration-150 ease-in-out hover:bg-slate-100 focus:bg-white"
        rel="noopener noreferrer"
        ref={ref}
        onClick={() => {
          onClick();
          eventCode && trackGoal(eventCode, 0);
        }}
      >
        {children}
      </a>
    </Link>
  );
});
OptionLink.displayName = 'OptionLink';
