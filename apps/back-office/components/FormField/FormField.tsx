import React from 'react';
import { clsx } from 'clsx';
import { useFormContext } from 'react-hook-form';

import s from './FormField.module.scss';
import { get } from 'lodash';

interface Props {
  name: string;
  placeholder: string;
  label: string;
  description?: string;
  isRequired?: boolean;
}

export const FormField = ({ name, placeholder, label, description, isRequired }: Props) => {
  const {
    register,
    formState: { errors },
  } = useFormContext();

  return (
    <div className={s.field}>
      <div
        className={clsx(s.label, {
          [s.required]: isRequired,
        })}
      >
        {label}
      </div>
      <input
        {...register(name)}
        placeholder={placeholder}
        className={clsx(s.input, {
          [s.error]: !!get(errors, name, null),
        })}
      />
      {!get(errors, name, null) && description ? (
        <div className={s.fieldDescription}>{description}</div>
      ) : (
        <div className={s.errorMsg}>{(get(errors, name, null)?.message as string) ?? ''}</div>
      )}
    </div>
  );
};
