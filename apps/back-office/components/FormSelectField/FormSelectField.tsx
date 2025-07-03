import React from 'react';
import { useFormContext } from 'react-hook-form';

import s from './FormSelectField.module.scss';
import Select from 'react-select';
import { get } from 'lodash';

interface Props {
  name: string;
  placeholder: string;
  label: string;
  description?: string;
  options: {
    label: string;
    value: string;
  }[];
}

export const FormSelectField = ({ name, placeholder, label, description, options }: Props) => {
  const {
    formState: { errors },
    setValue,
    watch,
  } = useFormContext();
  const values = watch();
  const val = get(values, name, null);

  return (
    <div className={s.field}>
      <div className={s.label}>{label}</div>
      <Select
        menuPlacement="auto"
        options={options}
        filterOption={() => true}
        isClearable={false}
        placeholder={placeholder}
        value={val}
        onChange={(val) => {
          setValue(name, val, { shouldValidate: true, shouldDirty: true });
        }}
        styles={{
          container: (base) => ({
            ...base,
            width: '100%',
          }),
          control: (baseStyles) => ({
            ...baseStyles,
            alignItems: 'center',
            gap: '8px',
            alignSelf: 'stretch',
            borderRadius: '8px',
            borderWidth: '1px',
            background: '#fff',
            outline: 'none',
            fontSize: '14px',
            minWidth: '140px',
            width: '100%',
            borderColor: get(errors, name, null) ? 'darkred' : 'rgba(203, 213, 225, 0.50) !important',
            position: 'relative',
            boxShadow: 'none !important',
            '&:hover': {
              border: '1px solid #5E718D',
              boxShadow: '0 0 0 4px rgba(27, 56, 96, 0.12) !important',
              borderColor: '#5E718D !important',
            },
            '&:focus-visible, &:focus': {
              borderColor: '#5E718D !important',
              boxShadow: '0 0 0 4px rgba(27, 56, 96, 0.12) !important',
            },
          }),
          input: (baseStyles) => ({
            ...baseStyles,
            height: '32px',
            fontSize: '14px',
            padding: 0,
            // background: 'tomato',
          }),
          placeholder: (base) => ({
            ...base,
            // border: '1px solid red',
            width: 'fit-content',
            fontSize: '14px',
            color: '#455468A0',
          }),
          option: (baseStyles) => ({
            ...baseStyles,
            fontSize: '14px',
            fontWeight: 300,
            color: '#455468',
            '&:hover': {
              background: 'rgba(27, 56, 96, 0.12)',
            },
          }),
          menu: (baseStyles) => ({
            ...baseStyles,
            outline: 'none',
            zIndex: 3,
          }),
          multiValueRemove: (base) => ({
            ...base,
            height: '100%',
            cursor: 'pointer',
            '&:hover': {
              background: 'transparent',
            },
          }),
          multiValue: (base) => ({
            ...base,
            marginBlock: 0,
            display: 'flex',
            padding: 'var(--spacing-4xs, 4px) var(--spacing-3xs, 6px)',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 'var(--spacing-5xs, 2px)',
            borderRadius: 'var(--corner-radius-sm, 6px)',
            border: '1px solid var(--border-neutral-subtle, rgba(27, 56, 96, 0.12))',
            background: 'var(--background-base-white, #FFF)',
            boxShadow: '0px 1px 2px 0px var(--transparent-dark-6, rgba(14, 15, 17, 0.06))',
          }),
          multiValueLabel: (base) => ({
            ...base,
            fontSize: '14px',
            color: '#455468',
            fontWeight: 300,
            fontStyle: 'normal',
            letterSpacing: '-0.2px',
          }),
          indicatorSeparator: (base) => ({
            display: 'none',
          }),
        }}
      />
      {!get(errors, name, null) && description ? (
        <div className={s.fieldDescription}>{description}</div>
      ) : (
        <div className={s.errorMsg}>{(get(errors, name, null)?.message as string) ?? ''}</div>
      )}
    </div>
  );
};
