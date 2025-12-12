import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards, UsePipes } from '@nestjs/common';
import { AdminAuthGuard, DemoDayAdminAuthGuard } from '../guards/admin-auth.guard';

import { ZodValidationPipe } from '@abitia/zod-dto';
import {
  AccessLevelCounts,
  CreateMemberDto,
  RequestMembersDto,
  UpdateAccessLevelDto,
  UpdateMemberDto,
} from 'libs/contracts/src/schema/admin-member';
import { NoCache } from '../decorators/no-cache.decorator';
import { Member } from '@prisma/client';
import { MemberService } from './member.service';
import { UpdateMemberRolesDto } from './dto/update-member-roles.dto';
import { UpdateMemberRolesAndHostsDto } from './dto/update-member-roles-and-hosts.dto';

@Controller('v1/admin/members')
export class MemberController {
  constructor(private readonly memberService: MemberService) {}

  @Get()
  @UseGuards(DemoDayAdminAuthGuard)
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async getMembers(@Query() query: RequestMembersDto) {
    return await this.memberService.findMemberByAccessLevels(query);
  }

  @Get('access-level-counts')
  @UseGuards(AdminAuthGuard)
  @NoCache()
  async getAccessLevelCounts(): Promise<AccessLevelCounts> {
    return this.memberService.getAccessLevelCounts();
  }

  /**
   * Returns a single member by uid.
   * Used by Back Office to refresh roles and member data.
   */
  @Get(':uid')
  @UseGuards(DemoDayAdminAuthGuard)
  @NoCache()
  async getMemberByUid(@Param('uid') uid: string): Promise<Member> {
    return await this.memberService.findMemberByUid(uid);
  }

  @Put('access-level')
  @UseGuards(AdminAuthGuard)
  @UsePipes(ZodValidationPipe)
  async updateAccessLevel(@Body() body: UpdateAccessLevelDto) {
    return this.memberService.updateAccessLevel(body);
  }

  @Post('/create')
  @UseGuards(AdminAuthGuard)
  @UsePipes(ZodValidationPipe)
  async addNewMember(@Body() body: CreateMemberDto): Promise<Member> {
    return this.memberService.createMemberByAdmin(body);
  }

  @Patch('/edit/:uid')
  @UseGuards(AdminAuthGuard)
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
  @UseGuards(AdminAuthGuard)
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
  @UseGuards(AdminAuthGuard)
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
  @UseGuards(AdminAuthGuard)
  async updateDemoDayAdminHosts(@Param('uid') uid: string, @Body() body: { hosts: string[] }): Promise<Member> {
    return await this.memberService.updateDemoDayAdminHosts(uid, body.hosts || []);
  }

  /**
   * Updates member roles (replaces the whole set) and returns the updated member.
   * Only directory/super admins are allowed to call this endpoint.
   */
  @Patch(':uid/roles')
  @UseGuards(AdminAuthGuard)
  async updateMemberRoles(@Param('uid') uid: string, @Body() body: UpdateMemberRolesDto) {
    return await this.memberService.updateMemberRolesByUid(uid, body.roles);
  }

  /**
   * Updates both member roles and demo day admin hosts in a single transaction.
   * More efficient than calling roles and hosts endpoints separately.
   * Only directory/super admins are allowed to call this endpoint.
   */
  @Patch(':uid/roles-and-hosts')
  @UseGuards(AdminAuthGuard)
  async updateMemberRolesAndHosts(
    @Param('uid') uid: string,
    @Body() body: UpdateMemberRolesAndHostsDto
  ): Promise<Member> {
    return await this.memberService.updateMemberRolesAndHosts(uid, body.roles, body.hosts);
  }
}
