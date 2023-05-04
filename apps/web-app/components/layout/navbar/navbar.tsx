import Link from 'next/link';
import { JoinNetworkMenu } from './join-network-menu/join-network-menu';
import { Menu } from './menu/menu';
import { ReactComponent as ProtocolLabsLogo } from '/public/assets/images/protocol-labs-network-logo-horizontal-black.svg';
// import { GoogleReCaptchaProvider } from 'react-google-recaptcha-v3';

export function Navbar() {
  return (
    <nav className="navbar top-0 h-20 justify-between px-12 only-of-type:shadow-[0_1px_4px_0_#e2e8f0]">
      <div className="flex items-center space-x-5">
        <Link href="/directory">
          <a className="on-focus">
            <ProtocolLabsLogo
              title="Protocol Labs Network Directory Beta Black Logo"
              width="212"
              height="60"
            />
          </a>
        </Link>
        <Menu />
      </div>
      {/* <GoogleReCaptchaProvider
        reCaptchaKey={process.env.NEXT_PUBLIC_GOOGLE_SITE_KEY}
        scriptProps={{
          async: false,
          defer: false,
          appendTo: 'head',
          nonce: undefined,
        }}
      > */}
        <JoinNetworkMenu />
      {/* </GoogleReCaptchaProvider> */}
    </nav>
  );
}
