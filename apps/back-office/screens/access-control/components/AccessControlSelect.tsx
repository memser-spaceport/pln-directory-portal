import React, { useMemo } from 'react';
import Select from 'react-select';
import clsx from 'clsx';

import s from '../../members/components/MemberForm/StatusSelector/StatusSelector.module.scss';

export type AccessControlSelectOption = {
  value: string;
  name: string;
  desc?: string;
};

const selectStyles = {
  container: (base: Record<string, unknown>) => ({
    ...base,
    width: '100%',
  }),
  control: (baseStyles: Record<string, unknown>) => ({
    ...baseStyles,
    alignItems: 'center',
    gap: '8px',
    alignSelf: 'stretch',
    borderRadius: '8px',
    border: '1px solid rgba(203, 213, 225, 0.50)',
    background: '#fff',
    outline: 'none',
    fontSize: '14px',
    minWidth: '100%',
    width: '100%',
    borderColor: 'rgba(203, 213, 225, 0.50) !important',
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
  input: (baseStyles: Record<string, unknown>) => ({
    ...baseStyles,
    height: '32px',
    padding: 0,
    opacity: 0,
  }),
  placeholder: (base: Record<string, unknown>) => ({
    ...base,
    width: 'fit-content',
    fontSize: '14px',
    color: '#455468A0',
  }),
  option: (baseStyles: Record<string, unknown>) => ({
    ...baseStyles,
    fontSize: '14px',
    fontWeight: 300,
    color: '#455468',
    '&:hover': {
      background: 'rgba(27, 56, 96, 0.12)',
    },
  }),
  menu: (baseStyles: Record<string, unknown>) => ({
    ...baseStyles,
    outline: 'none',
    zIndex: 100,
  }),
  menuPortal: (base: Record<string, unknown>) => ({
    ...base,
    zIndex: 100,
  }),
  indicatorContainer: (base: Record<string, unknown>) => ({
    ...base,
    display: 'none',
  }),
  indicatorSeparator: (base: Record<string, unknown>) => ({
    ...base,
    display: 'none',
  }),
};

type Props = {
  id?: string;
  label: string;
  required?: boolean;
  placeholder: string;
  options: AccessControlSelectOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function AccessControlSelect({
  id,
  label,
  required,
  placeholder,
  options,
  value,
  onChange,
  disabled,
}: Props) {
  const selectOptions = useMemo(() => options, [options]);

  const selected = useMemo(
    () => selectOptions.find((o) => o.value === value) ?? null,
    [selectOptions, value]
  );

  return (
    <div className={clsx(s.field, 'w-full min-w-[400px]')}>
      <label htmlFor={id} className={clsx(s.label, required && s.required)}>
        {label}
      </label>
      <Select<AccessControlSelectOption, false>
        inputId={id}
        menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
        menuPosition="fixed"
        menuPlacement="bottom"
        options={selectOptions}
        isClearable={false}
        placeholder={placeholder}
        value={selected}
        onChange={(opt) => onChange(opt?.value ?? '')}
        isDisabled={disabled}
        getOptionValue={(o) => o.value}
        styles={selectStyles}
        components={{
          Control: ({ children, innerProps, innerRef, getValue }) => {
            const val = getValue();
            const sel = val.length > 0 ? val[0] : null;

            return (
              <div {...innerProps} ref={innerRef} className={s.control}>
                {sel ? (
                  <>
                    <div className={s.optionRoot}>
                      <span className={s.name}>{sel.name}</span>
                      {sel.desc ? <span className={s.desc}>{sel.desc}</span> : null}
                    </div>
                    <div className={s.childrenWrapper}>{children}</div>
                  </>
                ) : (
                  children
                )}
              </div>
            );
          },
          Option: (props) => (
            <div
              className={s.optionRoot}
              onClick={() => {
                props.selectOption(props.data);
              }}
            >
              <span className={s.name}>{props.data.name}</span>
              {props.data.desc ? <span className={s.desc}>{props.data.desc}</span> : null}
            </div>
          ),
        }}
      />
    </div>
  );
}
