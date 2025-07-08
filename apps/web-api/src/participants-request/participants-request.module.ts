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
@Module({
  imports: [forwardRef(() => AdminModule),
    forwardRef(() => MembersModule),
    forwardRef(() => TeamsModule), SharedModule, NotificationSettingsModule],
  controllers: [ParticipantsRequestController],
  providers: [
    ParticipantsRequestService,
    NotificationService
  ],
  exports: [ParticipantsRequestService, NotificationService]
})
export class ParticipantsRequestModule {}
