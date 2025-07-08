import React from 'react';

import s from './MemberCell.module.scss';
import { Member } from '../../types/member';
import { ExternalLinkIcon } from '../icons';
import { WEB_UI_BASE_URL } from '../../../../utils/constants';

export const MemberCell = ({ member }: { member: Member }) => {
  return (
    <div className={s.root}>
      <div className={s.avatar}>
        {member.image ? (
          <img src={member.image.url} alt={member.name} />
        ) : (
          <div className={s.placeholder}>{member.name.charAt(0)}</div>
        )}
      </div>
      <div className={s.content}>
        <div className={s.primaryLabel}>{member.name}</div>
        <div className={s.secondaryLabel}>{member.email}</div>
      </div>
      <div className={s.link}>
        <a href={`${WEB_UI_BASE_URL}/members/${member.uid}`} target="_blank" rel="noreferrer">
          <ExternalLinkIcon />
        </a>
      </div>
    </div>
  );
};

export default MemberCell;
