import React from 'react';

import { Member } from '../../../../../../types/member';
import s from './MemberNameCell.module.scss';

interface Props {
  member: Member;
}

export function MemberNameCell({ member }: Props) {
  return (
    <div className={s.memberNameCell}>
      <div className={s.avatar}>
        {member.image?.url ? (
          <img src={member.image.url} alt={member.name} />
        ) : (
          <div className={s.avatarPlaceholder}>{member.name.charAt(0)}</div>
        )}
      </div>
      <div className={s.memberText}>
        <span className={s.memberName}>{member.name}</span>
        <span className={s.memberEmail}>{member.email}</span>
      </div>
    </div>
  );
}
