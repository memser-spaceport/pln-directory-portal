import { BullModule } from '@nestjs/bull';
import {
  CacheModule,
  MiddlewareConsumer,
  Module,
  RequestMethod,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import * as redisStore from 'cache-manager-redis-store';
import type { ClientOpts } from 'redis';
import { AppController } from './app.controller';
import { FundingStagesModule } from './funding-stages/funding-stages.module';
import { HealthModule } from './health/health.module';
import { ImagesModule } from './images/images.module';
import { IndustryTagsModule } from './industry-tags/industry-tags.module';
import { MyCacheInterceptor } from './interceptors/cache.interceptor';
import { ConcealEntityIDInterceptor } from './interceptors/conceal-entity-id.interceptor';
import { LocationsModule } from './locations/locations.module';
import { MembersModule } from './members/members.module';
import { MembershipSourcesModule } from './membership-sources/membership-sources.module';
import { ContentTypeMiddleware } from './middlewares/content-type.middleware';
import { ParticipantsRequestModule } from './participants-request/participants-request.module';
import { SkillsModule } from './skills/skills.module';
import { TeamsModule } from './teams/teams.module';
import { TechnologiesModule } from './technologies/technologies.module';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { SharedModule } from './shared/shared.module';
import { LogException } from './filters/log-exception.filter';

@Module({
  controllers: [AppController],
  imports: [
    ThrottlerModule.forRoot({
      ttl: 1,
      limit: 10,
    }),
   CacheModule.register<ClientOpts>({
      store: redisStore,
      url: process.env.REDIS_TLS_URL,
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
        path: process.env.REDIS_TLS_URL,
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
    ImagesModule,
    MembershipSourcesModule,
    FundingStagesModule,
    SkillsModule,
    LocationsModule,
    TechnologiesModule,
    ParticipantsRequestModule,
    AdminModule,
    AuthModule,
    SharedModule,
  ],
  providers: [
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
    /* {
      provide: APP_FILTER,
      useClass: LogException
    } */
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(ContentTypeMiddleware)
      .exclude({ path: 'v1/images', method: RequestMethod.POST })
      .forRoutes(
        { path: '*', method: RequestMethod.POST },
        { path: '*', method: RequestMethod.PUT },
        { path: '*', method: RequestMethod.PATCH }
      );
    // we can use .exclude() to exclude routes from the middleware (e.g. file upload endpoint)
  }
}
