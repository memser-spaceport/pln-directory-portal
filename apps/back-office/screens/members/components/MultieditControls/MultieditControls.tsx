import React, { useState } from 'react';

import s from './MultieditControls.module.scss';
import clsx from 'clsx';
import Select from 'react-select';
import { Level0Icon, Level1Icon, Level2Icon } from '../icons';
import { useUpdateMembersStatus } from '../../../../hooks/members/useUpdateMembersStatus';
import { toast } from 'react-toastify';
import { useToggle } from 'react-use';
import { ConfirmDialog } from '../ConfirmDialog';

interface Props {
  ids: string[];
  onReset: () => void;
  authToken: string;
}

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

export const MultieditControls = ({ ids, onReset, authToken }: Props) => {
  const [_value, setValue] = React.useState<any>([]);
  const [openConfirm, toggleConfirm] = useToggle(false);
  const [sendRejectEmail, setSendRejectEmail] = useState(false);

  const { mutateAsync, isPending } = useUpdateMembersStatus();

  const handleSubmit = async () => {
    toggleConfirm(false);
    setSendRejectEmail(false);
    const res = await mutateAsync({
      authToken,
      memberUids: ids,
      accessLevel: _value.value,
      sendRejectEmail,
    });

    if (res.status === 200) {
      onReset();
      toast.success(`Successfully updated access level.`);
    } else {
      toast.error(`Failed to update access level. Please try again later.`);
    }
  };

  return (
    <>
      <div
        className={clsx(s.root, {
          [s.visible]: ids.length > 0,
        })}
      >
        <button type="button" className={s.btn} disabled={false} onClick={onReset}>
          <CloseIcon />
        </button>
        <div className={s.message}>
          Apply status to -{' '}
          <span className={s.accent}>
            {ids.length} Member{ids.length > 1 ? 's' : ''}
          </span>
        </div>
        <Select
          menuPlacement="top"
          options={options}
          isClearable={false}
          value={_value}
          onChange={(val) => {
            setValue(val);
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
        <div className={s.right}>
          <button
            type="button"
            className={s.primaryBtn}
            disabled={false}
            onClick={() => {
              if (_value.value === 'Rejected') {
                toggleConfirm();
              } else {
                handleSubmit();
              }
            }}
          >
            {isPending ? 'Processing...' : 'Save'}
          </button>
        </div>
      </div>
      {openConfirm && (
        <ConfirmDialog
          title="Warning"
          desc="Are you sure you want to change access level of selected users to Rejected? This operation can be reverted later on."
          onClose={() => {
            toggleConfirm(false);
            setSendRejectEmail(false);
          }}
          onSubmit={handleSubmit}
          checkboxLabel="Send email"
          checkboxChecked={sendRejectEmail}
          onCheckboxChange={setSendRejectEmail}
        />
      )}
    </>
  );
};

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M16.2868 14.9617C16.4629 15.1379 16.5618 15.3767 16.5618 15.6258C16.5618 15.8749 16.4629 16.1137 16.2868 16.2899C16.1107 16.466 15.8718 16.5649 15.6227 16.5649C15.3736 16.5649 15.1348 16.466 14.9587 16.2899L9.9985 11.3281L5.03678 16.2883C4.86066 16.4644 4.62179 16.5634 4.37272 16.5634C4.12365 16.5634 3.88478 16.4644 3.70866 16.2883C3.53254 16.1122 3.43359 15.8733 3.43359 15.6242C3.43359 15.3752 3.53254 15.1363 3.70866 14.9602L8.67038 10L3.71022 5.0383C3.5341 4.86218 3.43516 4.62331 3.43516 4.37423C3.43516 4.12516 3.5341 3.88629 3.71022 3.71017C3.88634 3.53405 4.12521 3.43511 4.37428 3.43511C4.62335 3.43511 4.86222 3.53405 5.03834 3.71017L9.9985 8.67189L14.9602 3.70939C15.1363 3.53327 15.3752 3.43433 15.6243 3.43433C15.8734 3.43433 16.1122 3.53327 16.2883 3.70939C16.4645 3.88551 16.5634 4.12438 16.5634 4.37345C16.5634 4.62252 16.4645 4.86139 16.2883 5.03751L11.3266 10L16.2868 14.9617Z"
      fill="#455468"
    />
  </svg>
);

const SaveIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M10 6H3.33333V3.33333H10M8 12.6667C7.46957 12.6667 6.96086 12.456 6.58579 12.0809C6.21071 11.7058 6 11.1971 6 10.6667C6 10.1362 6.21071 9.62753 6.58579 9.25245C6.96086 8.87738 7.46957 8.66667 8 8.66667C8.53043 8.66667 9.03914 8.87738 9.41421 9.25245C9.78929 9.62753 10 10.1362 10 10.6667C10 11.1971 9.78929 11.7058 9.41421 12.0809C9.03914 12.456 8.53043 12.6667 8 12.6667ZM11.3333 2H3.33333C2.97971 2 2.64057 2.14048 2.39052 2.39052C2.14048 2.64057 2 2.97971 2 3.33333V12.6667C2 13.0203 2.14048 13.3594 2.39052 13.6095C2.64057 13.8595 2.97971 14 3.33333 14H12.6667C13.0203 14 13.3594 13.8595 13.6095 13.6095C13.8595 13.3594 14 13.0203 14 12.6667V4.66667L11.3333 2Z"
      fill="#64748B"
    />
  </svg>
);
