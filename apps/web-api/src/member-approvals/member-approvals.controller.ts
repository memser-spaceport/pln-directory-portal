import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { MemberApprovalsService } from './member-approvals.service';
import { CreateMemberApprovalDto } from './dto/create-member-approval.dto';
import { ReviewMemberApprovalDto } from './dto/review-member-approval.dto';
import { NoCache } from '../decorators/no-cache.decorator';

@Controller('v1/admin/member-approvals')
@UseGuards(AdminAuthGuard)
export class MemberApprovalsController {
  constructor(private readonly service: MemberApprovalsService) {}

  @NoCache()
  @Get()
  list(@Query('state') state?: 'PENDING' | 'APPROVED' | 'VERIFIED' | 'REJECTED') {
    return this.service.list(state);
  }

  @NoCache()
  @Get(':memberUid')
  get(@Param('memberUid') memberUid: string) {
    return this.service.get(memberUid);
  }

  @Post()
  create(@Req() req: any, @Body() body: CreateMemberApprovalDto) {
    return this.service.create({
      memberUid: body.memberUid,
      reason: body.reason,
      requestedByUid: req.user?.memberUid ?? null,
    });
  }

  @Patch(':memberUid')
  review(@Req() req: any, @Param('memberUid') memberUid: string, @Body() body: ReviewMemberApprovalDto) {
    return this.service.review(memberUid, {
      state: body.state,
      reason: body.reason,
      reviewedByUid: req.user?.memberUid ?? null,
    });
  }
}
