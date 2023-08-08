import { useState } from "react";
import { AnnouncementBanner } from "../components/layout/announcement/banner";
import { PortalHeader } from "../components/portal/portal-header/portal-header";

export function PortalLayout({ bannerJSON,children }) {
  const [showBanner, setBannerState] = useState(true);
  return (
    <>
    {
        bannerJSON && bannerJSON?.message && (
          <AnnouncementBanner content={bannerJSON.message} showBanner={showBanner} setBannerState={setBannerState}/>
        )
      }
      <div className="absolute z-40 w-full p-6 md:px-16">
        <PortalHeader showBanner={showBanner}/>
      </div>
      <main>{children}</main>
    </>
  );
}
