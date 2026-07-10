import type { HTMLAttributes } from 'react';

export interface TeamMember { avatar?: string; name: string; role?: string; }

export interface TeamCardProps extends HTMLAttributes<HTMLDivElement> {
  logo?: string;
  logoFallback?: string;
  name: string;
  description?: string;
  website?: string;
  tags?: string[];
  members?: TeamMember[];
  actions?: React.ReactNode;
  href?: string;
  stage?: string;
  compact?: boolean;
}
