export type Member = {
  accessLevel: string;
  accessLevelUpdatedAt: string;
  email: string;
  image: { url: string };
  isSubscribedToNewsletter: boolean;
  linkedinProfile: { uid: string; linkedinHandler: string } | null;
  name: string;
  projectContributions: { uid: string; project: { uid: string; name: string } }[];
  teamMemberRoles: { team: { uid: string; name: string } }[];
  teamOrProjectURL: string;
  uid: string;
};

export type TMemberForm = {
  accessLevel: { label?: string; value?: string } | null;
  image: File | null;
  name: string;
  email: string;
  joinDate: Date | null;
  bio: string;
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
    typicalCheckSize: string;
  };
};
