import React from 'react';
import AsyncSelectBase from 'react-select/async';
import { GroupBase, Props as SelectProps, StylesConfig } from 'react-select';

const defaultStyles: StylesConfig<any, true, any> = {
  control: (base, state) => ({
    ...base,
    borderRadius: 8,
    borderColor: state.isFocused ? '#6366f1' : '#e5e7eb',
    boxShadow: state.isFocused ? '0 0 0 3px rgba(99, 102, 241, 0.1)' : 'none',
    fontSize: 14,
    minHeight: 40,
    '&:hover': { borderColor: state.isFocused ? '#6366f1' : '#d1d5db' },
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isFocused ? '#f1f5f9' : '#fff',
    color: '#111827',
    padding: '8px 12px',
    cursor: 'pointer',
    '&:active': { backgroundColor: '#e0e7ff' },
  }),
  multiValue: (base) => ({
    ...base,
    borderRadius: 6,
    backgroundColor: '#eff6ff',
  }),
  multiValueLabel: (base) => ({
    ...base,
    color: '#1e40af',
    fontSize: 13,
    fontWeight: 500,
  }),
  multiValueRemove: (base) => ({
    ...base,
    color: '#3b82f6',
    '&:hover': { backgroundColor: '#dbeafe', color: '#1d4ed8' },
  }),
  placeholder: (base) => ({
    ...base,
    color: '#9ca3af',
    fontSize: 14,
  }),
  menu: (base) => ({
    ...base,
    borderRadius: 10,
    boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
    border: '1px solid #e5e7eb',
    zIndex: 20,
  }),
  noOptionsMessage: (base) => ({
    ...base,
    fontSize: 13,
    color: '#9ca3af',
  }),
};

type AsyncMultiSelectProps<Option, Group extends GroupBase<Option> = GroupBase<Option>> = Omit<
  SelectProps<Option, true, Group>,
  'isMulti'
> & {
  loadOptions: (inputValue: string) => Promise<Option[]>;
};

export function AsyncMultiSelect<Option, Group extends GroupBase<Option> = GroupBase<Option>>({
  styles,
  ...props
}: AsyncMultiSelectProps<Option, Group>) {
  const mergedStyles = styles
    ? Object.keys({ ...defaultStyles, ...styles }).reduce((acc, key) => {
        const k = key as keyof StylesConfig<Option, true, Group>;
        const defaultFn = (defaultStyles as any)[k];
        const overrideFn = (styles as any)[k];
        if (defaultFn && overrideFn) {
          (acc as any)[k] = (base: any, state: any) => overrideFn(defaultFn(base, state), state);
        } else {
          (acc as any)[k] = overrideFn || defaultFn;
        }
        return acc;
      }, {} as StylesConfig<Option, true, Group>)
    : (defaultStyles as StylesConfig<Option, true, Group>);

  return <AsyncSelectBase<Option, true, Group> isMulti cacheOptions styles={mergedStyles} {...props} />;
}
