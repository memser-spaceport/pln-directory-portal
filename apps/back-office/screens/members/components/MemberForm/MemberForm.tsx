import React from 'react';

import s from './MemberForm.module.scss';

interface Props {
  onClose: () => void;
}

export const MemberForm = ({ onClose }: Props) => {
  return (
    <div className={s.modal}>
      <div className={s.modalContent}></div>
    </div>
  );
};
