/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import cacheManager from 'cache-manager';
import redisStore from 'cache-manager-redis-store';

@Injectable()
export class RedisService {
  async resetAllCache() {
    const redisCache = cacheManager.caching({
      store: redisStore,
      host: process.env.REDIS_HOST,
      url: process.env.REDIS_URL,
      port: Number(process.env.REDIS_PORT),
      password: process.env.REDIS_PASSWORD,
      tls: process.env.REDIS_WITH_TLS
        ? {
            rejectUnauthorized: false,
            requestCert: true,
          }
        : null,
    });
    await redisCache.reset();
  }
}
