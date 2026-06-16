import React, { useCallback, useMemo, useState } from 'react';
import { MultiValue } from 'react-select';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';

import { AsyncMultiSelect } from '../../../../../../../../components/AsyncMultiSelect';
import api from '../../../../../../../../utils/api';
import { API_ROUTE } from '../../../../../../../../utils/constants';
import { useAssignPolicy } from '../../../../../../../../hooks/access-control/useAssignPolicy';
import { MembersQueryKeys } from '../../../../../../../../hooks/members/constants/queryKeys';

import { MemberOption } from './components/MemberOption';
import { MemberOptionType } from './types';
import s from './AddMemberPanel.module.scss';

interface Props {
  authToken: string | undefined;
  policyCode: string;
  existingMemberUids: string[];
  onDone: () => void;
}

export function AddMemberPanel({ authToken, policyCode, existingMemberUids, onDone }: Props) {
  const [selected, setSelected] = useState<MultiValue<MemberOptionType>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const queryClient = useQueryClient();
  const assignPolicy = useAssignPolicy();

  const existingSet = useMemo(() => new Set(existingMemberUids), [existingMemberUids]);

  const loadOptions = useCallback(
    async (inputValue: string): Promise<MemberOptionType[]> => {
      if (!authToken || inputValue.trim().length < 2) return [];
      try {
        const params = new URLSearchParams();
        params.set('q', inputValue.trim());
        params.set('limit', '20');

        const { data } = await api.get<Array<{ uid: string; name: string; email: string; image?: { url: string } | null }>>(
          `${API_ROUTE.ADMIN_RBAC_MEMBERS}/search?${params.toString()}`,
          { headers: { authorization: `Bearer ${authToken}` } }
        );
        return data
          .filter((m) => !existingSet.has(m.uid))
          .map((m) => ({
            value: m.uid,
            label: m.name,
            email: m.email,
            imageUrl: m.image?.url ?? null,
          }));
      } catch {
        return [];
      }
    },
    [authToken, existingSet]
  );

  const handleAdd = async () => {
    if (!selected.length || !authToken) return;
    setIsSubmitting(true);
    let successCount = 0;
    let failCount = 0;

    for (const member of selected) {
      try {
        await assignPolicy.mutateAsync({
          authToken,
          memberUid: member.value,
          policyCode,
        });
        successCount++;
      } catch {
        failCount++;
      }
    }

    if (successCount > 0) {
      toast.success(
        successCount === 1
          ? `${selected[0].label} added to policy`
          : `${successCount} members added to policy`
      );
      queryClient.invalidateQueries({ queryKey: [MembersQueryKeys.GET_MEMBERS_LIST] });
      queryClient.invalidateQueries({ queryKey: ['POLICIES_LIST'] });
    }
    if (failCount > 0) {
      toast.error(`Failed to add ${failCount} member${failCount > 1 ? 's' : ''}`);
    }

    setIsSubmitting(false);
    onDone();
  };

  return (
    <div className={s.panel}>
      <AsyncMultiSelect<MemberOptionType>
        loadOptions={loadOptions}
        onChange={(val) => setSelected(val)}
        value={selected}
        placeholder="Search by name or email..."
        noOptionsMessage={({ inputValue }) =>
          inputValue.length < 2 ? 'Type at least 2 characters...' : 'No members found'
        }
        components={{ Option: MemberOption }}
        autoFocus
      />
      <div className={s.actions}>
        <button type="button" className={s.cancelBtn} onClick={onDone} disabled={isSubmitting}>
          Cancel
        </button>
        <button
          type="button"
          className={s.addBtn}
          disabled={!selected.length || isSubmitting}
          onClick={handleAdd}
        >
          {isSubmitting
            ? 'Adding...'
            : selected.length > 1
              ? `Add ${selected.length} Members`
              : 'Add Member'}
        </button>
      </div>
    </div>
  );
}
