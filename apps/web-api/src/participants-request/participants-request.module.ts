/* eslint-disable prettier/prettier */
import {Module, forwardRef } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { SharedModule } from '../shared/shared.module';
import { TeamsModule } from '../teams/teams.module';
import { ParticipantsRequestController } from './participants-request.controller';
import { ParticipantsRequestService } from './participants-request.service';
import { NotificationService } from '../utils/notification/notification.service';
@Module({
  imports: [forwardRef(() => MembersModule), forwardRef(() => TeamsModule), SharedModule],
  controllers: [ParticipantsRequestController],
  providers: [
    ParticipantsRequestService,
    NotificationService
  ],
  exports: [ParticipantsRequestService, NotificationService]
})
export class ParticipantsRequestModule {}
