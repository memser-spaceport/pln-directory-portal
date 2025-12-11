import React, { useEffect, useMemo, useState } from 'react';
import Select from 'react-select';
import { DEMO_DAY_HOSTS } from '@protocol-labs-network/contracts/constants';
import { MemberRole } from '../../../../utils/constants';

import { Member } from '../../types/member';
import s from '../StatusCell/StatusCell.module.scss';

type AdminRoleOptionValue = 'NONE' | MemberRole.DIRECTORY_ADMIN | MemberRole.DEMO_DAY_ADMIN;

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
    value: MemberRole.DIRECTORY_ADMIN,
    desc: '- Full directory admin permissions',
  },
  {
    name: 'Demo day admin',
    value: MemberRole.DEMO_DAY_ADMIN,
    desc: '- Can manage demo days and hosts',
  },
];

type DemoDayHostOption = {
  label: string;
  value: string;
};

const hostOptions: DemoDayHostOption[] = DEMO_DAY_HOSTS.map((h) => ({ label: h, value: h }));

export type PendingRoleChange = {
  memberUid: string;
  roles: string[];
};

export type PendingHostChange = {
  memberUid: string;
  hosts: string[];
};

type RoleCellProps = {
  member: Member;
  onRoleChange?: (change: PendingRoleChange | null) => void;
  onHostChange?: (change: PendingHostChange | null) => void;
};

