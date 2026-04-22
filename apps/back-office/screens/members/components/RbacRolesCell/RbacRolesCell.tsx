import React from 'react';
import { Member } from '../../types/member';
import s from './RbacRolesCell.module.scss';

export const RbacRolesCell = ({ member }: { member: Member }) => {
  const roles = member.rbacRoles;
  if (!roles?.length) return <span className={s.empty}>–</span>;
  return (
    <div className={s.root}>
      {roles.map((role) => (
        <span key={role.uid} className={s.role}>
          {role.name}
        </span>
      ))}
    </div>
  );
};

export default RbacRolesCell;
