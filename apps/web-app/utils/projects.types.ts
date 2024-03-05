export interface IProject {
  uid: string;
  logoUid: string;
  name: string;
  tagline: string;
  description: string;
  contactEmail: string;
  lookingForFunding: boolean;
  projectLinks: IProjectLinks[];
  kpis: IKPIs[];
  readMe: string;
  createdBy: string;
  maintainingTeamUid: string;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
}


export interface IKPIs {
    key: string;
    value: string;
  }


export interface IProjectLinks {
    url: string;
    name: string;
  }