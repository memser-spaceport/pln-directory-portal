import Link from 'next/link';
import Menu from './menu/menu';
import { ReactComponent as ProtocolLabsLogo } from '/public/assets/images/protocol-labs-logo-horizontal-black.svg';

export function Navbar() {
  return (
    <nav className="w-full bg-white/95 py-3 border-b border-slate-200">
      <div className="flex items-center px-8 mx-0">
        <Link href="/">
          <a className="mr-5 w-auto">
            <ProtocolLabsLogo
              title="Protocol Labs Network Black Logo"
              width={173}
              height={47}
            />
          </a>
        </Link>
        <Menu />
        <button
          className="text-xs text-gray-400 ml-auto px-3 py-1 border border-gray-300 rounded-full"
          disabled
        >
          Join the Network
        </button>
      </div>
    </nav>
  );
}

export default Navbar;