const RoleCell = ({ member, onRoleChange, onHostChange }: RoleCellProps) => {
  // ---- ROLES ----

  const baseRoles: string[] = useMemo(() => {
    if (Array.isArray(member.roles) && member.roles.length > 0) {
      return member.roles;
    }

    if (Array.isArray(member.memberRoles)) {
      return member.memberRoles.map((r) => r.name);
    }

    return [];
  }, [member.roles, member.memberRoles]);

  const hasDirectoryAdmin = useMemo(() => baseRoles.includes(MemberRole.DIRECTORY_ADMIN), [baseRoles]);

  const hasDemoDayAdmin = useMemo(() => baseRoles.includes(MemberRole.DEMO_DAY_ADMIN), [baseRoles]);

  const currentOption: AdminRoleOption = useMemo(() => {
    const noneOption = adminRoleOptions[0];
    if (hasDirectoryAdmin) {
      return adminRoleOptions.find((o) => o.value === MemberRole.DIRECTORY_ADMIN) ?? noneOption;
    }
    if (hasDemoDayAdmin) {
      return adminRoleOptions.find((o) => o.value === MemberRole.DEMO_DAY_ADMIN) ?? noneOption;
    }
    return noneOption;
  }, [hasDirectoryAdmin, hasDemoDayAdmin]);

  const [selectedOption, setSelectedOption] = useState<AdminRoleOption>(currentOption);

  useEffect(() => {
    setSelectedOption(currentOption);
  }, [currentOption]);

  const handleRoleChange = (val: AdminRoleOption | null) => {
    if (!val) return;

    setSelectedOption(val);

    let nextRoles = baseRoles.filter((r) => !Object.values(MemberRole).includes(r as MemberRole));

    if (val.value !== 'NONE') {
      nextRoles = [...nextRoles, val.value];
    }

    const currentRolesSorted = [...baseRoles].sort();
    const nextRolesSorted = [...nextRoles].sort();
    const hasChanged = JSON.stringify(currentRolesSorted) !== JSON.stringify(nextRolesSorted);

    if (hasChanged) {
      onRoleChange?.({
        memberUid: member.uid,
        roles: nextRoles,
      });
    } else {
      onRoleChange?.(null);
    }
  };

  const demoDayHosts = member.demoDayHosts;
  const demoDayAdminScopes = member.demoDayAdminScopes;

  const initialSelectedHosts = useMemo(() => {
    let hosts: string[] | undefined;

    if (Array.isArray(demoDayHosts) && demoDayHosts.length > 0) {
      hosts = demoDayHosts;
    } else if (Array.isArray(demoDayAdminScopes)) {
      hosts = demoDayAdminScopes.filter((s) => s.scopeType === 'HOST').map((s) => s.scopeValue);
    }

    if (Array.isArray(hosts) && hosts.length > 0) {
      const hostsLower = hosts.map((h) => h.toLowerCase());
      return hostOptions.filter((opt) => hostsLower.includes(opt.value.toLowerCase()));
    }

    return [];
  }, [demoDayHosts, demoDayAdminScopes]);

  const [selectedHosts, setSelectedHosts] = useState<DemoDayHostOption[]>(initialSelectedHosts);

  const currentHostValues = useMemo(() => {
    let hosts: string[] | undefined;

    if (Array.isArray(demoDayHosts) && demoDayHosts.length > 0) {
      hosts = demoDayHosts;
    } else if (Array.isArray(demoDayAdminScopes)) {
      hosts = demoDayAdminScopes.filter((s) => s.scopeType === 'HOST').map((s) => s.scopeValue);
    }

    return hosts ? hosts.map((h) => h.toLowerCase()).sort() : [];
  }, [demoDayHosts, demoDayAdminScopes]);

  useEffect(() => {
    setSelectedHosts(initialSelectedHosts);
  }, [initialSelectedHosts]);

  const handleHostsSelectChange = (value: readonly DemoDayHostOption[] | null) => {
    const newHosts = value ? [...value] : [];
    setSelectedHosts(newHosts);

    const newHostValues = newHosts.map((h) => h.value.toLowerCase()).sort();
    const hasChanged = JSON.stringify(currentHostValues) !== JSON.stringify(newHostValues);

    if (hasChanged) {
      onHostChange?.({
        memberUid: member.uid,
        hosts: newHosts.map((h) => h.value),
      });
    } else {
      onHostChange?.(null);
    }
  };

  const isDemoDayAdminSelected =
    selectedOption.value === MemberRole.DEMO_DAY_ADMIN || baseRoles.includes(MemberRole.DEMO_DAY_ADMIN);

  return (
    <div className={s.root} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
      <Select<AdminRoleOption, false>
        classNamePrefix="admin-role-select"
        className="w-full"
        value={selectedOption}
        onChange={(val) => handleRoleChange(val as AdminRoleOption)}
        options={adminRoleOptions}
        isSearchable={false}
        getOptionLabel={(option) => option.name}
        getOptionValue={(option) => option.value}
        styles={{
          control: (base, state) => ({
            ...base,
            minHeight: 32,
            borderRadius: 8,
            borderColor: state.isFocused ? '#1B4DFF' : 'rgba(148, 163, 184, 0.6)',
            boxShadow: 'none',
            backgroundColor: 'transparent',
            fontSize: 13,
          }),
          valueContainer: (base) => ({
            ...base,
            padding: '0 8px',
          }),
          dropdownIndicator: (base) => ({
            ...base,
            paddingRight: 8,
          }),
          indicatorSeparator: () => ({
            display: 'none',
          }),
          menu: (base) => ({
            ...base,
            zIndex: 20,
          }),
        }}
      />

      {isDemoDayAdminSelected && (
        <Select<DemoDayHostOption, true>
          classNamePrefix="demo-day-hosts-select"
          className="w-full"
          isMulti
          closeMenuOnSelect={false}
          placeholder="Select demo day hosts"
          options={hostOptions}
          value={selectedHosts}
          onChange={(value) => handleHostsSelectChange(value as DemoDayHostOption[])}
          styles={{
            control: (base, state) => ({
              ...base,
              minHeight: 32,
              borderRadius: 8,
              borderColor: state.isFocused ? '#1B4DFF' : 'rgba(148, 163, 184, 0.6)',
              boxShadow: 'none',
              backgroundColor: 'transparent',
              fontSize: 13,
            }),
            valueContainer: (base) => ({
              ...base,
              padding: '0 8px',
            }),
            dropdownIndicator: (base) => ({
              ...base,
              paddingRight: 8,
            }),
            indicatorSeparator: () => ({
              display: 'none',
            }),
            menu: (base) => ({
              ...base,
              zIndex: 20,
            }),
          }}
        />
      )}
    </div>
  );
};

export default RoleCell;
