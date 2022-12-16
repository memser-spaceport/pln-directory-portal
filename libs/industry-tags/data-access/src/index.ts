import { client } from '@protocol-labs-network/shared/data-access';

export const getIndustryTags = async () => {
  return await client.tags.getIndustryTags();
};
