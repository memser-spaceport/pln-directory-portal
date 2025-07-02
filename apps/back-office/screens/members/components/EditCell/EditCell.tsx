import React from 'react';

import { Member } from '../../types/member';
import { EditMember } from '../EditMember/EditMember';

import s from './EditCell.module.scss';

export const EditCell = ({ member }: { member: Member }) => {
  return (
    <div className={s.root}>
      <EditMember className={s.btn} />
    </div>
  );
};

export default EditCell;
