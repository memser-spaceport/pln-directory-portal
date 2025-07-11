import React from 'react';
import Select from 'react-select';

import s from './StatusFilter.module.scss';
import { Level2Icon } from '../icons';
import { ColumnFiltersState } from '@tanstack/react-table';

const options = [
  {
    // icon: <span className={s.orange}></span>,
    name: 'All',
    value: '',
  },
  {
    // icon: (
    //   <span className={s.green}>
    //     <Level2Icon />
    //   </span>
    // ),
    name: 'L2',
    value: 'L2',
  },
  {
    // icon: (
    //   <span className={s.green}>
    //     <Level2Icon />
    //   </span>
    // ),
    name: 'L3',
    value: 'L3',
  },
  {
    // icon: (
    //   <span className={s.green}>
    //     <Level2Icon />
    //   </span>
    // ),
    name: 'L4',
    value: 'L4',
  },
];

export const StatusFilter = ({ onSelect, value }: { onSelect: (v: string) => void; value: ColumnFiltersState }) => {
  console.log(value);
  const _value = options.find((option) => option.value === value?.[0]?.value);

  return (
    <div className={s.root}>
      <Select
        menuPortalTarget={document.body}
        options={options}
        isClearable={false}
        value={_value ?? options[0]}
        onChange={(val) => {
          onSelect(val.value);
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
              <div {...innerProps} ref={innerRef} className={s.control}>
                {selected ? (
                  <>
                    <div className={s.optionRoot}>
                      <span className={s.name}>{selected.name}</span>{' '}
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
                <span className={s.name}>{props.data.name}</span>{' '}
              </div>
            );
          },
        }}
      />
    </div>
  );
};
