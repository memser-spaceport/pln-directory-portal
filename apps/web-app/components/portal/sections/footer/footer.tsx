import Image from 'next/image';
import { FooterMainNav } from './footer-main-nav';
import { FooterSocialNav } from './footer-social-nav';

export const Footer = () => {
  return (
    <>
      <footer className="flex flex-col items-center py-24 px-6 sm:flex-row sm:py-8 sm:px-16">
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
