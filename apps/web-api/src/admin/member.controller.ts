import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { MembersService } from '../members/members.service';

@Controller('v1/admin/members')
export class MemberController {
  constructor(private readonly membersService: MembersService) { }

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
}
