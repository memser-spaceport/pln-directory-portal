import { TListOptions } from '@protocol-labs-network/shared/data-access';

export type TMemberListOptions = TListOptions & {
  officeHours__not?: null;
  'skills.title__with'?: string;
  'teamMemberRoles.team.plnFriend'?: boolean;
  'location.continent__with'?: string;
  'location.country__with'?: string;
  'location.city__with'?: string;
  'teamMemberRoles.team.uid'?: string;
};
