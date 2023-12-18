import { Menu, Transition } from '@headlessui/react';
import { UserGroupIcon, UserIcon } from '@heroicons/react/outline';
import { ArrowIcon } from '@protocol-labs-network/ui';
import { trackGoal } from 'fathom-client';
import Cookies from 'js-cookie';
import Link from 'next/link';
import React, { forwardRef, Fragment, useState } from 'react';
import { FATHOM_EVENTS, PAGE_ROUTES } from '../../../../constants';
import { AddMemberModal } from '../../../members/member-enrollment/addmember';
import { AddTeamModal } from '../../../teams/team-enrollment/addteam';
import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';
import { cookiePrefix } from "../../../../utils/common.utils";

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
  const {captureEvent}  = useAppAnalytics()
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

  const onJoinMenuClicked = () => {
    if(!open && joinNetworkCode) {
      trackGoal(joinNetworkCode, 0);
    }
    captureEvent('navbar-join-network-menu-clicked')
  }

  const onJoinMenuItemClicked = (label) => {
    if (Cookies.get(`${cookiePrefix()}userInfo`)) {
      Cookies.set(`${cookiePrefix()}page_params`, 'user_logged_in', { expires: 60, path: '/' });
      window.location.href = PAGE_ROUTES.TEAMS;
    } else {
      handleOpenModal(label)
      if(label && label.includes('Member')) {
        captureEvent('navbar-join-network-menu-item-clicked', {
            name: 'member'
        })
      } else if (label && label.includes('Team')) {
        captureEvent('navbar-join-network-menu-item-clicked', {
          name: 'team'
      })
      }
    }
    //
  }

  return (
    <>
      <Menu as="div" className="relative">
        {({ open }) => (
          <>
            <Menu.Button
              onClick={onJoinMenuClicked}
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
                          onClick={() => onJoinMenuItemClicked(option.label)}
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
