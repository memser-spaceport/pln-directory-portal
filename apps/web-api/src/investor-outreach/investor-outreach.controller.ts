import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NoCache } from '../decorators/no-cache.decorator';
import { UserTokenCheckGuard } from '../guards/user-token-check.guard';
import { RbacGuard } from '../rbac/rbac.guard';
import { RequirePermissions } from '../rbac/rbac.decorator';
import { RBAC_PERMISSION_CODES } from '../rbac/rbac.constants';
import { ADMIN_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { ListInvestorsQueryDto } from './dto/list-investors.query.dto';
import { WarmIntrosQueryDto } from './dto/warm-intros.query.dto';
import { InvestorOutreachQueryService } from './investor-outreach-query.service';

const READ_PERMS = {
  anyOf: [RBAC_PERMISSION_CODES.INVESTOR_DB_VIEW, ADMIN_PERMISSIONS.DIRECTORY_FULL],
};

@ApiTags('Investor Outreach')
@Controller('v1/investor-outreach')
@UseGuards(UserTokenCheckGuard, RbacGuard)
export class InvestorOutreachController {
  constructor(private readonly queryService: InvestorOutreachQueryService) {}

  @NoCache()
  @Get('investors')
  @RequirePermissions(READ_PERMS)
  async listInvestors(@Query() query: ListInvestorsQueryDto) {
    return this.queryService.listInvestors(query);
  }

  @NoCache()
  @Get('co-investors/by-team')
  @RequirePermissions(READ_PERMS)
  async coInvestorsByTeam() {
    return this.queryService.findCoInvestorsByTeam();
  }

  @NoCache()
  @Get('warm-intros')
  @RequirePermissions(READ_PERMS)
  async warmIntros(@Query() query: WarmIntrosQueryDto) {
    return this.queryService.findWarmIntros(query);
  }

  @NoCache()
  @Get('investors/:id')
  @RequirePermissions(READ_PERMS)
  async getInvestor(@Param('id') id: string) {
    return this.queryService.findInvestorById(id);
  }
}
