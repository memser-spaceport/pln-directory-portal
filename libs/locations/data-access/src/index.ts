import { client } from '@protocol-labs-network/shared/data-access';

/**
 * Get locations
 */
export const getLocations = async () => {
  return await client.locations.getLocations({
    query: { select: 'metroArea,city,region,country' },
  });
};

/**
 * Get distinct values for existing metro areas within the locations
 */
export const getMetroAreas = async () => {
  return await client.locations.getLocations({
    query: { select: 'metroArea', distinct: 'metroArea' },
  });
};

/**
 * Get distinct values for existing cities within the locations
 */
export const getCities = async () => {
  return await client.locations.getLocations({
    query: { select: 'city', distinct: 'city' },
  });
};

/**
 * Get distinct values for existing countries within the locations
 */
export const getCountries = async () => {
  return await client.locations.getLocations({
    query: { select: 'country', distinct: 'country' },
  });
};

/**
 * Get distinct values for existing regions within the locations
 */
export const getRegions = async () => {
  return await client.locations.getLocations({
    query: { select: 'region', distinct: 'region' },
  });
};
