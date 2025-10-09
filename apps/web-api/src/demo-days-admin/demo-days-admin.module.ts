import { Module, forwardRef } from '@nestjs/common';
import { DemoDaysAdminController } from './demo-days-admin.controller';
import { DemoDaysAdminService } from './demo-days-admin.service';
import { SharedModule } from '../shared/shared.module';
import { DemoDaysModule } from '../demo-days/demo-days.module';
import { MembersModule } from '../members/members.module';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [SharedModule, forwardRef(() => DemoDaysModule), forwardRef(() => MembersModule), UploadsModule],
  controllers: [DemoDaysAdminController],
  providers: [DemoDaysAdminService],
  exports: [DemoDaysAdminService],
})
export class DemoDaysAdminModule {}
