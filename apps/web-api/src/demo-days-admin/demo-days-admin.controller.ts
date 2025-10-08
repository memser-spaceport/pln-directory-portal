import {
  Controller,
  Get,
  UseGuards,
  Req,
  Delete,
  Patch,
  Body,
  UsePipes,
  Query,
  Param,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '@abitia/zod-dto';
import { DemoDaysAdminService } from './demo-days-admin.service';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { NoCache } from '../decorators/no-cache.decorator';
import { UpdateFundraisingTeamDto } from 'libs/contracts/src/schema';
import { MembersService } from '../members/members.service';

@ApiTags('Demo Days Admin')
@Controller('v1/admin/demo-days')
export class DemoDaysAdminController {
  constructor(
    private readonly demoDaysAdminService: DemoDaysAdminService,
    private readonly memberService: MembersService
  ) {}

  @Get('current/fundraising-profiles')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async getCurrentDemoDayFundraisingProfilesAdmin(
    @Req() req,
    @Query('stage') stage?: string[] | string,
    @Query('industry') industry?: string[] | string,
    @Query('search') search?: string
  ) {
    await this.checkAdminAccess(req.userEmail);

    const normalize = (v: string | string[] | undefined) => (!v ? undefined : Array.isArray(v) ? v : v.split(','));

    return this.demoDaysAdminService.getCurrentDemoDayFundraisingProfiles({
      stage: normalize(stage),
      industry: normalize(industry),
      search,
    });
  }

  @Delete('current/teams/:teamUid/fundraising-profile/one-pager')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async deleteOnePagerByTeamUid(@Req() req, @Param('teamUid') teamUid: string) {
    await this.checkAdminAccess(req.userEmail);
    return this.demoDaysAdminService.deleteFundraisingOnePager(teamUid);
  }

  @Delete('current/teams/:teamUid/fundraising-profile/video')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async deleteVideoByTeamUid(@Req() req, @Param('teamUid') teamUid: string) {
    await this.checkAdminAccess(req.userEmail);
    return this.demoDaysAdminService.deleteFundraisingVideo(teamUid);
  }

  @Patch('current/teams/:teamUid/fundraising-profile')
  @UseGuards(UserTokenValidation)
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async updateTeamByUid(@Req() req, @Param('teamUid') teamUid: string, @Body() body: UpdateFundraisingTeamDto) {
    await this.checkAdminAccess(req.userEmail);
    return this.demoDaysAdminService.updateFundraisingTeam(teamUid, body);
  }

  private async checkAdminAccess(userEmail: string) {
    const requestor = await this.memberService.findMemberByEmail(userEmail);
    const isAdmin = this.memberService.checkIfAdminUser(requestor);
    if (!isAdmin) {
      throw new ForbiddenException(`Member with email ${userEmail} isn't admin`);
    }
  }
}
