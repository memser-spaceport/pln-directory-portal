import type { ReactNode, HTMLAttributes } from 'react';

export interface OfficeHoursHost {
  avatar?: string;
  name: string;
  role?: string;
  bio?: string;
  isTeam?: boolean;
}

export interface OfficeHoursCardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  host: OfficeHoursHost;
  onSchedule?: () => void;
  scheduleHref?: string;
  scheduleLabel?: string;
  action?: ReactNode;
}
