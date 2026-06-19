import React from 'react';

import {
  BookIcon,
  ChatIcon,
  GridIcon,
  FolderIcon,
  LayersIcon,
  PeopleIcon,
  CalendarIcon,
  StarCalendarIcon,
} from '../components/Icons';

export function getModuleIcon(module: string) {
  switch (module) {
    case 'Directory':
      return <FolderIcon />;
    case 'Office Hours':
      return <CalendarIcon />;
    case 'Forum':
      return <ChatIcon />;
    case 'IRL Gatherings':
      return <PeopleIcon />;
    case 'Founder Guides':
      return <BookIcon />;
    case 'PL Demo Day':
    case 'Partner Demo Day':
      return <StarCalendarIcon />;
    case 'Admin Tool':
      return <LayersIcon />;
    default:
      return <GridIcon />;
  }
}
