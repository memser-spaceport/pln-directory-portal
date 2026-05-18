import { Module } from '@nestjs/common';
import { InvestorOutreachService } from './investor-outreach.service';
import { InvestorOutreachServiceController } from './investor-outreach-service.controller';
import { InvestorOutreachController } from './investor-outreach.controller';
import { InvestorOutreachQueryService } from './investor-outreach-query.service';
import { SharedModule } from '../shared/shared.module';
import { RbacModule } from '../rbac/rbac.module';
import { AccessControlV2Module } from '../access-control-v2/access-control-v2.module';

@Module({
  imports: [SharedModule, RbacModule, AccessControlV2Module],
  controllers: [InvestorOutreachServiceController, InvestorOutreachController],
  providers: [InvestorOutreachService, InvestorOutreachQueryService],
  exports: [InvestorOutreachService],
})
export class InvestorOutreachModule {}
