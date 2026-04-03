import React from 'react';
import { RoleBasic } from '../types';
import s from './RoleTagsCell.module.scss';

interface RoleTagsCellProps {
  roles: RoleBasic[];
  maxDisplay?: number;
}

export const RoleTagsCell = ({ roles, maxDisplay = 3 }: RoleTagsCellProps) => {
  if (!roles || roles.length === 0) {
    return <span className={s.empty}>-</span>;
  }

  const displayRoles = roles.slice(0, maxDisplay);
  const remaining = roles.length - maxDisplay;

  return (
    <div className={s.root}>
      {displayRoles.map((role) => (
        <span key={role.code} className={s.tag}>
          {role.name}
        </span>
      ))}
      {remaining > 0 && (
        <span className={s.overflowTag}>+{remaining}</span>
      )}
    </div>
  );
};

export default RoleTagsCell;
