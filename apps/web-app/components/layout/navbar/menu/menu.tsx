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
      path: '/teams',
    },
    {
      icon: UserIcon,
      name: 'Members',
      path: '/members',
    },
  ];

  const router = useRouter();

  return (
    <ul className="flex text-sm text-gray-700">
      {MENU_ITEMS.map((item) => {
        const Icon = item.icon;

        return (
          <li key={item.path}>
            <Link href={item.path}>
              <a
                className={`${
                  router.pathname == item.path ? 'text-sky-600' : ''
                } flex items-center px-2 py-2 hover:text-sky-600`}
              >
                <Icon
                  data-testid={`${item.name}-icon`}
                  className="mr-2 h-5 w-5"
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

export default Menu;
