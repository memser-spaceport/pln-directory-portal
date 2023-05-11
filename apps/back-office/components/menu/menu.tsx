import { UserGroupIcon, UserIcon } from '@heroicons/react/solid';
import APP_CONSTANTS, { ROUTE_CONSTANTS } from '../../utils/constants';
import { useNavbarContext } from '../../context/navbar-context';
import { useRouter } from 'next/router';

type HeroIcon = (props: React.ComponentProps<'svg'>) => JSX.Element;

interface IMenuItem {
  icon: HeroIcon;
  name: string;
  count: number;
}

export function Menu() {
  const {
    teamCount,
    memberCount,
    setIsTeamActive,
    isTeamActive,
    isOpenRequest,
  } = useNavbarContext();
  // const [isTeamActive, setIsTeamActive] = useState<boolean>(true);
  const MENU_ITEMS: IMenuItem[] = [
    {
      icon: UserGroupIcon,
      name: APP_CONSTANTS.TEAMS_LABEL,
      count: teamCount,
    },
    {
      icon: UserIcon,
      name: APP_CONSTANTS.MEMBER_LABEL,
      count: memberCount,
    },
  ];

  const router = useRouter();

  return (
    <ul className="flex space-x-4 text-sm text-gray-700">
      {MENU_ITEMS.map((item) => {
        const Icon = item.icon;

        return (
          <li key={item.name}>
            <div
              className={`cursor-pointer ${
                (isTeamActive && item.name === APP_CONSTANTS.TEAMS_LABEL) ||
                (!isTeamActive && item.name === APP_CONSTANTS.MEMBER_LABEL)
                  ? 'text-[#1D4ED8]'
                  : 'text-[#475569]'
              }`}
            >
              <a
                onClick={() => {
                  // onItemClick(item.name);
                  if (
                    router.pathname === ROUTE_CONSTANTS.TEAM_VIEW ||
                    router.pathname === ROUTE_CONSTANTS.MEMBER_VIEW
                  ) {
                    isOpenRequest
                      ? router.push(ROUTE_CONSTANTS.PENDING_LIST)
                      : router.push(ROUTE_CONSTANTS.CLOSED_LIST);
                  }

                  item.name === APP_CONSTANTS.TEAMS_LABEL
                    ? setIsTeamActive(true)
                    : setIsTeamActive(false);
                }}
                className={`on-focus group flex items-center rounded-lg px-3 py-2.5 text-sm focus:text-slate-900 `}
              >
                <Icon
                  data-testid={`${item.name}-icon`}
                  className={`mr-2 h-5 w-5 `}
                />
                {item.name}
                <div
                  className={`m-[4px] h-[20px] rounded-[15px] border border-solid ${
                    item.count > 9 ? 'w-[25px]' : 'w-[20px]'
                  }
                   border-[#1D4ED8] bg-[#1D4ED8] pl-[5px] pt-[1px] text-xs text-white
                   ${
                     (isTeamActive &&
                       item.name === APP_CONSTANTS.TEAMS_LABEL) ||
                     (!isTeamActive && item.name === APP_CONSTANTS.MEMBER_LABEL)
                       ? 'border-[#1D4ED8] bg-[#1D4ED8]'
                       : 'border-[#475569] bg-[#475569]'
                   }`}
                >
                  {item.count}
                </div>
              </a>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
