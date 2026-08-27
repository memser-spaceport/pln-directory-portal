import { Module, forwardRef } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { MembersModule } from '../members/members.module';
import { MemberCvImportsController } from './member-cv-imports.controller';
import { MemberCvImportsService } from './member-cv-imports.service';

@Module({
  imports: [SharedModule, forwardRef(() => MembersModule)],
  controllers: [MemberCvImportsController],
  providers: [MemberCvImportsService],
  exports: [MemberCvImportsService],
})
export class MemberCvImportsModule {}
