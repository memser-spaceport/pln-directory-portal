import { Module } from '@nestjs/common';
import { FundingStagesController } from './funding-stages.controller';
import { FundingStagesService } from './funding-stages.service';

@Module({
  controllers: [FundingStagesController],
  providers: [FundingStagesService],
})
export class FundingStagesModule {}
