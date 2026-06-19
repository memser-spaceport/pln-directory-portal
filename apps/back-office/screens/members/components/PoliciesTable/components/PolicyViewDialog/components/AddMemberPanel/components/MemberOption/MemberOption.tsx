import React from 'react';
import { components, OptionProps } from 'react-select';

import { MemberOptionType } from '../../types';

import s from './MemberOption.module.scss';

export function MemberOption(props: OptionProps<MemberOptionType, true>) {
  const { data } = props;

  return (
    <components.Option {...props}>
      <div className={s.row}>
        <div className={s.avatar}>
          {data.imageUrl ? (
            <img className={s.avatarImage} src={data.imageUrl} alt={data.label} />
          ) : (
            <span className={s.avatarPlaceholder}>{data.label.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div className={s.text}>
          <span className={s.name}>{data.label}</span>
          <span className={s.email}>{data.email}</span>
        </div>
      </div>
    </components.Option>
  );
}
