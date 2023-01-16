import { client } from '@protocol-labs-network/shared/data-access';

export const getMembershipSources = async () => {
  return await client.membershipSources.getMembershipSources();
};
