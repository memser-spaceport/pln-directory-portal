/* eslint-disable prettier/prettier */
import {Module, forwardRef } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { TeamsModule } from '../teams/teams.module';
import { ParticipantsRequestController } from './participants-request.controller';
import { ParticipantsRequestService } from './participants-request.service';
import { NotificationService } from '../utils/notification/notification.service';
import { NotificationSettingsModule } from '../notification-settings/notification-settings.module';
import {AdminModule} from "../admin/admin.module";
import {MembersModule} from "../members/members.module";
import {TeamEnrichmentModule} from "../team-enrichment/team-enrichment.module";
import { RbacModule } from '../rbac/rbac.module';
import { AccessControlV2Module } from '../access-control-v2/access-control-v2.module';

@Module({
  imports: [
    forwardRef(() => AdminModule),
    forwardRef(() => MembersModule),
    forwardRef(() => TeamsModule),
    forwardRef(() => TeamEnrichmentModule),
    SharedModule,
    NotificationSettingsModule,
    RbacModule,
    AccessControlV2Module,
  ],
  controllers: [ParticipantsRequestController],
  providers: [
    ParticipantsRequestService,
    NotificationService
  ],
  exports: [ParticipantsRequestService, NotificationService]
})
export class ParticipantsRequestModule {}
