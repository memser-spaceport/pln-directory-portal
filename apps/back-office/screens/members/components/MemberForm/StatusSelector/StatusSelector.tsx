import React, { useMemo } from 'react';
import Select from 'react-select';
import { Level0Icon, Level1Icon, Level2Icon } from '../../icons';
import { useFormContext } from 'react-hook-form';
import { TMemberForm } from '../../../types/member';
import s from './StatusSelector.module.scss';
import { clsx } from 'clsx';

export const options = [
  {
    icon: (
      <span className={s.orange}>
        <Level0Icon />
      </span>
    ),
    name: 'L0',
    value: 'L0',
    desc: '- Pending Account Verification',
  },
  {
    icon: (
      <span className={s.blue}>
        <Level1Icon />
      </span>
    ),
    name: 'L1',
    value: 'L1',
    desc: '- Verified via LinkedIn',
  },
  {
    icon: (
      <span className={s.green}>
        <Level2Icon />
      </span>
    ),
    name: 'L2',
    value: 'L2',
    desc: '- Approved - Pending Missing Alignment Check',
  },
  {
    icon: (
      <span className={s.green}>
        <Level2Icon />
      </span>
    ),
    name: 'L3',
    value: 'L3',
    desc: '- Approved - Mission Aligned',
  },
  {
    icon: (
      <span className={s.green}>
        <Level2Icon />
      </span>
    ),
    name: 'L4',
    value: 'L4',
    desc: '- Approved - Portco or CC (Close Contributor)',
  },
  {
    icon: (
      <span className={s.purple}>
        <Level2Icon />
      </span>
    ),
    name: 'L5',
    value: 'L5',
    desc: '- Investor Only',
  },
  {
    icon: (
      <span className={s.purple}>
        <Level2Icon />
      </span>
    ),
    name: 'L6',
    value: 'L6',
    desc: '- Investor and Member',
  },
  {
    icon: (
      <span className={s.red}>
        <Level2Icon />
      </span>
    ),
    name: 'Rejected',
    value: 'Rejected',
    desc: '- Access Denied',
  },
];

export const StatusSelector = ({ isAddNew }: { isAddNew: boolean }) => {
  const {
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<TMemberForm>();
  const { accessLevel } = watch();

  const _options = useMemo(() => {
    if (!isAddNew) {
      return options;
    }

    return options.filter((option) => option.value !== 'L0' && option.value !== 'L1' && option.value !== 'Rejected');
  }, [isAddNew]);

  return (
    <div className={s.field}>
      <div className={clsx(s.label, s.required)}>Select Status</div>
      <Select
        menuPlacement="bottom"
        options={_options}
        isClearable={false}
        value={accessLevel}
        onChange={(val) => {
          setValue('accessLevel', val, { shouldValidate: true, shouldDirty: true });
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
            border: '1px solid rgba(203, 213, 225, 0.50)',
            background: '#fff',
            outline: 'none',
            fontSize: '14px',
            minWidth: '140px',
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
          input: (baseStyles) => ({
            ...baseStyles,
            height: '32px',
            padding: 0,
            opacity: 0,
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
          indicatorContainer: (base) => ({
            display: 'none',
          }),
          indicatorSeparator: (base) => ({
            display: 'none',
          }),
        }}
        components={{
          Control: ({ children, innerProps, innerRef, getValue }) => {
            const val = getValue();
            const selected = val.length > 0 ? val[0] : null;

            return (
              <div
                {...innerProps}
                ref={innerRef}
                className={clsx(s.control, {
                  [s.error]: errors?.accessLevel?.message,
                })}
              >
                {selected ? (
                  <>
                    <div className={s.optionRoot}>
                      {selected.icon} <span className={s.name}>{selected.name}</span>{' '}
                      <span className={s.desc}>{selected.desc}</span>
                    </div>
                    <div className={s.childrenWrapper}>{children}</div>
                  </>
                ) : (
                  children
                )}
              </div>
            );
          },
          Option: (props) => {
            return (
              <div
                className={s.optionRoot}
                onClick={() => {
                  props.selectOption(props.data);
                }}
              >
                {props.data.icon} <span className={s.name}>{props.data.name}</span>{' '}
                <span className={s.desc}>{props.data.desc}</span>
              </div>
            );
          },
        }}
      />
      <div className={s.errorMsg}>{(errors?.accessLevel?.message as string) ?? ''}</div>
    </div>
  );
};
