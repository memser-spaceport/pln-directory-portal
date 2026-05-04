import { useMemo } from 'react';
import { useMembersList } from './useMembersList';

const ALL_MEMBER_STATES = ['PENDING', 'VERIFIED', 'APPROVED', 'REJECTED'];

export function useMembersStateCounts({ authToken }: { authToken: string | null | undefined }) {
  const { data } = useMembersList({
    authToken: authToken ?? undefined,
    memberState: ALL_MEMBER_STATES,
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
