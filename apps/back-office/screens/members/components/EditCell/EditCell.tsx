import React from 'react';

import { Member } from '../../types/member';
import { EditMember } from '../EditMember/EditMember';

import s from './EditCell.module.scss';

export const EditCell = ({ member, authToken, showRbacSection }: { member: Member; authToken: string; showRbacSection?: boolean }) => {
  return (
    <div className={s.root}>
      <EditMember className={s.btn} member={member} authToken={authToken} showRbacSection={showRbacSection} />
    </div>
  );
};

export default EditCell;
