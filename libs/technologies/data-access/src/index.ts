import { client } from '@protocol-labs-network/shared/data-access';

export const getTechnologies = async () => {
  const { body, status } = await client.technologies.getTechnologies({
    query: {},
  });

  return { body, status };
};
