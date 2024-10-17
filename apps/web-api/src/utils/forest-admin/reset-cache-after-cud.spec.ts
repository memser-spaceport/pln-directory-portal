import { resetCacheAfterCreateOrUpdateOrDelete } from './reset-cache-after-cud';
import cacheManager from 'cache-manager';

jest.mock('cache-manager');
jest.mock('cache-manager-redis-store');

describe('resetCacheAfterCreateOrUpdateOrDelete', () => {
  let mockRedisCache;
  let mockCollection;

  beforeEach(() => {
    mockRedisCache = {
      reset: jest.fn(),
    };

    (cacheManager.caching as jest.Mock).mockReturnValue(mockRedisCache);

    mockCollection = {
      addHook: jest.fn(),
    };

    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';
    process.env.REDIS_PASSWORD = 'password';
    process.env.REDIS_WITH_TLS = 'false';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should clear redis cache after create, update, and delete', async () => {
    const dataSource = {
      collections: [mockCollection],
    };

    await resetCacheAfterCreateOrUpdateOrDelete(dataSource, null);

    expect(mockCollection.addHook).toHaveBeenCalledWith('After', 'Create', expect.any(Function));
    expect(mockCollection.addHook).toHaveBeenCalledWith('After', 'Update', expect.any(Function));
    expect(mockCollection.addHook).toHaveBeenCalledWith('After', 'Delete', expect.any(Function));

    const createHookCallback = mockCollection.addHook.mock.calls[0][2];
    const updateHookCallback = mockCollection.addHook.mock.calls[1][2];
    const deleteHookCallback = mockCollection.addHook.mock.calls[2][2];

    await createHookCallback();
    await updateHookCallback();
    await deleteHookCallback();

    expect(mockRedisCache.reset).toHaveBeenCalledTimes(3);
  });

  it('should clear redis cache after create, update and delete when datasource is null', async () => {
    const dataSource = {
      collections: [mockCollection],
    };

    await resetCacheAfterCreateOrUpdateOrDelete(null, dataSource);

    expect(mockCollection.addHook).toHaveBeenCalledWith('After', 'Create', expect.any(Function));
    expect(mockCollection.addHook).toHaveBeenCalledWith('After', 'Update', expect.any(Function));
    expect(mockCollection.addHook).toHaveBeenCalledWith('After', 'Delete', expect.any(Function));

    const createHookCallback = mockCollection.addHook.mock.calls[0][2];
    const updateHookCallback = mockCollection.addHook.mock.calls[1][2];
    const deleteHookCallback = mockCollection.addHook.mock.calls[2][2];

    await createHookCallback();
    await updateHookCallback();
    await deleteHookCallback();

    expect(mockRedisCache.reset).toHaveBeenCalledTimes(3);
  });
});
