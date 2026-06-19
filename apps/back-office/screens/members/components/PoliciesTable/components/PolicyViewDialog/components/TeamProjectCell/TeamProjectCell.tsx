import React from 'react';

import { Member } from '../../../../../../types/member';
import { TeamIcon, ProjectIcon } from '../Icons';
import s from './TeamProjectCell.module.scss';

interface Props {
  member: Member;
}

export function TeamProjectCell({ member }: Props) {
  const items = [
    ...(member.teamMemberRoles ?? []).map((t) => ({ icon: <TeamIcon />, label: t.team.name })),
    ...member.projectContributions.map((c) => ({ icon: <ProjectIcon />, label: c.project.name })),
  ];
  if (!items.length) return <span className={s.muted}>—</span>;
  const visible = items.slice(0, 2);
  const overflow = items.length - 2;
  return (
    <div className={s.teamList}>
      {visible.map((item, i) => (
        <span key={i} className={s.teamBadge}>
          {item.icon}
          {item.label}
        </span>
      ))}
      {overflow > 0 && <span className={s.teamOverflow}>+{overflow}</span>}
    </div>
  );
}
