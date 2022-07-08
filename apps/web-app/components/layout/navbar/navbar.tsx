import Link from 'next/link';
import { JoinNetworkMenu } from './join-network-menu/join-network-menu';
import Menu from './menu/menu';
import { ReactComponent as ProtocolLabsLogo } from '/public/assets/images/protocol-labs-network-logo-horizontal-black.svg';

export function Navbar() {
  return (
    <nav className="sticky top-0 z-50 flex w-full items-center justify-between bg-white/95 py-3 px-12 shadow-[0_1px_4px_0_#e2e8f0]">
      <div className="flex items-center space-x-5">
        <Link href="/teams">
          <a>
            <ProtocolLabsLogo
              title="Protocol Labs Network Black Logo"
              width={200}
              height={66}
            />
          </a>
        </Link>
        <Menu />
      </div>

      <JoinNetworkMenu />
    </nav>
  );
}

export default Navbar;
