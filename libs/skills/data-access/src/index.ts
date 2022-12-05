import { client } from '@protocol-labs-network/shared/data-access';

export const getSkills = async () => {
  const { body, status } = await client.skills.getSkills({
    query: {},
  });

  return { body, status };
};
