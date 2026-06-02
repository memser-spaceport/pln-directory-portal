import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NoCache } from '../decorators/no-cache.decorator';
import { UserTokenCheckGuard } from '../guards/user-token-check.guard';
import { RBAC_PERMISSION_CODES } from '../rbac/rbac.constants';
import { RequirePermissions } from '../rbac/rbac.decorator';
import { RbacGuard } from '../rbac/rbac.guard';
import { ADMIN_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { ListFoundersQueryDto } from './dto/list-founders.query.dto';
import { ReviewFounderDto } from './dto/review-founder.dto';
import { FounderSourcingQueryService } from './founder-sourcing-query.service';
import { FounderSourcingReviewService } from './founder-sourcing-review.service';

const READ_PERMS = {
  anyOf: [RBAC_PERMISSION_CODES.FOUNDER_DB_VIEW, ADMIN_PERMISSIONS.DIRECTORY_FULL],
};
const EDIT_PERMS = {
  anyOf: [RBAC_PERMISSION_CODES.FOUNDER_DB_EDIT, ADMIN_PERMISSIONS.DIRECTORY_FULL],
};

@ApiTags('Founder Sourcing')
@Controller('v1/founder-sourcing')
@UseGuards(UserTokenCheckGuard, RbacGuard)
export class FounderSourcingController {
  constructor(
    private readonly queryService: FounderSourcingQueryService,
    private readonly reviewService: FounderSourcingReviewService
  ) {}

  @NoCache()
  @Get('founders')
  @RequirePermissions(READ_PERMS)
  async listFounders(@Query() query: ListFoundersQueryDto) {
    return this.queryService.listFounders(query);
  }

  @NoCache()
  @Get('kpis/summary')
  @RequirePermissions(READ_PERMS)
  async kpiSummary(@Query('weeks') weeks?: string) {
    return this.queryService.getKpiSummary(weeks ? Number(weeks) : 4);
  }

  @NoCache()
  @Get('founders/:founderId')
  @RequirePermissions(READ_PERMS)
  async founderById(@Param('founderId') founderId: string) {
    return this.queryService.findFounderById(founderId);
  }

  @Patch('founders/:founderId/review')
  @RequirePermissions(EDIT_PERMS)
  async reviewFounder(@Param('founderId') founderId: string, @Body() body: ReviewFounderDto, @Req() req: any) {
    const memberUid: string | undefined = req.memberUid ?? req.user?.memberUid ?? req.user?.sub;
    return this.reviewService.updateReview(founderId, body, memberUid);
  }
}
