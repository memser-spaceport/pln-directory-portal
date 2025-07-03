import React from 'react';

import { Member } from '../../types/member';
import { EditMember } from '../EditMember/EditMember';

import s from './EditCell.module.scss';

export const EditCell = ({ member, authToken }: { member: Member; authToken: string }) => {
  return (
    <div className={s.root}>
      <EditMember className={s.btn} uid={member.uid} authToken={authToken} />
    </div>
  );
};

export default EditCell;
