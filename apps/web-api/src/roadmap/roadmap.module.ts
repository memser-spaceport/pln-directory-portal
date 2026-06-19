import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AccessControlV2Module } from '../access-control-v2/access-control-v2.module';
import { MembersModule } from '../members/members.module';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';
import { RbacModule } from '../rbac/rbac.module';
import { SharedModule } from '../shared/shared.module';
import { RoadmapController } from './roadmap.controller';
import { RoadmapDraftsService } from './roadmap-drafts.service';
import { RoadmapObjectivesService } from './roadmap-objectives.service';
import { RoadmapPinsService } from './roadmap-pins.service';
import { RoadmapService } from './roadmap.service';

@Module({
  imports: [SharedModule, MembersModule, RbacModule, AccessControlV2Module, PushNotificationsModule, AnalyticsModule],
  controllers: [RoadmapController],
  providers: [RoadmapService, RoadmapPinsService, RoadmapObjectivesService, RoadmapDraftsService],
  exports: [RoadmapService, RoadmapPinsService, RoadmapObjectivesService, RoadmapDraftsService],
})
export class RoadmapModule {}
