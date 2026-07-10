import type { HTMLAttributes } from 'react';

export interface FocusAreaCardMember { avatar?: string; name: string; }

export interface FocusAreaCardProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  teamCount?: number;
  projectCount?: number;
  members?: FocusAreaCardMember[];
  href?: string;
}
