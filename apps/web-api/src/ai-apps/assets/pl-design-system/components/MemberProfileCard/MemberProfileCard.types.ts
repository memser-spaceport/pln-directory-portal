import type { HTMLAttributes } from 'react';
import type { AvailabilityStatus } from '@components/MemberCard';

export interface MemberProfileCardProps extends HTMLAttributes<HTMLElement> {
  name: string;
  role?: string;
  company?: string;
  location?: string;
  tags?: string[];
  avatar?: string;
  availability?: AvailabilityStatus;
  href?: string;
}
