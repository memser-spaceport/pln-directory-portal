import { TListOptions } from '@protocol-labs-network/shared/data-access';

export type TTeamListOptions = TListOptions & {
  'industryTags.title'?: string;
  'acceleratorPrograms.title'?: string;
  'fundingStage.title'?: string;
  'technologies.title'?: string;
  plnFriend?: boolean;
};
