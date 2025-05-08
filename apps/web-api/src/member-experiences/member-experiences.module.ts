import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { MemberExperiencesService } from './member-experiences.service';
import { MemberExperiencesController } from './member-experiences.controller';

@Module({
  imports: [
    SharedModule
  ],
  providers: [
    MemberExperiencesService
  ],
  controllers: [MemberExperiencesController],
  exports: [MemberExperiencesService]
})
export class MemberExperiencesModule {} 