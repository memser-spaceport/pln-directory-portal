export type Member = {
  accessLevel: string;
  accessLevelUpdatedAt: string;
  email: string;
  image: { url: string };
  isSubscribedToNewsletter: boolean;
  linkedinProfile: { uid: string; linkedinHandler: string } | null;
  name: string;
  projectContributions: { uid: string; project: { uid: string; name: string } }[];
  teamMemberRoles: { team: { uid: string; name: string; accessLevel: string } }[];
  teamOrProjectURL: string;
  uid: string;
  signUpSource: string | null;
  roles?: { uid: string; code: string; name: string; description?: string | null }[];
  policies?: { uid: string; code: string; name: string; description?: string | null }[];
  permissions?: { uid: string; code: string; description?: string | null }[];
  memberRoles?: { name: string }[];
  demoDayHosts?: string[];
  demoDayAdminScopes?: {
    memberUid: string;
    scopeType: string;
    scopeValue: string;
    config: unknown | null;
  }[];
  memberState?: 'PENDING' | 'VERIFIED' | 'APPROVED' | 'REJECTED';
};

export type TMemberForm = {
  memberStateStatus?: { label: string; value: 'Pending' | 'Verified' | 'Approved' | 'Rejected' } | null;
  rbacPolicies?: { label: string; value: string }[];
  rbacExceptions?: { label: string; value: string }[];
  accessLevel: { label?: string; value?: string } | null;
  image: File | null;
  name: string;
  email: string;
  joinDate: Date | null;
  bio: string;
  aboutYou: string;
  country: string;
  state: string;
  city: string;
  skills: { label?: string; value?: string }[];
  teamOrProjectURL: string;
  teamsAndRoles: { team?: { label?: string; value?: string }; role?: string }[];
  linkedin: string;
  discord: string;
  twitter: string;
  github: string;
  telegram: string;
  officeHours: string;
  investorProfile?: {
    investmentFocus: { label: string; value: string }[];
    typicalCheckSize: number;
    secRulesAccepted: boolean;
    type?: { label: string; value: string } | null;
    investInStartupStages: { label: string; value: string }[];
    investInFundTypes: { label: string; value: string }[];
  };
};
