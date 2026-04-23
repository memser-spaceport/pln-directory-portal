import { useMemo } from 'react';
import { useMembersList } from './useMembersList';

const ALL_LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'Rejected'];

export function useMembersStateCounts({ authToken }: { authToken: string | null | undefined }) {
  const { data } = useMembersList({
    authToken: authToken ?? undefined,
    accessLevel: ALL_LEVELS,
  });

  return useMemo(() => {
    const counts = { PENDING: 0, VERIFIED: 0, APPROVED: 0, REJECTED: 0 };
    for (const m of data?.data ?? []) {
      if (m.memberState && m.memberState in counts) {
        counts[m.memberState as keyof typeof counts]++;
      }
    }
    return counts;
  }, [data]);
}
