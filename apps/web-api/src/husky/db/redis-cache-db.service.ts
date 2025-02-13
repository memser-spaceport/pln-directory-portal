import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { HuskyCacheDbService } from './husky-db.interface';

@Injectable()
export class RedisCacheDbService implements OnModuleDestroy, HuskyCacheDbService {
  private redis: Redis;

  constructor() {
    this.redis = new Redis(process.env.REDIS_CACHE_URL as string, {
      ...(process.env.REDIS_CACHE_TLS && {
        tls: {
          rejectUnauthorized: false,
        },
      }),
    });
  }

  async set(key: string, value: any): Promise<void> {
    await this.redis.set(
      key,
      JSON.stringify(value),
      'EX',
      Number(process.env.REDIS_CACHE_EXPIRY_IN_SECONDS || 60 * 60 * 24)
    );
  }

  async get(key: string): Promise<any> {
    const result = await this.redis.get(key);
    return result ? JSON.parse(result) : null;
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }
}
