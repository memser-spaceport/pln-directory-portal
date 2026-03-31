import { Controller, Get, Req, UseGuards } from '@nestjs/common';
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
    const memberUid = req.user?.memberUid ?? req.member?.uid ?? req.memberUid;
    return this.rbacService.getAccessForMember(memberUid);
  }
}
