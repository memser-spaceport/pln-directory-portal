import React from 'react';

import { Member } from '../../types/member';

import s from './NewsCell.module.scss';
import { CheckIcon, EmptyIcon } from '../icons';

export const NewsCell = ({ member }: { member: Member }) => {
  return (
    <div className={s.root}>
      {member.isSubscribedToNewsletter ? (
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

export default NewsCell;
