import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { AccessControlV2Module } from '../access-control-v2/access-control-v2.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';
import { RbacModule } from '../rbac/rbac.module';
import { SharedModule } from '../shared/shared.module';
import { AwsService } from '../utils/aws/aws.service';
import { AiAppsController } from './ai-apps.controller';
import { AiAppsTestingUsersController } from './ai-apps-testing-users.controller';
import { AiAppsService } from './ai-apps.service';
import { AiAppsDeployProcessor } from './ai-apps-deploy.processor';
import { AI_APPS_DEPLOY_QUEUE } from './ai-apps.constants';
import { AiAppsAccessService } from './ai-apps-access.service';
import { AiAppsConnectService } from './ai-apps-connect.service';
import { AiAppsSessionService } from './ai-apps-session.service';
import { AiAppsAuthGateService } from './ai-apps-auth-gate.service';
import { AiAppsStarterKitService } from './ai-apps-starter-kit.service';
import { AiAppsTestingUsersService } from './ai-apps-testing-users.service';
import { AiAppMeRbacGuard } from './guards/ai-app-me-rbac.guard';
import { AiAppMemberContextGuard } from './guards/ai-app-member-context.guard';
import { AiAppTokenGuard } from './guards/ai-app-token.guard';
import { AgentFeedbackDeniedInterceptor } from './agent-feedback-denied.interceptor';

@Module({
  imports: [
    SharedModule,
    RbacModule,
    AccessControlV2Module,
    PushNotificationsModule,
    AnalyticsModule,
    BullModule.registerQueue({
      name: AI_APPS_DEPLOY_QUEUE,
      // Queue options merge shallowly over BullModule.forRoot, so `settings`
      // replaces the root one: keep its lockDuration. A deploy job killed by a
      // web-api restart stalls and is picked up again; the second pickup covers
      // a rolling restart that also kills the first.
      settings: { lockDuration: 20000, maxStalledCount: 2 },
    }),
  ],
  controllers: [AiAppsController, AiAppsTestingUsersController],
  providers: [
    AiAppsService,
    AiAppsDeployProcessor,
    AiAppsAccessService,
    AiAppsConnectService,
    AiAppsSessionService,
    AiAppsAuthGateService,
    AiAppsStarterKitService,
    AiAppsTestingUsersService,
    AiAppMemberContextGuard,
    AiAppMeRbacGuard,
    AiAppTokenGuard,
    AgentFeedbackDeniedInterceptor,
    AwsService,
  ],
  exports: [AiAppsService],
})
export class AiAppsModule {}
