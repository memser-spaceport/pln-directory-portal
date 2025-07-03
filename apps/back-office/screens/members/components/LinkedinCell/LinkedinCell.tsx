import React from 'react';

import { Member } from '../../types/member';

import s from './LinkedinCell.module.scss';
import { CheckIcon, EmptyIcon, ExternalLinkIcon } from '../icons';

export const LinkedinCell = ({ member }: { member: Member }) => {
  return (
    <div className={s.root}>
      {member.linkedinProfile?.uid ? (
        <div className={s.badge}>
          <CheckIcon />
        </div>
      ) : (
        <div className={s.empty}>
          <EmptyIcon />
        </div>
      )}
    </div>
  );
};

export default LinkedinCell;
