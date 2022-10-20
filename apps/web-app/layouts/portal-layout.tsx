import { PortalHeader } from '../components/portal/portal-header/portal-header';

export function PortalLayout({ children }) {
  return (
    <>
      <div className="absolute z-40 w-full p-6 sm:px-16">
        <PortalHeader />
      </div>
      <main>{children}</main>
    </>
  );
}
