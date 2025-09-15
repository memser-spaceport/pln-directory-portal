import { Module } from '@nestjs/common';
import { DemoDayService } from './demo-day.service';
import { DemoDayController } from './demo-day.controller';
import { SharedModule } from '../shared/shared.module';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [SharedModule, UploadsModule],
  controllers: [DemoDayController],
  providers: [DemoDayService],
  exports: [DemoDayService],
})
export class DemoDayModule {}
