import React from 'react';
import {
  CalendarStarIcon,
  CircleCheckIcon,
  LoaderIcon,
  OutlineStarIcon,
  RocketIcon,
  ShieldCheckIcon,
  TrendUpIcon,
} from './icons';

export type RoleIcon = React.FC<{ className?: string }>;

export const ROLE_ICON_MAP: Record<string, RoleIcon> = {
  'Directory Admin': ShieldCheckIcon,
  'Infra Team': CircleCheckIcon,
  'Demo Day Admin': CalendarStarIcon,
  'Demo Day Stakeholder': CalendarStarIcon,
  Founder: RocketIcon,
  Investor: TrendUpIcon,
  Unassigned: LoaderIcon,
  Advisor: OutlineStarIcon,
};

export const FALLBACK_ICON: RoleIcon = ShieldCheckIcon;

export function iconForRole(role: string): RoleIcon {
  return ROLE_ICON_MAP[role] ?? FALLBACK_ICON;
}
