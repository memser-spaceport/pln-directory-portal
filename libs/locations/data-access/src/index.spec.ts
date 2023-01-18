import { client } from '@protocol-labs-network/shared/data-access';
import {
  getCities,
  getCountries,
  getLocations,
  getMetroAreas,
  getRegions,
} from './index';

jest.mock('@protocol-labs-network/shared/data-access', () => ({
  client: {
    locations: {
      getLocations: jest.fn().mockResolvedValue({ body: [], status: 200 }),
    },
  },
}));

describe('getLocations', () => {
  it('should call getLocations appropriately', async () => {
    const result = await getLocations();

    expect(client.locations.getLocations).toBeCalledWith({
      query: { select: 'metroArea,city,region,country' },
    });
    expect(result).toEqual({ body: [], status: 200 });
  });
});

describe('getMetroAreas', () => {
  it('should call getLocations appropriately', async () => {
    const result = await getMetroAreas();

    expect(client.locations.getLocations).toBeCalledWith({
      query: { select: 'metroArea', distinct: 'metroArea' },
    });
    expect(result).toEqual({ body: [], status: 200 });
  });
});

describe('getCities', () => {
  it('should call getLocations appropriately', async () => {
    const result = await getCities();

    expect(client.locations.getLocations).toBeCalledWith({
      query: { select: 'city', distinct: 'city' },
    });
    expect(result).toEqual({ body: [], status: 200 });
  });
});

describe('getCountries', () => {
  it('should call getLocations appropriately', async () => {
    const result = await getCountries();

    expect(client.locations.getLocations).toBeCalledWith({
      query: { select: 'country', distinct: 'country' },
    });
    expect(result).toEqual({ body: [], status: 200 });
  });
});

describe('getRegions', () => {
  it('should call getLocations appropriately', async () => {
    const result = await getRegions();

    expect(client.locations.getLocations).toBeCalledWith({
      query: { select: 'region', distinct: 'region' },
    });
    expect(result).toEqual({ body: [], status: 200 });
  });
});
