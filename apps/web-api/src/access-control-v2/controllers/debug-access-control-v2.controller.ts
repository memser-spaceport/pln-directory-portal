import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AccessControlV2Service } from '../services/access-control-v2.service';
import { AdminAuthGuard } from '../../guards/admin-auth.guard';

@Controller('v2/debug/access-control-v2')
export class DebugAccessControlV2Controller {
  constructor(private readonly service: AccessControlV2Service) {}

  @Post('has-permission')
  @UseGuards(AdminAuthGuard)
  hasPermission(@Body() body: { memberUid: string; permissionCode: string }) {
    return this.service.hasPermission(body.memberUid, body.permissionCode);
  }
}
