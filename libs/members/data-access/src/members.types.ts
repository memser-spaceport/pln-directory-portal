import { TListOptions } from '@protocol-labs-network/shared/data-access';

export type TMemberListOptions = TListOptions & {
  officeHours__not?: 'null';
  'skills.title__with'?: string;
  'location.continent__with'?: string;
  'location.country__with'?: string;
  'location.metroarea__with'?: string;
  'teamMemberRoles.team.uid'?: string;
  'projectContributions.projectUid'?: string;
  plnFriend?: boolean;
  openToWork?: boolean;
};

export type TMembersFiltersValues = {
  skills: string[];
  region: string[];
  country: string[];
  metroArea: string[];
  memberRoles?: string[];
};

export type TMembersRoleFilterValues = {
  role: string,
  count: number,
  default?: boolean,
  alias?: string
}
