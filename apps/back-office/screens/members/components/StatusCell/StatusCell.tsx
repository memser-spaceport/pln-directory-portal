import React from 'react';
import { Member } from '../../types/member';

import s from './StatusCell.module.scss';
import { Level0Icon, Level1Icon, Level2Icon, RejectedIcon } from '../icons';

export type PendingAccessLevelChange = {
  memberUid: string;
  memberState: string;
  sendRejectEmail?: boolean;
};

const stateMeta = {
  PENDING: { label: 'Pending', icon: <Level0Icon />, className: s.orange },
  VERIFIED: { label: 'Verified', icon: <Level1Icon />, className: s.blue },
  APPROVED: { label: 'Approved', icon: <Level2Icon />, className: s.green },
  REJECTED: { label: 'Rejected', icon: <RejectedIcon />, className: s.red },
} as const;

interface StatusCellProps {
  member: Member;
  authToken?: string;
}

export const StatusCell = ({ member }: StatusCellProps) => {
  const state = member.memberState ?? 'PENDING';
  const meta = stateMeta[state] ?? stateMeta.PENDING;

  return (
    <div className={s.root}>
      <div className={s.control}>
        <div className={s.optionRoot}>
          <span className={meta.className}>{meta.icon}</span>
          <span className={s.name}>{meta.label}</span>
        </div>
      </div>
    </div>
  );
};

export default StatusCell;
