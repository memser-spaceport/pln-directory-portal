import type { MemberStateTab } from './types';

export const ALL_MEMBER_STATES: readonly MemberStateTab[] = ['PENDING', 'VERIFIED', 'APPROVED', 'REJECTED'] as const;

export const MEMBER_STATE_TABS: { id: MemberStateTab; label: string }[] = [
  { id: 'PENDING', label: 'Pending Members (L0)' },
  { id: 'VERIFIED', label: 'Verified Members (L1)' },
  { id: 'APPROVED', label: 'Approved Members' },
];

export const REJECTED_TAB: { id: MemberStateTab; label: string } = { id: 'REJECTED', label: 'Rejected Members' };
