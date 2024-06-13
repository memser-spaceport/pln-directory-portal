import { TListOptions } from '@protocol-labs-network/shared/data-access';

export type TTeamListOptions = TListOptions & {
  officeHours__not?: 'null';
  'technologies.title__with'?: string;
  'membershipSources.title__with'?: string;
  'industryTags.title__with'?: string;
  'fundingStage.title__with'?: string;
  'teamMemberRoles.member.uid'?: string;
  plnFriend?: boolean;
};

export type TTeamsFiltersValues = {
  tags: string[];
  membershipSources: string[];
  fundingStage: string[];
  technology: string[];
};
