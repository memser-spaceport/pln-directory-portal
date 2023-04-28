import { Menu, Transition } from '@headlessui/react';
import { UserIcon } from '@heroicons/react/solid';
import { CogIcon, ArrowNarrowRightIcon } from '@heroicons/react/outline';
import { ArrowIcon } from '@protocol-labs-network/ui';
import { trackGoal } from 'fathom-client';
import Link from 'next/link';
import { forwardRef, Fragment } from 'react';
import { JoinNetworkMenu } from './join-network-menu/join-network-menu';
import { Login } from './login-menu/login-menu';
import { Menu as AppMenu } from './menu/menu';
import { ReactComponent as ProtocolLabsLogo } from '/public/assets/images/protocol-labs-network-logo-horizontal-black.svg';
import { GoogleReCaptchaProvider } from 'react-google-recaptcha-v3';
import { IMember } from 'apps/web-app/utils/members.types';
import { destroyCookie } from 'nookies';
type HeroIcon = (props: React.ComponentProps<'svg'>) => JSX.Element;

type INavbarProbs = {
  isUserLoggedIn: boolean;
  member: IMember;
};

type ISettingMenu = {
  icon: HeroIcon;
  label: string;
  url: string;
  eventCode: string;
  onClick?: () => void;
};

const settingMenu: ISettingMenu[] = [
  {
    icon: CogIcon,
    label: 'Account Settings',
    url: `/directory/members/:memberId/accountSettings`,
    eventCode: '',
  },
  {
    icon: ArrowNarrowRightIcon,
    label: 'Logout',
    url: '/directory/members/logout',
    eventCode: '',
    onClick: () => {
      destroyCookie(null, 'state', {
        path: '/',
      });
    },
  },
];

export function Navbar({ isUserLoggedIn = false, member }: INavbarProbs) {
  return (
    <nav className="navbar top-0 h-20 justify-between pl-12 only-of-type:shadow-[0_1px_4px_0_#e2e8f0]">
      <div className="flex items-center space-x-5">
        <Link href="/directory">
          <a className="on-focus">
            <ProtocolLabsLogo
              title="Protocol Labs Network Directory Beta Black Logo"
              width="212"
              height="60"
            />
          </a>
        </Link>
        <AppMenu />
      </div>
      <GoogleReCaptchaProvider
        reCaptchaKey={process.env.NEXT_PUBLIC_GOOGLE_SITE_KEY}
        scriptProps={{
          async: false,
          defer: false,
          appendTo: 'head',
          nonce: undefined,
        }}
      >
        {isUserLoggedIn ? (
          <div className="flex h-14 w-full justify-end space-x-4">
            {member.name && (
              <div className="my-auto font-medium text-slate-600">
                {' '}
                Welcome {member.name}{' '}
              </div>
            )}
            {member.image ? (
              <img
                src={member.image}
                alt=""
                className="h-full w-14 rounded-full"
              />
            ) : (
              <UserIcon className="h-full w-14 fill-white" />
            )}
            <Menu as="div" className="relative ml-2 w-16">
              {({ open }) => (
                <>
                  <Menu.Button onClick={() => !open} className="h-full w-full">
                    <div className="my-auto">
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
                      className="absolute right-full mt-2 w-48 rounded-lg bg-white p-2 shadow-md focus:outline-none"
                    >
                      {settingMenu.map((option) => {
                        const OptionIcon = option.icon;
                        return (
                          <Menu.Item key={option.label}>
                            {(active) => (
                              <OptionLink
                                href={
                                  option.label === 'Account Settings'
                                    ? `/directory/members/${member.id}/accountSettings`
                                    : option.url
                                }
                                onClick={
                                  option.onClick ? option.onClick : () => {}
                                }
                                eventCode={option.eventCode}
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
          </div>
        ) : (
          <div className="mr-12 flex justify-center">
            <JoinNetworkMenu />
            <Login />
          </div>
        )}
      </GoogleReCaptchaProvider>
    </nav>
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
