import { FATHOM_EVENTS } from '../../../constants';
import { IPortalHeaderLink } from './portal-header.types';

export const PORTAL_HEADER_LINKS: IPortalHeaderLink[] = [
  {
    label: 'Directory',
    url: '/directory',
    eventCode: FATHOM_EVENTS.portal.nav.directory,
  },
  {
    label: 'Events',
    url: 'https://events.plnetwork.io/',
    eventCode: FATHOM_EVENTS.portal.nav.events,
  },
  {
    label: 'Launchpad',
    url: 'https://pl-launchpad.io/',
    eventCode: FATHOM_EVENTS.portal.nav.launchpad,
  },
  {
    label: 'Mosaia',
    url: 'https://mosaia.io/',
    eventCode: FATHOM_EVENTS.portal.nav.mosaia,
  },
  {
    label: 'Social',
    subMenu: [
      {
        label: 'Discord',
        url: 'https://discord.com/invite/protocollabs',
        eventCode: FATHOM_EVENTS.portal.nav.discord,
      },
      {
        label: 'Ideas Hub',
        url: 'https://github.com/orgs/memser-spaceport/discussions',
        eventCode: FATHOM_EVENTS.portal.nav.ideashub,
      },
    ],
  },
];
