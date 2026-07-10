import type { ReactNode } from 'react';

export interface BottomNavItem {
  id: string;
  label: string;
  href?: string;
  icon: ReactNode;
  activeIcon?: ReactNode;
  badge?: number;
  active?: boolean;
  onClick?: () => void;
}

export interface BottomNavProps {
  items: BottomNavItem[];
  className?: string;
}
