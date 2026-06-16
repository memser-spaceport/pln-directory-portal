import React from 'react';

import { Member } from '../../../../../../types/member';
import s from './DateCell.module.scss';

interface Props {
  member: Member;
}

export function DateCell({ member }: Props) {
  const dateObj = member.accessLevelUpdatedAt ? new Date(member.accessLevelUpdatedAt) : null;
  if (!dateObj) return <span className={s.muted}>—</span>;
  const dateLine = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeLine = dateObj
    .toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
    .toLowerCase();
  return (
    <div className={s.dateCell}>
      <span className={s.dateLine}>{dateLine}</span>
      <span className={s.timeLine}>{timeLine}</span>
    </div>
  );
}
