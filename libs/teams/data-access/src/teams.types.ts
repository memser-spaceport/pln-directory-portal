import { TListOptions } from '@protocol-labs-network/shared/data-access';

export type TTeamListOptions = TListOptions & {
  'technologies.title__with'?: string;
  'acceleratorPrograms.title__with'?: string;
  'industryTags.title__with'?: string;
  'fundingStage.title__with'?: string;
  plnFriend?: boolean;
};

export type TTeamsFiltersValues = {
  tags: string[];
  acceleratorPrograms: string[];
  fundingStage: string[];
  technology: string[];
};
