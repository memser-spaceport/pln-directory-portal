import React from 'react';

import { Member } from '../../types/member';

import s from './EditCell.module.scss';
import { CheckIcon, EditIcon, EmptyIcon } from '../icons';

export const EditCell = ({ member }: { member: Member }) => {
  return (
    <div className={s.root}>
      <button className={s.btn}>
        <EditIcon /> Edit
      </button>
    </div>
  );
};

export default EditCell;
