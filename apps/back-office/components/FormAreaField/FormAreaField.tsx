import React from 'react';
import { clsx } from 'clsx';
import { useFormContext } from 'react-hook-form';

import s from './FormAreaField.module.scss';

interface Props {
  name: string;
  placeholder: string;
  label: string;
  description?: string;
}

export const FormAreaField = ({ name, placeholder, label, description }: Props) => {
  const {
    register,
    formState: { errors },
  } = useFormContext();

  return (
    <div className={s.field}>
      <div className={s.label}>{label}</div>
      <textarea
        {...register(name)}
        placeholder={placeholder}
        className={clsx(s.input, {
          [s.error]: !!errors[name],
        })}
      />
      {!errors[name] && description ? (
        <div className={s.fieldDescription}>{description}</div>
      ) : (
        <div className={s.errorMsg}>{(errors?.[name]?.message as string) ?? ''}</div>
      )}
    </div>
  );
};
