interface Roles {
  teamUid: string;
  teamTitle: string;
  role: string;
  rowId?: number;
}

interface Skill {
  label: string;
  value: string;
}

export interface FormValues {
  name: string;
  email: string;
  requestorEmail?: string;
  imageUid: string;
  imageFile: File;
  plnStartDate: string;
  city: string;
  region: string;
  country: string;
  linkedinURL: string;
  discordHandler: string;
  twitterHandler: string;
  githubHandler: string;
  officeHours: string;
  comments: string;
  teamAndRoles: Roles[];
  skills: [];
}
