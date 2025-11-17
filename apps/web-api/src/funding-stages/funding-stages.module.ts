import { Module, forwardRef } from '@nestjs/common';
import { FundingStagesController } from './funding-stages.controller';
import { FundingStagesService } from './funding-stages.service';
import { TeamsModule } from '../teams/teams.module';

@Module({
  imports: [forwardRef(() => TeamsModule)],
  controllers: [FundingStagesController],
  providers: [FundingStagesService],
})
export class FundingStagesModule {}
