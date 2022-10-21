import { trackGoal } from 'fathom-client';
import { FATHOM_EVENTS } from '../../../../constants';
import { PORTAL_HEADER_LINKS } from '../portal-header.constants';

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
      } p-2 transition-all duration-700 ease-in-out`}
    >
      {PORTAL_HEADER_LINKS.map((item) => {
        const eventCode = FATHOM_EVENTS.portal.nav[item.eventCode];

        return (
          <a
            className="rounded py-1 px-2 outline-none transition-all duration-300 ease-in-out hover:bg-blue-600 hover:text-white focus:outline-1 focus:outline-offset-0 focus:outline-blue-600 focus:ring-2 focus:ring-blue-600 focus:ring-opacity-25 focus:ring-offset-1"
            href={item.url}
            key={item.label}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => eventCode && trackGoal(eventCode, 0)}
          >
            {item.label}
          </a>
        );
      })}
    </div>
  );
}
