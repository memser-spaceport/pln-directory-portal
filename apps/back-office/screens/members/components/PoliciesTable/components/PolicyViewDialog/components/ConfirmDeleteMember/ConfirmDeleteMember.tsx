import React from 'react';

import { Member } from '../../../../../../types/member';
import s from './ConfirmDeleteMember.module.scss';

interface Props {
  member: Member;
  isLoading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDeleteMember({ member, isLoading, onConfirm, onCancel }: Props) {
  return (
    <div className={s.overlay}>
      <div className={s.dialog}>
        <p className={s.text}>
          Remove <strong>{member.name}</strong> from this policy?
        </p>
        <div className={s.actions}>
          <button
            type="button"
            className={s.cancelBtn}
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="button"
            className={s.removeBtn}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Removing...' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  );
}
