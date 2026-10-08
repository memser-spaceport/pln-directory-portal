import api from '../../utils/api';
import {
  fetchAiAppResources,
  fetchAiAppsList,
  resetAiAppResources,
  updateAiAppResources,
} from '../../utils/services/ai-app-resources';

jest.mock('../../utils/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

const mockedApi = api as unknown as { get: jest.Mock; put: jest.Mock; delete: jest.Mock };
const BASE = '/v1/admin/ai-app-resources';
const headers = { authorization: 'Bearer token-1' };

describe('ai-app-resources service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists apps from the Directory API', async () => {
    mockedApi.get.mockResolvedValue({ data: { apps: [{ app_id: 'a', environment: 'prod' }] } });
    await expect(fetchAiAppsList({ authToken: 'token-1' })).resolves.toEqual([{ app_id: 'a', environment: 'prod' }]);
    expect(mockedApi.get).toHaveBeenCalledWith(BASE, { headers });
  });

  it('returns an empty list when the response has no apps', async () => {
    mockedApi.get.mockResolvedValue({ data: {} });
    await expect(fetchAiAppsList({ authToken: 'token-1' })).resolves.toEqual([]);
  });

  it('reads resources for one app and environment', async () => {
    mockedApi.get.mockResolvedValue({ data: { appId: 'pl-marketing-os', environment: 'preview', override: null } });
    await fetchAiAppResources({ authToken: 'token-1', appId: 'pl-marketing-os', environment: 'preview' });
    expect(mockedApi.get).toHaveBeenCalledWith(`${BASE}/pl-marketing-os`, {
      headers,
      params: { environment: 'preview' },
    });
  });

  it('saves all four values with PUT', async () => {
    const resources = { cpuRequest: '500m', cpuLimit: '1', memoryRequest: '512Mi', memoryLimit: '1Gi' };
    mockedApi.put.mockResolvedValue({ data: {} });
    await updateAiAppResources({ authToken: 'token-1', appId: 'app/1', environment: 'prod', resources });
    expect(mockedApi.put).toHaveBeenCalledWith(`${BASE}/app%2F1`, resources, {
      headers,
      params: { environment: 'prod' },
    });
  });

  it('resets to defaults with DELETE', async () => {
    mockedApi.delete.mockResolvedValue({ data: { deleted: true } });
    await expect(resetAiAppResources({ authToken: 'token-1', appId: 'a', environment: 'dev' })).resolves.toEqual({
      deleted: true,
    });
    expect(mockedApi.delete).toHaveBeenCalledWith(`${BASE}/a`, { headers, params: { environment: 'dev' } });
  });
});
