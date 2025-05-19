import { Body, Controller, Param, Patch, Post, UseGuards, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ParticipantsRequest } from '@prisma/client';
import { ZodValidationPipe } from '@abitia/zod-dto';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { MembersService } from '../members/members.service';
import { ApiBodyFromZod } from '../decorators/api-body-from-zod';
import {
  VerifyMembersRequestSchema,
  VerifyMembersRequestDto,
  UpdateMemberAndVerifyRequestSchema,
} from 'libs/contracts/src/schema';

@ApiTags('Admin')
@Controller('v1/admin/members')
@UseGuards(AdminAuthGuard)
@ApiBearerAuth()
export class MemberController {
  constructor(private readonly membersService: MembersService) {}

  /**
   * Updates a member to a verfied user.
   *
   * @param body - array of memberIds to be updated.
   * @returns Array of updation status of the provided memberIds.
   */
  @Post('/')
  @ApiBodyFromZod(VerifyMembersRequestSchema)
  @UsePipes(ZodValidationPipe)
  async verifyMembers(@Body() body: VerifyMembersRequestDto) {
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
  @Patch('/:uid')
  @ApiBodyFromZod(UpdateMemberAndVerifyRequestSchema)
  @UsePipes(ZodValidationPipe)
  async updateMemberAndVerify(@Param('uid') uid, @Body() participantsRequest: ParticipantsRequest) {
    const requestor = await this.membersService.findMemberByRole();
    const requestorEmail = requestor?.email ?? '';
    return await this.membersService.updateMemberFromParticipantsRequest(
      uid,
      participantsRequest,
      requestorEmail,
      true
    );
  }
}
