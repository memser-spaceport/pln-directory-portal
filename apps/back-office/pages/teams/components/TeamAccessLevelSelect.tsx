import React from 'react';
import Select, { ControlProps, OptionProps, SingleValue } from 'react-select';
import s from './TeamAccessLevelSelect.module.scss';
import { Level0Icon, Level1Icon } from '../../../screens/members/components/icons';

interface OptionType {
  icon: JSX.Element;
  name: string;
  value: 'L0' | 'L1';
  desc: string;
}

const options: OptionType[] = [
  {
    icon: (
      <span className={s.orange}>
        <Level0Icon />
      </span>
    ),
    name: 'L0',
    value: 'L0',
    desc: '- Pending Verification ',
  },
  {
    icon: (
      <span className={s.blue}>
        <Level1Icon />
      </span>
    ),
    name: 'L1',
    value: 'L1',
    desc: '- Approved',
  },
];

interface Props {
  value: 'L0' | 'L1';
  onChange: (val: 'L0' | 'L1') => void;
  disabled?: boolean;
}

export const TeamAccessLevelSelect = ({ value, onChange, disabled }: Props) => {
  const selectedOption = options.find((o) => o.value === value) || options[0];

  return (
    <div style={{ width: '230px' }}>
      <Select
        options={options}
        isClearable={false}
        isDisabled={disabled}
        value={selectedOption}
        onChange={(val: SingleValue<OptionType>) => {
          if (val) {
            onChange(val.value);
          }
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
            cursor: 'pointer',
            opacity: disabled ? 0.6 : 1,
          }),
          valueContainer: (base) => ({
            ...base,
            padding: 0,
            margin: 0,
          }),
          input: (baseStyles) => ({
            ...baseStyles,
            height: '32px',
            padding: 0,
            opacity: 0,
            margin: 0,
          }),
          placeholder: (base) => ({
            ...base,
            width: 'fit-content',
            fontSize: '14px',
            color: '#455468A0',
          }),
          option: (baseStyles) => ({
            ...baseStyles,
            fontSize: '14px',
            fontWeight: 300,
            color: '#455468',
            cursor: 'pointer',
            '&:hover': {
              background: 'rgba(27, 56, 96, 0.12)',
            },
          }),
          menu: (baseStyles) => ({
            ...baseStyles,
            outline: 'none',
            zIndex: 3,
            width: 'max-content',
            minWidth: '100%',
          }),
          indicatorContainer: () => ({
            display: 'none',
          }),
          indicatorSeparator: () => ({
            display: 'none',
          }),
        }}
        components={{
          Control: ({ children, innerProps, innerRef, getValue }: ControlProps<OptionType, false>) => {
            const val = getValue();
            const selected = val.length > 0 ? val[0] : null;

            return (
              <div {...innerProps} ref={innerRef} className={s.control}>
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
          Option: (props: OptionProps<OptionType, false>) => {
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
    </div>
  );
};

export default TeamAccessLevelSelect;
