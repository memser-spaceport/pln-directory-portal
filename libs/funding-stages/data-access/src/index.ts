import { client } from '@protocol-labs-network/shared/data-access';

export const getFundingStages = async () => {
  const { body, status } = await client.fundingStages.getFundingStages({
    query: {},
  });

  return { body, status };
};
