import React, { useEffect, useMemo, useState } from 'react';
import Select from 'react-select';
import { useCookie } from 'react-use';
import { toast } from 'react-toastify';

import { Member } from '../../types/member';
import { useUpdateMemberRoles } from '../../../../hooks/members/useUpdateMemberRoles';

import s from '../StatusCell/StatusCell.module.scss';

type AdminRoleOptionValue = 'NONE' | 'DIRECTORYADMIN' | 'DEMO_DAY_ADMIN';

type AdminRoleOption = {
  name: string;
  value: AdminRoleOptionValue;
  desc: string;
};

const adminRoleOptions: AdminRoleOption[] = [
  {
    name: 'None',
    value: 'NONE',
    desc: '- No admin role assigned',
  },
  {
    name: 'Directory admin',
    value: 'DIRECTORYADMIN',
    desc: '- Full directory admin permissions',
  },
  {
    name: 'Demo day admin',
    value: 'DEMO_DAY_ADMIN',
    desc: '- Can manage demo days and hosts',
  },
];

/**
 * Inline admin role selector.
 * Styled and behaves similar to StatusCell (access level select).
 */
const RoleCell = ({ member }: { member: Member }) => {
  const [plnadmin] = useCookie('plnadmin');
  const { mutateAsync: updateMemberRoles } = useUpdateMemberRoles();

  /**
   * Normalize roles from API (supports both legacy and canonical names).
   */
  const baseRoles: string[] = useMemo(() => {
    if (Array.isArray(member.roles) && member.roles.length > 0) {
      return member.roles;
    }

    const memberWithRoles = member as Member & { memberRoles?: Array<{ name: string }> };
    if (Array.isArray(memberWithRoles.memberRoles)) {
      return memberWithRoles.memberRoles.map((r) => r.name);
    }

    return [];
  }, [member]);

  const hasDirectoryAdmin = useMemo(
    () =>
      baseRoles.includes('DIRECTORYADMIN') ||
      baseRoles.includes('DIRECTORY_ADMIN'),
    [baseRoles],
  );

  const hasDemoDayAdmin = useMemo(
    () =>
      baseRoles.includes('DEMODAYADMIN') ||
      baseRoles.includes('DEMO_DAY_ADMIN'),
    [baseRoles],
  );

  /**
   * Derive current option from roles
   */
  const currentOption: AdminRoleOption = useMemo(() => {
    const noneOption = adminRoleOptions[0]; // 'NONE' option
    if (hasDirectoryAdmin) {
      return adminRoleOptions.find((o) => o.value === 'DIRECTORYADMIN') ?? noneOption;
    }
    if (hasDemoDayAdmin) {
      return adminRoleOptions.find((o) => o.value === 'DEMO_DAY_ADMIN') ?? noneOption;
    }
    return noneOption;
  }, [hasDirectoryAdmin, hasDemoDayAdmin]);

  /**
   * Local UI state (optimistic update).
   */
  const [selectedOption, setSelectedOption] = useState<AdminRoleOption>(currentOption);

  useEffect(() => {
    setSelectedOption(currentOption);
  }, [currentOption]);

  const handleChange = async (val: AdminRoleOption | null) => {
    if (!val) return;

    // Optimistically update UI
    setSelectedOption(val);

    if (!plnadmin) {
      toast.error('Missing admin token');
      return;
    }

    // Strip any existing admin roles (legacy + canonical)
    const adminRoleNamesToStrip = [
      'DIRECTORYADMIN',
      'DIRECTORY_ADMIN',
      'DEMODAYADMIN',
      'DEMO_DAY_ADMIN',
    ];

    let nextRoles = baseRoles.filter(
      (r) => !adminRoleNamesToStrip.includes(r),
    );

    // Add newly selected role (except NONE)
    if (val.value !== 'NONE') {
      nextRoles = [...nextRoles, val.value];
    }

    try {
      await updateMemberRoles({
        authToken: plnadmin,
        memberUid: member.uid,
        roles: nextRoles,
      });

      toast.success(`Admin role updated to "${val.name}" for ${member.name}`);
    } catch (error) {
      console.error(error);
      toast.error('Failed to update admin role');

      // Rollback on error
      setSelectedOption(currentOption);
    }
  };

  return (
    <div className={s.root}>
      <Select
        options={adminRoleOptions}
        isClearable={false}
        value={[selectedOption]}
        onChange={(newVal) => handleChange(newVal as AdminRoleOption)}
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
            '&:hover': {
              background: 'rgba(27, 56, 96, 0.12)',
            },
          }),
          menu: (baseStyles) => ({
            ...baseStyles,
            outline: 'none',
            zIndex: 3,
          }),
          indicatorContainer: () => ({
            display: 'none',
          }),
          indicatorSeparator: () => ({
            display: 'none',
          }),
        }}
        components={{
          Control: ({ children, innerProps, innerRef, getValue }) => {
            const val = getValue();
            const selected = val.length > 0 ? (val[0] as AdminRoleOption) : null;

            return (
              <div {...innerProps} ref={innerRef} className={s.control}>
                {selected ? (
                  <>
                    <div className={s.optionRoot}>
                      <span className={s.name}>{selected.name}</span>
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
                <span className={s.name}>{props.data.name}</span>
                <span className={s.desc}>{props.data.desc}</span>
              </div>
            );
          },
        }}
      />
    </div>
  );
};

export default RoleCell;
