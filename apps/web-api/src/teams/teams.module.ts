import { Module, forwardRef } from '@nestjs/common';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';
import { SharedModule } from '../shared/shared.module';
import { ParticipantsRequestModule } from '../participants-request/participants-request.module';
import { MembersModule } from '../members/members.module';

@Module({
  imports: [forwardRef(() => ParticipantsRequestModule), forwardRef(() => MembersModule), SharedModule],
  controllers: [TeamsController],
  providers: [TeamsService],
  exports: [TeamsService]
})
export class TeamsModule {}