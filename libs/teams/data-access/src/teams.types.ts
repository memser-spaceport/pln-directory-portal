import { TListOptions } from '@protocol-labs-network/shared/data-access';

export type TTeamListOptions = TListOptions & {
  'technologies.title__with'?: string;
  'membershipSources.title__with'?: string;
  'industryTags.title__with'?: string;
  'fundingStage.title__with'?: string;
  plnFriend?: boolean;
};
