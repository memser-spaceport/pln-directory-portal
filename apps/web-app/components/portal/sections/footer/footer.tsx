import Image from 'next/image';
import { FooterMainNav } from './footer-main-nav';
import { FooterSocialNav } from './footer-social-nav';

export const Footer = () => {
  return (
    <>
      <footer className="flex flex-col items-center justify-between py-24 px-6 md:flex-row md:py-8 md:px-16">
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
