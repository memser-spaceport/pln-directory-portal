import { Module, forwardRef } from '@nestjs/common';
import { AskService } from './asks.service';
import { AsksController } from './asks.controller';
import { SharedModule } from '../shared/shared.module';
import { ParticipantsRequestModule } from '../participants-request/participants-request.module';
import { TeamsModule } from '../teams/teams.module';
import { MembersModule } from '../members/members.module';
import { ParticipantsRequestService } from '../participants-request/participants-request.service';

@Module({
  imports: [
    SharedModule,
    forwardRef(() => ParticipantsRequestModule),
    forwardRef(() => TeamsModule),
    forwardRef(() => MembersModule),
  ],
  controllers: [AsksController],
  providers: [AskService],
  exports: [AskService],
})
export class AskModule {}
