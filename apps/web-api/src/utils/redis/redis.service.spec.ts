import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from './redis.service';
import cacheManager from 'cache-manager';
import redisStore from 'cache-manager-redis-store';

jest.mock('cache-manager', () => ({
  caching: jest.fn(),
}));

const resetMock = jest.fn();

(cacheManager.caching as jest.Mock).mockImplementation(() => ({
  reset: resetMock,
}));

describe('RedisService', () => {
    let service: RedisService;
  
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [RedisService],
      }).compile();
  
      service = module.get<RedisService>(RedisService);
    });
  
    afterEach(() => {
      jest.clearAllMocks();
    });
  
    it('should reset all cache with TLS enabled', async () => {
      // Set the environment variable for TLS enabled
      process.env.REDIS_WITH_TLS = 'true';
  
      await service.resetAllCache();
  
      // Ensure caching method is called with TLS configuration
      expect(cacheManager.caching).toHaveBeenCalledWith({
        store: redisStore,
        host: process.env.REDIS_HOST,
        url: process.env.REDIS_TLS_URL,
        port: Number(process.env.REDIS_PORT),
        password: process.env.REDIS_PASSWORD,
        tls: {
          rejectUnauthorized: false,
          requestCert: true,
        },
      });
  
      expect(resetMock).toHaveBeenCalled();
    });
  
    it('should reset all cache with TLS disabled', async () => {
      // Set the environment variable for TLS disabled
      process.env.REDIS_WITH_TLS = '';
  
      await service.resetAllCache();
  
      // Ensure caching method is called without TLS configuration
      expect(cacheManager.caching).toHaveBeenCalledWith({
        store: redisStore,
        host: process.env.REDIS_HOST,
        url: process.env.REDIS_TLS_URL,
        port: Number(process.env.REDIS_PORT),
        password: process.env.REDIS_PASSWORD,
        tls: null,
      });
  
      expect(resetMock).toHaveBeenCalled();
    });
  });
  