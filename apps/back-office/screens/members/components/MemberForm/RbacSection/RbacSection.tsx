import React, { useState } from 'react';
import Select, { MultiValue, SingleValue } from 'react-select';
import { useFormContext } from 'react-hook-form';
import clsx from 'clsx';

import s from './RbacSection.module.scss';
import { TMemberForm } from '../../../types/member';
import { Policy } from '../../../../../hooks/access-control/usePoliciesList';

interface SelectOption {
  label: string;
  value: string;
}

const MEMBER_STATE_OPTIONS: SelectOption[] = [
  { label: 'Pending', value: 'Pending' },
  { label: 'Verified', value: 'Verified' },
  { label: 'Approved', value: 'Approved' },
  { label: 'Rejected', value: 'Rejected' },
];

const singleSelectStyles = {
  container: (base: object) => ({ ...base, width: '100%' }),
  control: (base: object) => ({
    ...base,
    borderRadius: 8,
    border: '1px solid rgba(203, 213, 225, 0.50)',
    background: '#fff',
    minHeight: 40,
    boxShadow: 'none',
    fontSize: 14,
    '&:hover': { border: '1px solid #5E718D', boxShadow: '0 0 0 4px rgba(27, 56, 96, 0.12)' },
  }),
  menu: (base: object) => ({ ...base, zIndex: 5, fontSize: 14 }),
  indicatorSeparator: () => ({ display: 'none' }),
  placeholder: (base: object) => ({ ...base, color: '#94a3b8', fontSize: 14 }),
};

const multiSelectStyles = (isDisabled: boolean) => ({
  container: (base: object) => ({ ...base, width: '100%' }),
  control: (base: object) => ({
    ...base,
    borderRadius: 8,
    border: '1px solid rgba(203, 213, 225, 0.50)',
    background: isDisabled ? '#f8fafc' : '#fff',
    minHeight: 40,
    boxShadow: 'none',
    fontSize: 14,
    opacity: isDisabled ? 0.6 : 1,
    '&:hover': isDisabled
      ? {}
      : { border: '1px solid #5E718D', boxShadow: '0 0 0 4px rgba(27, 56, 96, 0.12)' },
  }),
  menu: (base: object) => ({ ...base, zIndex: 5, fontSize: 14 }),
  indicatorSeparator: () => ({ display: 'none' }),
  multiValue: (base: object) => ({
    ...base,
    background: '#f1f5f9',
    borderRadius: 4,
  }),
  multiValueLabel: (base: object) => ({ ...base, color: '#334155', fontSize: 12 }),
  multiValueRemove: (base: object) => ({
    ...base,
    color: '#64748b',
    '&:hover': { background: '#e2e8f0', color: '#334155' },
  }),
  placeholder: (base: object) => ({ ...base, color: '#94a3b8', fontSize: 14 }),
});

interface RbacMultiSelectProps {
  name: 'rbacRoles' | 'rbacGroups' | 'rbacExceptions';
  label: string;
  placeholder: string;
  options: SelectOption[];
  isDisabled?: boolean;
  required?: boolean;
  onChange?: (selected: SelectOption[]) => void;
}

const RbacMultiSelect = ({
  name,
  label,
  placeholder,
  options,
  isDisabled = false,
  required = false,
  onChange,
}: RbacMultiSelectProps) => {
  const { watch, setValue } = useFormContext<TMemberForm>();
  const value = (watch(name) ?? []) as SelectOption[];

  return (
    <div className={s.field}>
      {label && <div className={clsx(s.label, { [s.required]: required })}>{label}</div>}
      <Select
        isMulti
        options={options}
        value={value}
        isDisabled={isDisabled}
        placeholder={placeholder}
        styles={multiSelectStyles(isDisabled)}
        menuPortalTarget={document.body}
        onChange={(selected: MultiValue<SelectOption>) => {
          const next = selected as SelectOption[];
          if (onChange) {
            onChange(next);
          } else {
            setValue(name, next, { shouldDirty: true });
          }
        }}
      />
    </div>
  );
};

interface RbacSectionProps {
  rolesOptions: SelectOption[];
  groupsOptions: SelectOption[];
  exceptionsOptions: SelectOption[];
  isLoadingOptions: boolean;
  policiesData?: Policy[];
}

