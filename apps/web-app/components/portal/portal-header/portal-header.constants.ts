import { FATHOM_EVENTS } from '../../../constants';
import { IPortalHeaderLink } from './portal-header.types';

export const PORTAL_HEADER_LINKS: IPortalHeaderLink[] = [
  {
    label: 'Directory',
    url: '/directory',
    eventCode: FATHOM_EVENTS.portal.nav.directory,
  },
  {
    label: 'LabWeek22',
    url: 'https://22.labweek.io/',
    eventCode: FATHOM_EVENTS.portal.nav.labWeek22,
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
    label: 'Discord',
    url: 'https://discord.com/invite/protocollabs',
    eventCode: FATHOM_EVENTS.portal.nav.discord,
  },
];
