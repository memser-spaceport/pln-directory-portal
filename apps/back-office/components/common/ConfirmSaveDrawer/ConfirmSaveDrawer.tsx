import clsx from 'clsx';
import React from 'react';

import { CloseIcon } from './components/CloseIcon';

import s from './ConfirmSaveDrawer.module.scss';

interface Props {
  count: number;
  label: string;
  onReset: () => void;
  onSave: () => void;
  isSaving: boolean;
}

export const ConfirmSaveDrawer = (props: Props) => {
  const { count, label, onReset, onSave, isSaving } = props;

  return (
    <div
      className={clsx(s.root, {
        [s.visible]: count > 0,
      })}
    >
      <button type="button" className={s.btn} onClick={onReset}>
        <CloseIcon />
      </button>
      <div className={s.message}>
        Changes to -{' '}
        <span className={s.accent}>
          {count} {label}{count !== 1 ? 's' : ''}
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
