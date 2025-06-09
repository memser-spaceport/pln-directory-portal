import { ApiTags } from '@nestjs/swagger';
import { Controller, ForbiddenException, Get, Param, Req, UseGuards, UsePipes } from '@nestjs/common';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { MembersService } from '../members/members.service';
import { ProfileService } from './profile.service';
import { ZodValidationPipe } from '@abitia/zod-dto';
import { NoCache } from '../decorators/no-cache.decorator';
import { ProfileCompletenessResponse } from 'libs/contracts/src/schema/profile';

@ApiTags('Profile')
@UseGuards(UserTokenValidation)
@Controller('v1/profile')
export class ProfileController {
  constructor(private profileService: ProfileService, private memberService: MembersService) {}

  @Get(':memberUid/status')
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async getNotificationSettings(
    @Param('memberUid') memberUid: string,
    @Req() request: Request
  ): Promise<ProfileCompletenessResponse> {
    const userEmail = request['userEmail'];
    const authenticatedUser = await this.memberService.findMemberFromEmail(userEmail);
    if (authenticatedUser.uid !== memberUid) {
      throw new ForbiddenException(`User isn't authorized to get the profile completeness information`);
    }
    return this.profileService.getProfileCompletenessBy(memberUid);
  }
}
