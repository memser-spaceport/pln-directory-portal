import { Module } from '@nestjs/common';
import { JobOpeningsService } from './job-openings.service';
import { JobOpeningsServiceController } from './job-openings-service.controller';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [SharedModule],
  controllers: [JobOpeningsServiceController],
  providers: [JobOpeningsService],
  exports: [JobOpeningsService],
})
export class JobOpeningsModule {}
