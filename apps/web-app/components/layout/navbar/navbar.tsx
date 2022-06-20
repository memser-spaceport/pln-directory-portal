import Link from 'next/link';
import { JoinNetworkMenu } from './join-network-menu/join-network-menu';
import Menu from './menu/menu';
import { ReactComponent as ProtocolLabsLogo } from '/public/assets/images/protocol-labs-logo-horizontal-black.svg';

export function Navbar() {
  return (
    <nav className="flex w-full items-center justify-between border-b border-slate-200 bg-white/95 py-3 px-8">
      <div className="flex items-center space-x-5">
        <Link href="/">
          <a>
            <ProtocolLabsLogo
              title="Protocol Labs Network Black Logo"
              width={173}
              height={47}
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
