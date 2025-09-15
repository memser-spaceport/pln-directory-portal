import { Module } from '@nestjs/common';
import { DemoDaysService } from './demo-days.service';
import { DemoDayParticipantsService } from './demo-day-participants.service';
import { DemoDayFundraisingProfilesService } from './demo-day-fundraising-profiles.service';
import { DemoDaysController } from './demo-days.controller';
import { SharedModule } from '../shared/shared.module';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [SharedModule, UploadsModule],
  controllers: [DemoDaysController],
  providers: [DemoDaysService, DemoDayParticipantsService, DemoDayFundraisingProfilesService],
  exports: [DemoDaysService, DemoDayParticipantsService, DemoDayFundraisingProfilesService],
})
export class DemoDaysModule {}
