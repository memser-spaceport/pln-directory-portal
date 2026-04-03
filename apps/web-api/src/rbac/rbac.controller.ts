import {Controller, Get, NotFoundException, Req, UseGuards} from '@nestjs/common';
import { UserTokenCheckGuard } from '../guards/user-token-check.guard';
import { RbacService } from './rbac.service';
import {NoCache} from "../decorators/no-cache.decorator";

@Controller('v1/rbac')
@UseGuards(UserTokenCheckGuard)
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @NoCache()
  @Get('me')
  async getMyAccess(@Req() req: any) {
    const email = req.userEmail;
    const member = await this.rbacService.findMemberByEmail(email);

    if (!member) {
      throw new NotFoundException(`Member not found for email: ${email}`);
    }

    return this.rbacService.getAccessForMember(member.uid);
  }
}
