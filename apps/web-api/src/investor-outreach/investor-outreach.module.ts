import { Module } from '@nestjs/common';
import { InvestorOutreachService } from './investor-outreach.service';
import { InvestorOutreachServiceController } from './investor-outreach-service.controller';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [SharedModule],
  controllers: [InvestorOutreachServiceController],
  providers: [InvestorOutreachService],
  exports: [InvestorOutreachService],
})
export class InvestorOutreachModule {}
