export enum AccessLevel {
  L0 = 'L0',
  L1 = 'L1',
  L2 = 'L2',
  L3 = 'L3',
  L4 = 'L4',
  REJECTED = 'Rejected',
}

export const AccessLevelDescriptions: Record<AccessLevel, string> = {
  [AccessLevel.L0]:
    'Account created but KYC pending = former unverified = user can only access their profile, all other feature access similar to logged out view',
  [AccessLevel.L1]:
    'KYC complete = former unverified = user sees a message with verification success with prompt to fill out their profile & still no access to features. At this point system generates an email to admin and she approves/rejects the user',
  [AccessLevel.L2]:
    'Access Approved = former unverified = user gets a notification that they are approved/welcome to explore the product. They have access to all features at this point',
  [AccessLevel.L3]: 'Mission Aligned = former verified + friends of PL',
  [AccessLevel.L4]:
    'Portfolio Investment or Core Contributors = former verified + Member = All users La Christa adds via the Back Office "Add Member" flow go here',
  [AccessLevel.REJECTED]: 'User has been rejected by admin = former rejected',
};
