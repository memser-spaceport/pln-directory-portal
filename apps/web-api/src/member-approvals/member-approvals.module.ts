import { AccessControlV2Module } from '../access-control-v2/access-control-v2.module';
import { Module, forwardRef } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { JwtService } from '../utils/jwt/jwt.service';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { MemberApprovalsController } from './member-approvals.controller';
import { MemberApprovalsService } from './member-approvals.service';

@Module({
  imports: [ forwardRef(() => AccessControlV2Module), SharedModule],
  controllers: [MemberApprovalsController],
  providers: [MemberApprovalsService, AdminAuthGuard, JwtService],
  exports: [MemberApprovalsService],
})
export class MemberApprovalsModule {}
