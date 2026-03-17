import React from 'react';
import { DealStatus } from '../../types/deal';
import s from './StatusBadge.module.scss';
import clsx from 'clsx';

interface Props {
  status: DealStatus;
}

export const StatusBadge = ({ status }: Props) => {
  return (
    <span
      className={clsx(s.badge, {
        [s.draft]: status === 'Draft',
        [s.active]: status === 'Active',
        [s.deactivated]: status === 'Deactivated',
      })}
    >
      {status}
    </span>
  );
};

export default StatusBadge;
