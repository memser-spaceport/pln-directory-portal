import { BullModule } from '@nestjs/bull';
import {
  CacheModule,
  MiddlewareConsumer,
  Module,
  RequestMethod,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import * as redisStore from 'cache-manager-redis-store';
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
import { OtpModule } from './otp/otp.module';
import { FaqModule } from './faq/faq.module';
import { ProjectsModule } from './projects/projects.module';
import { JoinRequestsModule } from './join-requests/join-requests.module';
import { FocusAreasModule } from './focus-areas/focus-areas.module';
import { PLEventsModule } from './pl-events/pl-events.module';
import { EmptyStringToNullInterceptor } from './interceptors/empty-string-to-null.interceptor';
import { OfficeHoursModule } from './office-hours/office-hours.module';
import { MemberFollowUpsModule } from './member-follow-ups/member-follow-ups.module';
import { MemberFeedbacksModule } from './member-feedbacks/member-feedbacks.module';
import { HuskyModule } from './husky/husky.module';
import { HomeModule } from './home/home.module';
import { InternalsModule } from './internals/internals.module';
import { OsoMetricsModule } from './oso-metrics/oso-metrics.module';
import { MemberSubscriptionsModule } from './member-subscriptions/member-subscriptions.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AskModule } from './asks/asks.module';

@Module({
  controllers: [AppController],
  imports: [
    ThrottlerModule.forRoot({
      ttl: 1,
      limit: 10,
    }),
    CacheModule.register<any>({
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
      url: process.env.QUEUE_REDIS_WITH_TLS,
      redis: {
        tls: {
          rejectUnauthorized: false,
          requestCert: true,
        },
      },
      settings: {
        lockDuration: 20000
      }
    }),
    // ScheduleModule.forRoot(),
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
    OtpModule,
    FaqModule,
    ProjectsModule,
    JoinRequestsModule,
    FocusAreasModule,
    PLEventsModule,
    OfficeHoursModule,
    MemberFollowUpsModule,
    MemberFeedbacksModule,
    // HuskyModule,
    // HomeModule,
    InternalsModule,
    OsoMetricsModule,
    MemberSubscriptionsModule,
    NotificationsModule,
    AskModule
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
    {
      provide: APP_INTERCEPTOR,
      useClass: EmptyStringToNullInterceptor
    },
    {
      provide: APP_FILTER,
      useClass: LogException
    }
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
