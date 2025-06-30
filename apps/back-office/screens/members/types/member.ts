export type Member = {
  email: string;
  id: string;
  imageUrl: string;
  isSubscribedToNewsletter: boolean;
  name: string;
  projectContributions: {
    projectTitle: string;
  }[];
  skills: 'PENDING';
  teamAndRoles: { teamTitle: string; teamUid: string }[];
  status: string;
  linkedinProfile: Record<string, string>;
};
