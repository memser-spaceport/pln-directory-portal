import React from 'react';
import { Member } from '../../types/member';
import s from './GroupCell.module.scss';

export const GroupCell = ({ member }: { member: Member }) => {
  const groups = [...new Set(member.memberPolicies?.map((p) => p.group) ?? [])].filter(Boolean);
  if (!groups.length) return <span className={s.empty}>–</span>;
  return (
    <div className={s.root}>
      {groups.map((g) => (
        <span key={g} className={s.badge}>
          {g}
        </span>
      ))}
    </div>
  );
};

export default GroupCell;