export const RbacSection = ({
  rolesOptions,
  groupsOptions,
  exceptionsOptions,
  isLoadingOptions,
  policiesData,
}: RbacSectionProps) => {
  const { watch, setValue, getValues } = useFormContext<TMemberForm>();
  const rbacExceptions = (watch('rbacExceptions') ?? []) as SelectOption[];
  const memberStateStatus = watch('memberStateStatus');
  const isApproved = memberStateStatus?.value === 'Approved';

  const [removedGroupWarnings, setRemovedGroupWarnings] = useState<string[]>([]);

  const handleMemberStateChange = (opt: SingleValue<SelectOption>) => {
    setValue('memberStateStatus', opt as TMemberForm['memberStateStatus'], { shouldDirty: true });
    if (opt?.value !== 'Approved') {
      setValue('rbacRoles', [], { shouldDirty: true });
      setValue('rbacGroups', [], { shouldDirty: true });
      setValue('rbacExceptions', [], { shouldDirty: true });
      setRemovedGroupWarnings([]);
    }
  };

  const handleRolesChange = (newRoles: SelectOption[]) => {
    setValue('rbacRoles', newRoles, { shouldDirty: true });

    if (!policiesData || newRoles.length === 0) {
      setRemovedGroupWarnings([]);
      return;
    }

    const newRoleValues = newRoles.map((r) => r.value);
    const currentGroups = (getValues('rbacGroups') ?? []) as SelectOption[];

    const validGroups: SelectOption[] = [];
    const removedGroups: SelectOption[] = [];

    for (const g of currentGroups) {
      const isValid = policiesData.some((p) => newRoleValues.includes(p.role) && p.group === g.value);
      if (isValid) {
        validGroups.push(g);
      } else {
        removedGroups.push(g);
      }
    }

    if (removedGroups.length > 0) {
      setValue('rbacGroups', validGroups, { shouldDirty: true });
      setRemovedGroupWarnings(
        removedGroups.map((g) => `${g.label} group removed — not available for selected roles`)
      );
    } else {
      setRemovedGroupWarnings([]);
    }
  };

  return (
    <div className={s.rbacSection}>
      <div className={s.field}>
        <div className={clsx(s.label, s.required)}>Status</div>
        <Select
          options={MEMBER_STATE_OPTIONS}
          value={memberStateStatus ?? null}
          onChange={handleMemberStateChange}
          placeholder="Select status"
          styles={singleSelectStyles}
          isClearable={false}
          menuPortalTarget={document.body}
        />
        <p className={s.hint}>Roles and groups can only be assigned to Approved members.</p>
      </div>

      <RbacMultiSelect
        name="rbacRoles"
        label="Roles"
        placeholder="Select roles"
        options={rolesOptions}
        isDisabled={isLoadingOptions || !isApproved}
        required
        onChange={handleRolesChange}
      />

      <div className={s.field}>
        <RbacMultiSelect
          name="rbacGroups"
          label="Groups"
          placeholder="Select groups"
          options={groupsOptions}
          isDisabled={isLoadingOptions || !isApproved}
          required
        />
        {removedGroupWarnings.map((msg, i) => (
          <p key={i} className={s.groupRemovedWarning}>
            {msg}
          </p>
        ))}
      </div>

      <div className={s.exceptionsBlock}>
        <div className={s.exceptionsHeader}>
          <span className={s.exceptionsTitle}>Permissions exceptions</span>
        </div>

        <div className={s.exceptionsSelectWrap}>
          <RbacMultiSelect
            name="rbacExceptions"
            label=""
            placeholder="+ Add Exception"
            options={exceptionsOptions}
            isDisabled={isLoadingOptions || !isApproved}
          />
        </div>

        {rbacExceptions.length > 0 && (
          <div className={s.exceptionsBanner}>
            <svg className={s.bannerIcon} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M8 1.5C4.41 1.5 1.5 4.41 1.5 8C1.5 11.59 4.41 14.5 8 14.5C11.59 14.5 14.5 11.59 14.5 8C14.5 4.41 11.59 1.5 8 1.5ZM8.75 11.5H7.25V7.25H8.75V11.5ZM8.75 5.75H7.25V4.25H8.75V5.75Z"
                fill="#92400e"
              />
            </svg>
            <span>
              Exceptions grant permissions outside of assigned policies.
              <br />
              Use only for temporary or one-off cases.
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
