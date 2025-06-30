import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards, UsePipes } from '@nestjs/common';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { MembersService } from '../members/members.service';
import { ZodValidationPipe } from '@abitia/zod-dto';
import { AccessLevelCounts, RequestMembersDto, UpdateAccessLevelDto } from 'libs/contracts/src/schema/admin-member';
import { NoCache } from '../decorators/no-cache.decorator';

@Controller('v1/admin/members')
export class MemberController {
  constructor(private readonly membersService: MembersService) { }

  @Get()
  @UseGuards(AdminAuthGuard)
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async getMembers(@Query() query: RequestMembersDto) {
    return await this.membersService.findMemberByAccessLevels(query);
  }

  @Get('access-level-counts')
  async getAccessLevelCounts(): Promise<AccessLevelCounts> {
    return this.membersService.getAccessLevelCounts();
  }

  @Put('access-level')
  @UseGuards(AdminAuthGuard)
  @UsePipes(ZodValidationPipe)
  async updateAccessLevel(@Body() body: UpdateAccessLevelDto) {
    return this.membersService.updateAccessLevel(body);
  }

  /**
   * Updates a member to a verfied user.
   *
   * @param body - array of memberIds to be updated.
   * @returns Array of updation status of the provided memberIds.
   */
  @Post("/")
  @UseGuards(AdminAuthGuard)
  async verifyMembers(@Body() body) {
    const requestor = await this.membersService.findMemberByRole();
    const { memberIds } = body;
    return await this.membersService.verifyMembers(memberIds, requestor?.email);
  }

  /**
   * Updates a member to a verfied user.
   *
   * @param body - participation request data with updated member details
   * @returns updated member object
   */
  @Patch("/:uid")
  @UseGuards(AdminAuthGuard)
  async updateMemberAndVerify(@Param('uid') uid, @Body() participantsRequest) {
    const requestor = await this.membersService.findMemberByRole();
    const requestorEmail = requestor?.email ?? '';
    return await this.membersService.updateMemberFromParticipantsRequest(uid, participantsRequest, requestorEmail, true);
  }

}
