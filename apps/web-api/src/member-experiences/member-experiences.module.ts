import { Module, forwardRef } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { MemberExperiencesService } from './member-experiences.service';
import { MemberExperiencesController } from './member-experiences.controller';
import { MembersModule } from '../members/members.module';
import { ParticipantsRequestModule } from '../participants-request/participants-request.module';

@Module({
  imports: [
    SharedModule,
    ParticipantsRequestModule,
    forwardRef(() => MembersModule)
  ],
  providers: [
    MemberExperiencesService
  ],
  controllers: [MemberExperiencesController],
  exports: [MemberExperiencesService]
})
export class MemberExperiencesModule {} 