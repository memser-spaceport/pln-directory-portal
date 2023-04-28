import Link from 'next/link';
import { Menu } from '../menu/menu';
import { useNavbarContext } from '../../context/navbar-context';
import { ReactComponent as ProtocolLabsLogo } from '/public/assets/images/Logo.svg';
import { ReactComponent as LogOut } from '/public/assets/images/log-out.svg';
import APP_CONSTANTS, { ROUTE_CONSTANTS } from '../../utils/constants';
import { removeToken } from '../../utils/auth';
import router from 'next/router';

function onLogout() {
  removeToken();
  router.push('/');
}

export function Navbar() {
  const { isOpenRequest } = useNavbarContext();
  return (
    <div className="header h-[8%] min-h-[80px]">
      <nav className="navbar top-0 flex h-[80px] items-center justify-between pr-[40px] only-of-type:shadow-[0_1px_4px_0_#e2e8f0]">
        <div className="flex h-full items-center space-x-5">
          <div className="m-auto h-full w-[80px] bg-[#1D4ED8]">
            <Link href={ROUTE_CONSTANTS.PENDING_LIST}>
              <a className="on-focus relative left-[15px] top-[20px]">
                <ProtocolLabsLogo
                  title="Protocol Labs Network Directory Beta Black Logo"
                  width="45"
                  height="40"
                />
              </a>
            </Link>
          </div>
          <span className="text-base font-semibold">
            {isOpenRequest ? `Pending Requests` : `Closed Requests`}
          </span>
        </div>
        <div>
          <Menu />
        </div>
        <div className="flex space-x-4 text-sm text-gray-700">
          <Link
            href={
              isOpenRequest
                ? ROUTE_CONSTANTS.CLOSED_LIST
                : ROUTE_CONSTANTS.PENDING_LIST
            }
          >
            <a
              target="_self"
              className={`on-focus shadow-request-button
            hover:shadow-on-hover flex h-10 items-center justify-center rounded-lg border border-blue-700
            py-2 px-4 text-sm font-medium hover:border-slate-200
            hover:ring-2 hover:ring-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-300
            active:border-blue-700 active:ring-2 active:ring-blue-300 ${
              isOpenRequest
                ? 'bg-white text-blue-700 '
                : 'bg-[#1D4ED8] text-white'
            }`}
            >
              {isOpenRequest
                ? APP_CONSTANTS.VIEW_CLOSED_REQUEST_LABEL
                : APP_CONSTANTS.EXIT_CLOSED_REQUEST_LABEL}
            </a>
          </Link>
          <LogOut
            onClick={onLogout}
            className="w-[30px] cursor-pointer"
            title="LogOut"
            width="45"
            height="40"
          />
        </div>
      </nav>
    </div>
  );
}
