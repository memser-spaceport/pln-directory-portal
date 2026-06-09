import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { RbacModule } from '../rbac/rbac.module';
import { AccessControlV2Module } from '../access-control-v2/access-control-v2.module';
import { InvestorListsController } from './investor-lists.controller';
import { InvestorListsQueryService } from './investor-lists-query.service';
import { InvestorListsService } from './investor-lists.service';

@Module({
  imports: [SharedModule, RbacModule, AccessControlV2Module],
  controllers: [InvestorListsController],
  providers: [InvestorListsQueryService, InvestorListsService],
  exports: [InvestorListsService],
})
export class InvestorListsModule {}
