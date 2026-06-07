import { Module } from '@nestjs/common';
import { InvestorBulkProvisionService } from './investor-bulk-provision.service';

@Module({
  providers: [InvestorBulkProvisionService],
  exports: [InvestorBulkProvisionService],
})
export class InvestorsModule {}
