import type { ReactNode } from 'react';

export interface SidebarItem {
  id: string;
  label: string;
  href?: string;
  icon?: ReactNode;
  badge?: number | string;
  active?: boolean;
  children?: SidebarItem[];
}

export interface SidebarSection {
  title?: string;
  items: SidebarItem[];
}

export interface SidebarProps {
  open: boolean;
  onClose: () => void;
  sections?: SidebarSection[];
  header?: ReactNode;
  footer?: ReactNode;
  side?: 'left' | 'right';
  className?: string;
}
