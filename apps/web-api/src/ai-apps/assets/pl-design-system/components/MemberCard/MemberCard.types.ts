import type { HTMLAttributes } from 'react';

export type AvailabilityStatus = 'available' | 'booked' | 'unavailable';

export interface MemberCardProps extends HTMLAttributes<HTMLDivElement> {
  avatar?: string;
  name: string;
  role?: string;
  company?: string;
  location?: string;
  availability?: AvailabilityStatus;
  tags?: string[];
  href?: string;
  compact?: boolean;
}
