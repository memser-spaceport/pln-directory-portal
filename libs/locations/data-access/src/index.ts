import { client } from '@protocol-labs-network/shared/data-access';

export const getMetroAreas = async () => {
  const { body, status } = await client.locations.getLocations({
    query: { select: 'city', distinct: 'city' },
  });

  return { body, status };
};

/**
 * Get distinct values for existing countries within the locations
 */
export const getCountries = async () => {
  const { body, status } = await client.locations.getLocations({
    query: { select: 'country', distinct: 'country' },
  });

  return { body, status };
};
