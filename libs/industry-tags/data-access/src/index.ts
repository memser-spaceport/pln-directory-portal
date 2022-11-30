import { client } from '@protocol-labs-network/shared/data-access';

export const getAllIndustryTags = async () => {
  const { body, status } = await client.tags.getIndustryTags({ query: {} });

  return { body, status };
};
