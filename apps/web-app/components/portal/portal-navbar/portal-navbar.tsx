import { PORTAL_NAVBAR_ITEMS } from './portal-navbar.constants';

interface PortalNavbarProps {
  floating: boolean;
}

export function PortalNavbar({ floating }: PortalNavbarProps) {
  return (
    <div
      className={`flex gap-2 rounded-lg text-sm font-medium leading-6	 ${
        floating
          ? 'bg-white/[.92] shadow-[0_1px_4px_2px_rgba(15,23,42,.04)]'
          : 'bg-white shadow-[0_2px_4px_2px_rgba(15,23,42,.04)]'
      } p-2 `}
    >
      {PORTAL_NAVBAR_ITEMS.map((item) => (
        <a
          className="rounded bg-white py-1 px-2 outline-none outline-1 outline-offset-0 outline-white ring-2 ring-white ring-opacity-25 ring-offset-1 transition-all hover:bg-blue-600 hover:text-white focus:outline-blue-600 focus:ring-blue-600 focus:ring-opacity-25"
          href={item.url}
          key={item.label}
          target="_blank"
          rel="noopener noreferrer"
        >
          {item.label}
        </a>
      ))}
    </div>
  );
}
