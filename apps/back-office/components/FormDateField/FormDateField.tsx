import React from 'react';
import { clsx } from 'clsx';
import { useFormContext } from 'react-hook-form';

import s from './FormDateField.module.scss';
import DatePicker from 'react-datepicker';

interface Props {
  name: string;
  label: string;
  description?: string;
}

export const FormDateField = ({ name, label, description }: Props) => {
  const {
    watch,
    setValue,
    formState: { errors },
  } = useFormContext();
  const values = watch();

  return (
    <div className={s.field}>
      <div className={s.label}>{label}</div>
      <DatePicker
        selected={values[name]}
        onChange={(date) => setValue(name, date, { shouldValidate: true, shouldDirty: true })}
        className={clsx(s.input, {
          [s.error]: !!errors[name],
        })}
      />
      {/*<input*/}
      {/*  {...register(name)}*/}
      {/*  className={clsx(s.input, {*/}
      {/*    [s.error]: !!errors[name],*/}
      {/*  })}*/}
      {/*/>*/}
      {!errors[name] && description ? (
        <div className={s.fieldDescription}>{description}</div>
      ) : (
        <div className={s.errorMsg}>{(errors?.[name]?.message as string) ?? ''}</div>
      )}
    </div>
  );
};
