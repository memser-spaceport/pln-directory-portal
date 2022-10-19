import { UserGroupIcon, UserIcon } from '@heroicons/react/solid';
import Link from 'next/link';
import { useRouter } from 'next/router';

type HeroIcon = (props: React.ComponentProps<'svg'>) => JSX.Element;

interface IMenuItem {
  icon: HeroIcon;
  name: string;
  path: string;
}

export function Menu() {
  const MENU_ITEMS: IMenuItem[] = [
    {
      icon: UserGroupIcon,
      name: 'Teams',
      path: '/directory/teams',
    },
    {
      icon: UserIcon,
      name: 'Members',
      path: '/directory/members',
    },
  ];

  const router = useRouter();

  return (
    <ul className="flex space-x-4 text-sm text-gray-700">
      {MENU_ITEMS.map((item) => {
        const Icon = item.icon;

        return (
          <li key={item.path}>
            <Link href={item.path}>
              <a
                className={`on-focus group flex items-center rounded-lg px-3 py-2.5 text-sm hover:text-slate-900 focus:text-slate-900 ${
                  router.pathname == item.path
                    ? 'bg-slate-100 text-slate-900'
                    : 'text-slate-600'
                }`}
              >
                <Icon
                  data-testid={`${item.name}-icon`}
                  className={`mr-2 h-5 w-5 group-hover:fill-slate-900 ${
                    router.pathname == item.path
                      ? 'fill-slate-900'
                      : 'fill-slate-600'
                  }`}
                />
                {item.name}
              </a>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
