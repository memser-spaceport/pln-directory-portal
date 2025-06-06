import Link from 'next/link';
import { ReactComponent as ProtocolLabsLogo } from '/public/assets/images/Logo.svg';
import { ReactComponent as LogOut } from '/public/assets/images/log-out.svg';
import { PlayIcon, ClockIcon } from '@heroicons/react/solid';
import { ROUTE_CONSTANTS } from '../utils/constants';
import { removeToken } from '../utils/auth';
import { useRouter } from 'next/router';

interface RecommendationsLayoutProps {
  children: React.ReactNode;
  activeTab?: string;
  title?: string;
  actionButton?: {
    label: string;
    onClick: () => void;
  };
}

export function RecommendationsLayout({
  children,
  actionButton,
  title = 'Recommendations',
  activeTab,
}: RecommendationsLayoutProps) {
  const router = useRouter();

  const onLogout = () => {
    removeToken();
    router.push('/');
  };

  return (
    <div className="flex h-full w-full flex-col">
      <div className="header min-h-[80px]">
        <nav className="navbar top-0 flex h-[8%] min-h-[80px] items-center justify-between pr-[40px] only-of-type:shadow-[0_1px_4px_0_#e2e8f0]">
          <div className="flex h-full items-center space-x-5">
            <div className="m-auto h-full w-[80px] bg-[#1D4ED8]">
              <Link href={ROUTE_CONSTANTS.PENDING_LIST}>
                <a className="on-focus relative left-[15px] top-[20px]">
                  <ProtocolLabsLogo title="Protocol Labs Directory Beta Black Logo" width="45" height="40" />
                </a>
              </Link>
            </div>
            <span className="text-base font-semibold">{title}</span>
          </div>
          {!!activeTab && (
            <ul className="flex space-x-4 text-sm text-gray-700">
              <Link href={ROUTE_CONSTANTS.RECOMMENDATIONS_RUNS}>
                <a
                  className={`on-focus group flex items-center rounded-lg px-3 py-2.5 text-sm focus:text-slate-900 ${
                    activeTab === 'runs' ? 'text-[#1D4ED8]' : 'text-[#475569]'
                  }`}
                >
                  <PlayIcon className="mr-2 h-5 w-5" />
                  Runs
                </a>
              </Link>
              <Link href={ROUTE_CONSTANTS.RECOMMENDATIONS_HISTORY}>
                <a
                  className={`on-focus group flex items-center rounded-lg px-3 py-2.5 text-sm focus:text-slate-900 ${
                    activeTab === 'history' ? 'text-[#1D4ED8]' : 'text-[#475569]'
                  }`}
                >
                  <ClockIcon className="mr-2 h-5 w-5" />
                  History
                </a>
              </Link>
            </ul>
          )}
          <div className="flex items-center space-x-4 text-sm text-gray-700">
            <div className="min-w-[220px]">
              {actionButton && (
                <button
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  onClick={actionButton.onClick}
                >
                  {actionButton.label}
                </button>
              )}
            </div>
            <LogOut onClick={onLogout} className="w-[30px] cursor-pointer" title="LogOut" width="45" height="40" />
          </div>
        </nav>
      </div>
      <main className="h-[92%] overflow-y-auto bg-gray-200">{children}</main>
    </div>
  );
}
