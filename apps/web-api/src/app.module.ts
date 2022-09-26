import { CacheModule, Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import * as redisStore from 'cache-manager-redis-store';
import type { ClientOpts } from 'redis';
import { AppController } from './app.controller';
import { HealthModule } from './health/health.module';
import { MyCacheInterceptor } from './interceptors/cache.interceptor';
import { MembersModule } from './members/members.module';
import { PrismaService } from './prisma.service';
import { TeamsModule } from './teams/teams.module';

@Module({
  controllers: [AppController],
  imports: [
    ThrottlerModule.forRoot({
      ttl: 1,
      limit: 5,
    }),
    CacheModule.register<ClientOpts>({
      store: redisStore,
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
      isGlobal: true,
      ttl: 86400, // 1 day in seconds
      max: 100, // maximum number of items in cache
    }),
    MembersModule,
    HealthModule,
    TeamsModule,
  ],
  providers: [
    PrismaService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: MyCacheInterceptor,
    },
  ],
})
export class AppModule {}
