import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards, UsePipes } from '@nestjs/common';
import { AdminAuthGuard } from '../guards/admin-auth.guard';

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

@Controller('v1/admin/members')
export class MemberController {
  constructor(private readonly memberService: MemberService) {}

  @Get()
  @UseGuards(AdminAuthGuard)
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
}

