import { BullModule } from '@nestjs/bull';
import {
  CacheModule,
  MiddlewareConsumer,
  Module,
  RequestMethod,
} from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import * as redisStore from 'cache-manager-redis-store';
import type { ClientOpts } from 'redis';
import { AcceleratorProgramsModule } from './accelerator-programs/accelerator-programs.module';
import { AppController } from './app.controller';
import { FundingStagesModule } from './funding-stages/funding-stages.module';
import { HealthModule } from './health/health.module';
import { IndustryTagsModule } from './industry-tags/industry-tags.module';
import { MyCacheInterceptor } from './interceptors/cache.interceptor';
import { ConcealEntityIDInterceptor } from './interceptors/conceal-entity-id.interceptor';
import { LocationsModule } from './locations/locations.module';
import { MembersModule } from './members/members.module';
import { ContentTypeMiddleware } from './middlewares/content-type.middleware';
import { PrismaService } from './prisma.service';
import { SkillsModule } from './skills/skills.module';
import { TeamsModule } from './teams/teams.module';
import { TechnologiesModule } from './technologies/technologies.module';

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
      url: process.env.REDIS_URL,
      port: Number(process.env.REDIS_PORT),
      password: process.env.REDIS_PASSWORD,
      isGlobal: true,
      ttl: 86400, // 1 day in seconds
      max: 100, // maximum number of items in cache
      tls: process.env.REDIS_WITH_TLS
        ? {
            rejectUnauthorized: false,
            requestCert: true,
          }
        : null,
    }),
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
        password: process.env.REDIS_PASSWORD,
        tls: {
          rejectUnauthorized: false,
          requestCert: true,
        },
      },
    }),
    MembersModule,
    HealthModule,
    TeamsModule,
    IndustryTagsModule,
    AcceleratorProgramsModule,
    FundingStagesModule,
    SkillsModule,
    LocationsModule,
    TechnologiesModule,
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
    {
      provide: APP_INTERCEPTOR,
      useClass: ConcealEntityIDInterceptor,
    },
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(ContentTypeMiddleware)
      .forRoutes(
        { path: '*', method: RequestMethod.POST },
        { path: '*', method: RequestMethod.PATCH }
      );
    // we can use .exclude() to exclude routes from the middleware (e.g. file upload endpoint)
  }
}
