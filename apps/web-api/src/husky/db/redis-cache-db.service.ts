import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { HuskyCacheDbService } from './husky-db.interface';


@Injectable()
export class RedisCacheDbService implements OnModuleDestroy, HuskyCacheDbService {
  private redis: Redis;

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_CACHE_HOST ,
      port: Number(process.env.REDIS_CACHE_PORT),
    });
  }
  
  async set(key: string, value: any): Promise<void> {
    await this.redis.set(key, JSON.stringify(value));
  }

  async get(key: string): Promise<any> {
    const result = await this.redis.get(key);
    return result ? JSON.parse(result) : null;
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }
}