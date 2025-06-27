export type Member = {
  email: string;
  id: string;
  imageUrl: string;
  isSubscribedToNewsletter: boolean;
  name: string;
  projectContributions: [];
  skills: 'PENDING';
  teamAndRoles: [];
  status: string;
  linkedinProfile: Record<string, string>;
};
