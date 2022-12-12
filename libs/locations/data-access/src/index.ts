import { client } from '@protocol-labs-network/shared/data-access';

/**
 * Get distinct values for existing cities within the locations
 */
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

/**
 * Get distinct values for existing regions within the locations
 */
export const getRegions = async () => {
  const { body, status } = await client.locations.getLocations({
    query: { select: 'region', distinct: 'region' },
  });

  return { body, status };
};
