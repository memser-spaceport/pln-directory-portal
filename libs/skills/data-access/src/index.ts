import { client } from '@protocol-labs-network/shared/data-access';

export const getSkills = async () => {
  return await client.skills.getSkills();
};
