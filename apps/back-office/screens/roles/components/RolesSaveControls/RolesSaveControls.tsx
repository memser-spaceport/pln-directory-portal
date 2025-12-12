import React from 'react';

import s from './RolesSaveControls.module.scss';
import clsx from 'clsx';

interface Props {
  memberCount: number;
  onReset: () => void;
  onSave: () => void;
  isSaving: boolean;
}

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M16.2868 14.9617C16.4629 15.1379 16.5618 15.3767 16.5618 15.6258C16.5618 15.8749 16.4629 16.1137 16.2868 16.2899C16.1107 16.466 15.8718 16.5649 15.6227 16.5649C15.3736 16.5649 15.1348 16.466 14.9587 16.2899L9.9985 11.3281L5.03678 16.2883C4.86066 16.4644 4.62179 16.5634 4.37272 16.5634C4.12365 16.5634 3.88478 16.4644 3.70866 16.2883C3.53254 16.1122 3.43359 15.8733 3.43359 15.6242C3.43359 15.3752 3.53254 15.1363 3.70866 14.9602L8.67038 10L3.71022 5.0383C3.5341 4.86218 3.43516 4.62331 3.43516 4.37423C3.43516 4.12516 3.5341 3.88629 3.71022 3.71017C3.88634 3.53405 4.12521 3.43511 4.37428 3.43511C4.62335 3.43511 4.86222 3.53405 5.03834 3.71017L9.9985 8.67189L14.9602 3.70939C15.1363 3.53327 15.3752 3.43433 15.6243 3.43433C15.8734 3.43433 16.1122 3.53327 16.2883 3.70939C16.4645 3.88551 16.5634 4.12438 16.5634 4.37345C16.5634 4.62252 16.4645 4.86139 16.2883 5.03751L11.3266 10L16.2868 14.9617Z"
      fill="#455468"
    />
  </svg>
);

export const RolesSaveControls = ({ memberCount, onReset, onSave, isSaving }: Props) => {
  return (
    <div
      className={clsx(s.root, {
        [s.visible]: memberCount > 0,
      })}
    >
      <button type="button" className={s.btn} onClick={onReset}>
        <CloseIcon />
      </button>
      <div className={s.message}>
        Changes to -{' '}
        <span className={s.accent}>
          {memberCount} Member{memberCount !== 1 ? 's' : ''}
        </span>
      </div>
      <div className={s.right}>
        <button type="button" className={s.primaryBtn} onClick={onSave} disabled={isSaving}>
          {isSaving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
};
