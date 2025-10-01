import React from 'react';
import { useFormContext } from 'react-hook-form';
import { clsx } from 'clsx';
import { get } from 'lodash';

import s from './FormCheckboxField.module.scss';

interface Props {
  name: string;
  label: string;
  description?: string;
  isRequired?: boolean;
}

export const FormCheckboxField = ({ name, label, description, isRequired }: Props) => {
  const {
    register,
    formState: { errors },
    setValue,
    watch,
  } = useFormContext();

  const value = watch(name);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(name, e.target.checked, { shouldValidate: true, shouldDirty: true });
  };

  return (
    <div className={s.field}>
      <label
        className={clsx(s.label, s.checkboxLabel, {
          [s.required]: isRequired,
        })}
      >
        <input
          {...register(name)}
          type="checkbox"
          checked={value || false}
          onChange={handleChange}
          className={s.checkbox}
        />
        <span className={s.checkmark}></span>
        {label}
      </label>
      {!get(errors, name, null) && description ? (
        <div className={s.fieldDescription}>{description}</div>
      ) : (
        <div className={s.errorMsg}>{(get(errors, name, null)?.message as string) ?? ''}</div>
      )}
    </div>
  );
};
