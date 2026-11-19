import api from '../../utils/api';
import {
  fetchAiAppAudience,
  fetchAiAppResources,
  fetchAiAppsList,
  resetAiAppResources,
  updateAiAppAudience,
  fetchAccessControlPermissions,
  uploadAiAppIcon,
  updateAiAppResources,
} from '../../utils/services/ai-app-resources';

jest.mock('../../utils/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), delete: jest.fn(), post: jest.fn() },
}));

const mockedApi = api as unknown as { get: jest.Mock; put: jest.Mock; delete: jest.Mock; post: jest.Mock };
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

  it('reads the audience of one app', async () => {
    const audience = {
      appUid: 'cm1',
      appId: 'playbook',
      name: 'PLaybook',
      policyCodes: ['investor_pl'],
      directLinkGateReady: true,
    };
    mockedApi.get.mockResolvedValue({ data: audience });
    await expect(fetchAiAppAudience({ authToken: 'token-1', appId: 'playbook' })).resolves.toEqual(audience);
    expect(mockedApi.get).toHaveBeenCalledWith('/v1/admin/ai-app-audience/playbook', { headers });
  });

  it('saves the audience and LabOS settings with PUT', async () => {
    mockedApi.put.mockResolvedValue({ data: {} });
    const settings = {
      policyCodes: ['investor_pl', 'founder_pl'],
      permissionCodes: ['plaa.member'],
      memberUids: ['m1'],
      showInMore: false,
      path: 'pla',
      iconUrl: 'https://cdn.example.test/pla.png',
      hideTopNav: true,
    };
    await updateAiAppAudience({ authToken: 'token-1', appId: 'app/1', ...settings });
    expect(mockedApi.put).toHaveBeenCalledWith('/v1/admin/ai-app-audience/app%2F1', settings, { headers });
  });

  it('lists Access Control V2 permissions', async () => {
    mockedApi.get.mockResolvedValue({ data: [{ uid: 'p1', code: 'plaa.member', module: 'plaa', description: null }] });
    await expect(fetchAccessControlPermissions({ authToken: 'token-1' })).resolves.toEqual([
      { uid: 'p1', code: 'plaa.member', module: 'plaa', description: null },
    ]);
    expect(mockedApi.get).toHaveBeenCalledWith('/v2/admin/access-control-v2/permissions', { headers });
  });

  it('uploads an icon and returns its URL', async () => {
    mockedApi.post.mockResolvedValue({ data: { image: { uid: 'img1', url: 'https://cdn.example.test/i.png' } } });
    const file = new File(['x'], 'icon.png', { type: 'image/png' });
    await expect(uploadAiAppIcon({ authToken: 'token-1', file })).resolves.toBe('https://cdn.example.test/i.png');
    expect(mockedApi.post).toHaveBeenCalledWith('/v1/admin/images', expect.any(FormData), {
      headers: { ...headers, 'content-type': 'multipart/form-data' },
    });

    mockedApi.post.mockResolvedValue({ data: {} });
    await expect(uploadAiAppIcon({ authToken: 'token-1', file })).rejects.toThrow();
  });
});
