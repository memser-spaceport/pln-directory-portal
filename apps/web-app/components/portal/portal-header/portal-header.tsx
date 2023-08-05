import Image from 'next/image';
import { PortalMenuMobile } from './portal-menu-mobile/portal-menu-mobile';
import { PortalNavbar } from './portal-navbar/portal-navbar';
import { useFloatingPortalHeader } from './use-floating-portal-header';

export function PortalHeader({showBanner}) {
  const isFloating = useFloatingPortalHeader();

  return (
    <>
      <div className="relative flex items-center justify-between">
        <div className="relative h-8 w-8 md:h-16 md:w-16">
          <Image
            src={`/assets/images/protocol-labs-network-small-logo.svg`}
            layout="fill"
            objectFit="cover"
            alt="Protocol Labs Logo"
          />
        </div>
        <div className="md:hidden">
          <PortalMenuMobile />
        </div>
      </div>
      <div
        className={`fixed top-16 ${!showBanner ? 'top-7':''} left-1/2 z-50 hidden -translate-x-1/2 transition-all duration-700 ease-in-out md:block`}
      >
        <PortalNavbar floating={isFloating} />
      </div>
    </>
  );
}
