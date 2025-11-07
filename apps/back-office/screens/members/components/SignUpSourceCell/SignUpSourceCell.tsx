import React from 'react';

import { Member } from '../../types/member';

import s from './SignUpSourceCell.module.scss';

export const SignUpSourceCell = ({ member }: { member: Member }) => {
  return (
    <div className={s.root}>
      <span className={s.text}>{member.signUpSource || '-'}</span>
    </div>
  );
};

export default SignUpSourceCell;