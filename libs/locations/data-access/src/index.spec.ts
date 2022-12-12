import { client } from '@protocol-labs-network/shared/data-access';
import { getCountries, getMetroAreas } from './index';

jest.mock('@protocol-labs-network/shared/data-access', () => ({
  client: {
    locations: {
      getLocations: jest.fn().mockResolvedValue({ body: [], status: 200 }),
    },
  },
}));

describe('getMetroAreas', () => {
  it('should call getLocations appropriately', async () => {
    const result = await getMetroAreas();

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
