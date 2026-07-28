import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { AdminAuthGuard, DemoDayAdminAuthGuard } from '../guards/admin-auth.guard';

import { ZodValidationPipe } from '@abitia/zod-dto';
import {
  CreateMemberDto,
  MemberStateCounts,
  RequestMembersDto,
  UpdateMemberDto,
} from 'libs/contracts/src/schema/admin-member';
import { NoCache } from '../decorators/no-cache.decorator';
import { Member } from '@prisma/client';
import { MemberService } from './member.service';
import { UpdateMemberRolesDto } from './dto/update-member-roles.dto';
import { UpdateMemberRolesAndHostsDto } from './dto/update-member-roles-and-hosts.dto';
import { MemberBioRefreshService } from '../husky/member-bio-refresh.service';

@Controller('v1/admin/members')
export class MemberController {
  constructor(
    private readonly memberService: MemberService,
    private readonly memberBioRefreshService: MemberBioRefreshService
  ) {}

  @Get()
  @UseGuards(DemoDayAdminAuthGuard)
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async getMembers(@Query() query: RequestMembersDto) {
    return await this.memberService.findMembers(query);
  }

  @Get('member-state-counts')
  @UseGuards(DemoDayAdminAuthGuard)
  @NoCache()
  async getMemberStateCounts(): Promise<MemberStateCounts> {
    return this.memberService.getMemberStateCounts();
  }

  /**
   * Count of members whose bio carries the AI-generated disclaimer, plus the
   * in-flight/last bio-refresh run. Cheap; poll this while a refresh runs.
   */
  @Get('ai-bios/status')
  @UseGuards(AdminAuthGuard)
  @NoCache()
  async getAiBioRefreshStatus() {
    return this.memberBioRefreshService.getStatus();
  }

  /**
   * Refreshes AI-generated member bios with correct gender handling.
   * Defaults to dryRun (report only, zero paid calls) — pass dryRun: false to
   * regenerate and save. An apply run executes in the background; progress is
   * polled via GET ai-bios/status.
   */
  @Post('ai-bios/refresh')
  @UseGuards(AdminAuthGuard)
  @NoCache()
  async triggerAiBioRefresh(
    @Body() body: { dryRun?: boolean; limit?: number; emails?: string[]; noScrape?: boolean }
  ) {
    const limit = body?.limit != null ? Number(body.limit) : null;
    if (limit != null && (!Number.isInteger(limit) || limit <= 0)) {
      throw new BadRequestException('limit must be a positive integer');
    }
    return this.memberBioRefreshService.trigger({
      dryRun: body?.dryRun !== false,
      limit,
      emails: Array.isArray(body?.emails) ? body.emails : undefined,
      noScrape: body?.noScrape === true,
    });
  }

  @Get(':uid')
  @UseGuards(DemoDayAdminAuthGuard)
  @NoCache()
  async getMemberByUid(@Param('uid') uid: string): Promise<any> {
    return await this.memberService.findMemberByUid(uid);
  }

  @Post('/create')
  @UseGuards(DemoDayAdminAuthGuard)
  async addNewMember(@Body() body: any): Promise<Member> {
    return this.memberService.createMemberByAdmin(
      body as CreateMemberDto & {
        roleCodes?: string[];
        policyCodes?: string[];
        permissionCodes?: string[];
      }
    );
  }

  @Patch('/edit/:uid')
  @UseGuards(DemoDayAdminAuthGuard)
  @UsePipes(ZodValidationPipe)
  async editMember(@Param('uid') uid: string, @Body() body: UpdateMemberDto): Promise<string> {
    return this.memberService.updateMemberByAdmin(uid, body);
  }

  /**
   * Updates a member to a verfied user.
   *
   * @param body - array of memberIds to be updated.
   * @returns Array of updation status of the provided memberIds.
   */
  @Post('/')
  @UseGuards(DemoDayAdminAuthGuard)
  async verifyMembers(@Body() body) {
    const requestor = await this.memberService.findMemberByRole();
    const { memberIds } = body;
    return await this.memberService.verifyMembers(memberIds, requestor?.email);
  }

  /**
   * Updates a member to a verfied user.
   *
   * @param body - participation request data with updated member details
   * @returns updated member object
   */
  @Patch('/:uid')
  @UseGuards(DemoDayAdminAuthGuard)
  async updateMemberAndVerify(@Param('uid') uid, @Body() participantsRequest) {
    const requestor = await this.memberService.findMemberByRole();
    const requestorEmail = requestor?.email ?? '';
    return await this.memberService.updateMemberFromParticipantsRequest(uid, participantsRequest, requestorEmail, true);
  }

  /**
   * Updates demo day admin HOST scopes for a member and returns the updated member,
   * including roles and demo day admin scopes.
   *
   * Expects an array of hosts (e.g. ["plnetwork.io", "founders.plnetwork.io"]).
   */
  @Patch(':uid/demo-day-hosts')
  @UseGuards(DemoDayAdminAuthGuard)
  async updateDemoDayAdminHosts(@Param('uid') uid: string, @Body() body: { hosts: string[] }): Promise<Member> {
    return await this.memberService.updateDemoDayAdminHosts(uid, body.hosts || []);
  }

  /**
   * Updates member roles (replaces the whole set) and returns the updated member.
   * Only directory/super admins are allowed to call this endpoint.
   */
  @Patch(':uid/roles')
  @UseGuards(DemoDayAdminAuthGuard)
  async updateMemberRoles(@Param('uid') uid: string, @Body() body: UpdateMemberRolesDto) {
    return await this.memberService.updateMemberRolesByUid(uid, body.roles);
  }

  /**
   * Updates both member roles and demo day admin hosts in a single transaction.
   * More efficient than calling roles and hosts endpoints separately.
   * Only directory/super admins are allowed to call this endpoint.
   */
  @Patch(':uid/roles-and-hosts')
  @UseGuards(DemoDayAdminAuthGuard)
  async updateMemberRolesAndHosts(
    @Param('uid') uid: string,
    @Body() body: UpdateMemberRolesAndHostsDto
  ): Promise<Member> {
    return await this.memberService.updateMemberRolesAndHosts(uid, body.roles, body.hosts);
  }
}
