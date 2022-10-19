import { PortalHeader } from '../components/portal/portal-header/portal-header';

export function PortalLayout({ children }) {
  return (
    <>
      <div className="m-6 sm:mx-16">
        <PortalHeader />
      </div>
      <main>{children}</main>
    </>
  );
}
