import { client } from '@protocol-labs-network/shared/data-access';

export const getTechnologies = async () => {
  return await client.technologies.getTechnologies();
};
