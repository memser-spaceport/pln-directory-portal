import { UserGroupIcon, UserIcon } from '@heroicons/react/solid';
import { APP_ANALYTICS_EVENTS } from 'apps/web-app/constants';
import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';
import Link from 'next/link';
import { useRouter } from 'next/router';
type HeroIcon = (props: React.ComponentProps<'svg'>) => JSX.Element;
import { ReactComponent as ProjectsIcon } from '../../../../public/assets/images/icons/projects/projects.svg';
import { ReactComponent as IRLGatheringIcon } from '../../../../public/assets/images/icons/nav-calendar.svg';

interface IMenuItem {
  icon: HeroIcon;
  name: string;
  path: string;
  version: string;
}

export function MobileMenu() {
  const MENU_ITEMS: IMenuItem[] = [
    {
      icon: UserGroupIcon,
      name: 'Teams',
      path: '/teams',
      version: 'PUBLISHED',
    },
    {
      icon: UserIcon,
      name: 'Members',
      path: '/members',
      version: 'PUBLISHED',
    },
    {
      icon: ProjectsIcon,
      name: 'Projects',
      path: '/projects',
      version: 'PUBLISHED',
    },
    {
      icon: IRLGatheringIcon,
      name: 'IRL Gatherings',
      path: '/irl/labweek-24pgf',
      version: 'BETA',
    },
  ];

  const router = useRouter();
  const analytics = useAppAnalytics();

  const onMenuItemClicked = (itemName) => {
    analytics.captureEvent(APP_ANALYTICS_EVENTS.NAVBAR_MENU_ITEM_CLICKED, {
      name: itemName,
    });
  };

  return (
    <ul className="flex justify-between w-full text-sm text-gray-700">
      {MENU_ITEMS.map((item) => {
        const Icon = item.icon;

        return (
          <li key={item.path}>
            <Link href={item.path}>
              <a
                className={`on-focus group flex flex-col items-center rounded-lg px-3 py-2.5 text-sm hover:text-slate-900 focus:text-slate-900 ${
                  router.asPath.includes(item.path)
                    ? 'bg-slate-200 text-slate-900'
                    : 'text-slate-600'
                }`}
                onClick={(e) => onMenuItemClicked(item.name)}
              >
                <Icon
                  data-testid={`${item.name}-icon`}
                  className={` h-5 w-5 group-hover:fill-slate-900 ${
                    router.asPath.includes(item.path)
                      ? 'fill-slate-900'
                      : 'fill-slate-600'
                  }`}
                />
                <span className='text-[8px]'>{item.name}</span>

               
              </a>
            </Link>
          </li>
        );
      })}
      
    </ul>
  );
}
