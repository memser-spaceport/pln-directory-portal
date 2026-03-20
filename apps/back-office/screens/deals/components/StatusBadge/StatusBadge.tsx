import React from 'react';
import { DealStatus } from '../../types/deal';
import s from './StatusBadge.module.scss';
import clsx from 'clsx';

interface Props {
  status: DealStatus;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  DEACTIVATED: 'Deactivated',
};

export const StatusBadge = ({ status }: Props) => {
  return (
    <span
      className={clsx(s.badge, {
        [s.draft]: status === 'DRAFT',
        [s.active]: status === 'ACTIVE',
        [s.deactivated]: status === 'DEACTIVATED',
      })}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
};

export default StatusBadge;
