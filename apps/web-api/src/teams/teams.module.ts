import { Module, forwardRef } from '@nestjs/common';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';
import { SharedModule } from '../shared/shared.module';
import { ParticipantsRequestModule } from '../participants-request/participants-request.module';
import { MembersModule } from '../members/members.module';
import { AskModule } from '../asks/asks.module';
import { AskService } from '../asks/asks.service';

@Module({
  imports: [forwardRef(() => ParticipantsRequestModule), forwardRef(() => MembersModule), SharedModule, AskModule],
  controllers: [TeamsController],
  providers: [TeamsService, AskService],
  exports: [TeamsService],
})
export class TeamsModule {}
