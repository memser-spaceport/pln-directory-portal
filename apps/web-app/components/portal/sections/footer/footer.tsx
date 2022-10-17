import Image from 'next/image';
import { PortalDivider } from '../../portal-divider/portal-divider';
import { FooterMainNav } from './footer-main-nav';
import { FooterSocialNav } from './footer-social-nav';

export const Footer = () => {
  return (
    <>
      <PortalDivider />
      <footer className="mt-10 flex flex-col items-center sm:flex-row">
        <Image
          src="/assets/images/protocol-labs-network-small-logo.svg"
          width="64px"
          height="64px"
          alt="Protocol Labs Network small logo"
        />
        <FooterMainNav />
        <FooterSocialNav />
      </footer>
    </>
  );
};
