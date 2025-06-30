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
