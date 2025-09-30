import React, { useMemo, useState } from 'react';
import Select from 'react-select';
import { Member } from '../../types/member';

import s from './StatusCell.module.scss';
import { Level0Icon, Level1Icon, Level2Icon } from '../icons';
import { useUpdateMembersStatus } from '../../../../hooks/members/useUpdateMembersStatus';
import { format } from 'date-fns';
import { ConfirmDialog } from '../ConfirmDialog';
import { useToggle } from 'react-use';
import { toast } from 'react-toastify';

const options = [
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
    desc: '- Approved – Mission Aligned',
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
    desc: '- Investor + Other Role',
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

export const StatusCell = ({ member, authToken }: { member: Member; authToken: string }) => {
  const [val, setVal] = useState(null);
  const _value = useMemo(() => {
    const val = options.find((option) => option.value === member.accessLevel);

    if (val) {
      return [
        {
          ...val,
          updatedAt: member.accessLevelUpdatedAt,
        },
      ];
    }
  }, [member.accessLevel, member.accessLevelUpdatedAt]);

  const { mutateAsync } = useUpdateMembersStatus();

  const handleSubmit = async (val) => {
    setVal(null);
    const res = await mutateAsync({
      authToken,
      memberUids: [member.uid],
      accessLevel: val.value,
    });

    if (res.status === 200) {
      toast.success(`Successfully updated access level for ${member.name} to ${val.name}`);
    } else {
      toast.error(`Failed to update access level for ${member.name}`);
    }
  };

  return (
    <div className={s.root}>
      <Select
        options={options}
        isClearable={false}
        value={_value}
        onChange={(val) => {
          if (val.value === 'Rejected') {
            setVal(val);
          } else {
            handleSubmit(val);
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
                      {selected.icon} <span className={s.name}>{selected.name}</span>{' '}
                      <span className={s.desc}>{selected.desc}</span>
                      <span className={s.desc}>{format(selected.updatedAt, 'dd/MM/yyyy, HH:mm')}</span>
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
      {!!val && (
        <ConfirmDialog
          title="Warning"
          desc="Are you sure you want to change access level of selected user to Rejected? This operation can be reverted later on."
          onClose={() => setVal(null)}
          onSubmit={() => handleSubmit(val)}
        />
      )}
    </div>
  );
};

export default StatusCell;
