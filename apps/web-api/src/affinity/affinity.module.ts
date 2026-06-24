import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { AffinityServiceController } from './affinity-service.controller';
import { AffinityService } from './affinity.service';

@Module({
  imports: [SharedModule],
  controllers: [AffinityServiceController],
  providers: [AffinityService],
  exports: [AffinityService],
})
export class AffinityModule {}
