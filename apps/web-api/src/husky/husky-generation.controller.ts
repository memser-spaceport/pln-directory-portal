import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { HuskyGenerationService } from './husky-generation.service';
import { UserAccessTokenValidateGuard } from '../guards/user-access-token-validate.guard';
import { NoCache } from '../decorators/no-cache.decorator';

@Controller('v1/husky/generation')
export class HuskyGenerationController {
  constructor(private readonly huskyAutoBioService: HuskyGenerationService) {}

  @Get('bio')
  @NoCache()
  @UseGuards(UserAccessTokenValidateGuard)
  async generateMemberBio(@Req() req) {
    return await this.huskyAutoBioService.generateMemberBio(req?.userEmail);
  }

  @Get('skills')
  @NoCache()
  @UseGuards(UserAccessTokenValidateGuard)
  async generateMemberSkills(@Req() req) {
    return await this.huskyAutoBioService.generateMemberSkills(req?.userEmail);
  }
}
