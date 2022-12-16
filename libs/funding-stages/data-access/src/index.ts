import { client } from '@protocol-labs-network/shared/data-access';

export const getFundingStages = async () => {
  return await client.fundingStages.getFundingStages();
};
