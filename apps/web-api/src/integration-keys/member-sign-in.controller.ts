import { Controller, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NoCache } from '../decorators/no-cache.decorator';
import { UserTokenCheckGuard } from '../guards/user-token-check.guard';
import { MemberSignInService } from './member-sign-in.service';

/** Called by LabOS's server with the signed-in member's token; the code goes to the app's callback. */
@ApiTags('Member sign-in')
@Controller('v1/member-sign-in')
@UseGuards(UserTokenCheckGuard)
@NoCache()
export class MemberSignInController {
  constructor(private readonly signIn: MemberSignInService) {}

  @Post('codes')
  async issueCode(@Req() req: { userEmail?: string }) {
    if (!req.userEmail) throw new UnauthorizedException('Please sign in');
    return this.signIn.issueCode(req.userEmail);
  }
}
