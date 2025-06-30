import React from 'react';

import { Member } from '../../types/member';

import s from './LinkedinCell.module.scss';
import { EmptyIcon, ExternalLinkIcon } from '../icons';

export const LinkedinCell = ({ member }: { member: Member }) => {
  return (
    <div className={s.root}>
      {member.linkedinProfile?.url ? (
        <a className={s.badge} href={member.linkedinProfile.url} target="_blank" rel="noreferrer">
          <span>{member.linkedinProfile.name}</span>
          <span>
            <ExternalLinkIcon />
          </span>
        </a>
      ) : (
        <div className={s.empty}>
          <EmptyIcon />
        </div>
      )}
    </div>
  );
};

export default LinkedinCell;
