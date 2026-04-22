import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { JwtService } from '../utils/jwt/jwt.service';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { MemberApprovalsController } from './member-approvals.controller';
import { MemberApprovalsService } from './member-approvals.service';

@Module({
  imports: [SharedModule],
  controllers: [MemberApprovalsController],
  providers: [MemberApprovalsService, AdminAuthGuard, JwtService],
  exports: [MemberApprovalsService],
})
export class MemberApprovalsModule {}
