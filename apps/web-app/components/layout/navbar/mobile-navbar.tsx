import { Menu, Transition } from '@headlessui/react';
import { UserIcon } from '@heroicons/react/solid';
import { CogIcon, ArrowNarrowRightIcon } from '@heroicons/react/outline';
import { ArrowIcon, Tooltip } from '@protocol-labs-network/ui';
import { trackGoal } from 'fathom-client';
import Image from 'next/image';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Cookies from 'js-cookie';
import { forwardRef, Fragment } from 'react';
import { toast } from 'react-toastify';
import { JoinNetworkMenu } from './join-network-menu/join-network-menu';
import { Login } from './login-menu/login-menu';
import { Menu as AppMenu } from './menu/menu';
import { ReactComponent as ProtocolLabsLogo } from '/public/assets/images/pln_logo.svg';
import { PAGE_ROUTES, FATHOM_EVENTS, APP_ANALYTICS_EVENTS, LOGOUT_MSG } from '../../../constants';
import { createLogoutChannel } from '../../../utils/services/auth';
import useAppAnalytics from '../../../hooks/shared/use-app-analytics';
import { HelperMenu } from './helper-menu/helper-menu';
import { MobileMenu } from './menu/mobile-menu';
// import { GoogleReCaptchaProvider } from 'react-google-recaptcha-v3';
type HeroIcon = (props: React.ComponentProps<'svg'>) => JSX.Element;

type INavbarProbs = {
  isUserLoggedIn: boolean;
  userInfo: any;
};

type ISettingMenu = {
  icon: HeroIcon;
  label: string;
  url: string;
  eventCode: string;
  onClick?: () => void;
};

export function MobileNavbar({ isUserLoggedIn = false, userInfo }: INavbarProbs) {
  const router = useRouter();
  const analytics = useAppAnalytics()
  const settingMenu: ISettingMenu[] = [
    {
      icon: CogIcon,
      label: 'Settings',
      url: `/settings`,
      eventCode:  FATHOM_EVENTS.directory.settings,
      onClick: () => {
        analytics.captureEvent(APP_ANALYTICS_EVENTS.NAVBAR_ACCOUNTMENU_ITEM_CLICKED, {
          'itemName': 'settings'
        })
        if (!Cookies.get('refreshToken')) {
          Cookies.set('page_params', 'user_logged_out', { expires: 60, path: '/' });
          window.location.href = PAGE_ROUTES.TEAMS;
        }
      }
    },
    {
      icon: ArrowNarrowRightIcon,
      label: 'Logout',
      url: '#',
      eventCode: FATHOM_EVENTS.directory.logout,
      onClick: () => {
        analytics.captureEvent(APP_ANALYTICS_EVENTS.NAVBAR_ACCOUNTMENU_ITEM_CLICKED, {
          'itemName': 'logout'
        })
        Cookies.remove('authToken', { path: '/', domain: process.env.COOKIE_DOMAIN || '' });
        Cookies.remove('refreshToken', { path: '/', domain: process.env.COOKIE_DOMAIN || ''});
        Cookies.remove('userInfo', { path: '/', domain: process.env.COOKIE_DOMAIN || '' });
        Cookies.set('page_params', 'logout', { expires: 60, path: '/' });
        toast.info(LOGOUT_MSG, {
          hideProgressBar: true
        });
        createLogoutChannel().postMessage('logout');
      },
    },
  ];
  return (
    <nav className="w-full fixed z-50 bg-white/95 py-[8px] justify-between px-4 only-of-type:shadow-[0_1px_4px_0_#e2e8f0]">
    <div className="flex items-center justify-between">
      <MobileMenu />
      <div  className="flex gap-4 items-center">
       
       {isUserLoggedIn ? (
         <div className="flex mx-[4px] justify-end">
          
           {userInfo.profileImageUrl ? (
             <Image
               src={userInfo.profileImageUrl}
               width={36}
               height={36}
               objectFit="cover"
               objectPosition="center"
               alt="Profile Picture"
               className="h-full w-14 rounded-full"
             />
           ) : (
             <UserIcon className="h-full w-14 fill-white bg-slate-200 rounded-full" />
           )}
           <Menu as="div" className="relative w-auto">
             {({ open }) => (
               <>
                 <Menu.Button onClick={() => !open} className="ml-2 h-full w-full">
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
                               href={option.url}
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
       ) : null }
       </div>
    </div>
     
      {/* </GoogleReCaptchaProvider> */}
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