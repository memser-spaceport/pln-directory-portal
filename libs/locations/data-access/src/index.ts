import { client } from '@protocol-labs-network/shared/data-access';

export const getMetroAreas = async () => {
  const { body, status } = await client.locations.getLocations({
    query: { select: 'city', distinct: 'city' },
  });

  return { body, status };
};
