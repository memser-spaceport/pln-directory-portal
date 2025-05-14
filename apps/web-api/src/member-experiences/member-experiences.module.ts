import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { MemberExperiencesService } from './member-experiences.service';
import { MemberExperiencesController } from './member-experiences.controller';
import { ParticipantsRequestModule } from '../participants-request/participants-request.module';

@Module({
  imports: [
    SharedModule,
    ParticipantsRequestModule
  ],
  providers: [
    MemberExperiencesService
  ],
  controllers: [MemberExperiencesController],
  exports: [MemberExperiencesService]
})
export class MemberExperiencesModule {} 