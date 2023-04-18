import Image from 'next/image';
import { FooterMainNav } from './footer-main-nav';
import { FooterSocialNav } from './footer-social-nav';

export const Footer = () => {
  return (
    <>
      <footer className="flex flex-col items-center justify-between px-6 py-24 md:flex-row md:px-16 md:py-8">
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
