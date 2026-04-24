import { Body, Controller, Get, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { UserAuthValidateGuard } from '../../guards/user-auth-validate.guard';
import { AccessControlV2Service } from '../services/access-control-v2.service';
import {NoCache} from "../../decorators/no-cache.decorator";

@Controller('v2/access-control-v2/me')
@UseGuards(UserAuthValidateGuard)
export class SelfAccessControlV2Controller {
  constructor(private readonly service: AccessControlV2Service) {}

  @NoCache()
  @Get('access')
  async getMyAccess(@Req() req: any) {
    const email = req.userEmail;
    if (!email) throw new UnauthorizedException('User email not found in token');
    return this.service.getMemberAccessByEmail(email);
  }

  @Post('has-permission')
  async hasMyPermission(@Req() req: any, @Body() body: { permissionCode: string }) {
    const email = req.userEmail;
    if (!email) throw new UnauthorizedException('User email not found in token');
    return this.service.hasPermissionByEmail(email, body.permissionCode);
  }
}
