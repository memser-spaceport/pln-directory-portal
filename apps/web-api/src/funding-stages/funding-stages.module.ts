import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { FundingStagesController } from './funding-stages.controller';
import { FundingStagesService } from './funding-stages.service';

@Module({
  controllers: [FundingStagesController],
  providers: [FundingStagesService, PrismaService],
})
export class FundingStagesModule {}
