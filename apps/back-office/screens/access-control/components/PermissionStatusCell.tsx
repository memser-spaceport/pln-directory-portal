import React from 'react';
import s from './PermissionStatusCell.module.scss';

interface PermissionStatusCellProps {
  viaRoles: string[];
  isDirect: boolean;
  variant?: 'tags' | 'badges';
}

export const PermissionStatusCell = ({ viaRoles, isDirect, variant = 'badges' }: PermissionStatusCellProps) => {
  if (variant === 'tags') {
    return (
      <div className={s.root}>
        {viaRoles.length > 0 && (
          <div className={s.tagGroup}>
            {viaRoles.map((role, index) => (
              <span key={index} className={s.viaRoleTag}>
                {role}
              </span>
            ))}
          </div>
        )}
        {viaRoles.length === 0 && <span className={s.empty}>-</span>}
      </div>
    );
  }

  return (
    <div className={s.root}>
      <span className={isDirect ? s.directBadge : s.notDirectBadge}>
        {isDirect ? 'Yes' : 'No'}
      </span>
    </div>
  );
};

export default PermissionStatusCell;
