import React, { useEffect, useMemo, useState } from 'react';
import Select from 'react-select';
import { useCookie } from 'react-use';
import { toast } from 'react-toastify';

import { Member } from '../../types/member';
import { useUpdateMemberRoles } from '../../../../hooks/members/useUpdateMemberRoles';
import { useUpdateMemberDemoDayHosts } from '../../../../hooks/members/useUpdateMemberDemoDayHosts';
import { DEMO_DAY_HOSTS } from '@protocol-labs-network/contracts/constants';
import { MemberRole } from '../../../../utils/constants';

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

const RoleCell = ({ member }: { member: Member }) => {
  const [plnadmin] = useCookie('plnadmin');
  const { mutateAsync: updateMemberRoles } = useUpdateMemberRoles();
  const { mutateAsync: updateDemoDayHosts, isLoading: isUpdatingHosts } =
    useUpdateMemberDemoDayHosts();

  const hostOptions: DemoDayHostOption[] = DEMO_DAY_HOSTS.map((h) => ({ label: h, value: h }));

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

  const hasDirectoryAdmin = useMemo(
    () => baseRoles.includes(MemberRole.DIRECTORY_ADMIN),
    [baseRoles],
  );

  const hasDemoDayAdmin = useMemo(
    () => baseRoles.includes(MemberRole.DEMO_DAY_ADMIN),
    [baseRoles],
  );

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

  const handleRoleChange = async (val: AdminRoleOption | null) => {
    if (!val) return;

    setSelectedOption(val);

    if (!plnadmin) {
      toast.error('Missing admin token');
      return;
    }

    let nextRoles = baseRoles.filter(
      (r) => !Object.values(MemberRole).includes(r as MemberRole),
    );

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
      setSelectedOption(currentOption);
    }
  };


  const [selectedHosts, setSelectedHosts] = useState<DemoDayHostOption[]>([]);

  useEffect(() => {
    let hosts: string[] | undefined;

    const fromDemoDayHosts = (member as any).demoDayHosts as string[] | undefined;
    if (Array.isArray(fromDemoDayHosts) && fromDemoDayHosts.length > 0) {
      hosts = fromDemoDayHosts;
    } else {
      const scopes = (member as any).demoDayAdminScopes as
        | { scopeType: string; scopeValue: string }[]
        | undefined;

      if (Array.isArray(scopes)) {
        hosts = scopes
          .filter((s) => s.scopeType === 'HOST')
          .map((s) => s.scopeValue);
      }
    }

    if (Array.isArray(hosts) && hosts.length > 0) {
      const hostsLower = hosts.map((h) => h.toLowerCase());
      const initial = hostOptions.filter((opt) => hostsLower.includes(opt.value.toLowerCase()));
      setSelectedHosts(initial);
    } else {
      setSelectedHosts([]);
    }
  }, [member.uid, (member as any).demoDayHosts, (member as any).demoDayAdminScopes]);

  const handleHostsSelectChange = (value: readonly DemoDayHostOption[] | null) => {
    setSelectedHosts(value ? [...value] : []);
  };

  const handleUpdateHostsClick = async () => {
    if (!plnadmin) {
      toast.error('Missing admin token');
      return;
    }

    if (selectedHosts.length === 0) {
      toast.error('Please select at least one host');
      return;
    }

    try {
      await updateDemoDayHosts({
        authToken: plnadmin,
        memberUid: member.uid,
        hosts: selectedHosts.map((h) => h.value),
      });

      toast.success(`Demo day scope updated for ${member.name}`);
    } catch (error) {
      console.error(error);
      toast.error('Failed to update demo day hosts');
    }
  };

  const isDemoDayAdminSelected =
    selectedOption.value === MemberRole.DEMO_DAY_ADMIN ||
    baseRoles.includes(MemberRole.DEMO_DAY_ADMIN);

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
        <div className="mt-1 flex items-center gap-2">
          <Select<DemoDayHostOption, true>
            classNamePrefix="demo-day-hosts-select"
            className="flex-1"
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

          <button
            type="button"
            className={s.btn}
            onClick={handleUpdateHostsClick}
            disabled={isUpdatingHosts || selectedHosts.length === 0}
          >
            {isUpdatingHosts ? 'Saving…' : 'Update scope'}
          </button>
        </div>
      )}
    </div>
  );
};

export default RoleCell;
