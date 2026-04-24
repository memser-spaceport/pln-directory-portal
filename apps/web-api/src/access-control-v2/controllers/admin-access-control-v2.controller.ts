import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminAuthGuard } from '../../guards/admin-auth.guard';
import { AccessControlV2Service } from '../services/access-control-v2.service';
import {NoCache} from "../../decorators/no-cache.decorator";

@Controller('v2/admin/access-control-v2')
@UseGuards(AdminAuthGuard)
export class AdminAccessControlV2Controller {
  constructor(private readonly service: AccessControlV2Service) {}

  @NoCache()
  @Get('policies')
  listPolicies() {
    return this.service.listPolicies();
  }

  @NoCache()
  @Get('policies/:code')
  getPolicy(@Param('code') code: string) {
    return this.service.getPolicy(code);
  }

  @Post('policies')
  createPolicy(
    @Body()
    body: {
      code: string;
      name: string;
      description?: string | null;
      role: string;
      group: string;
      isSystem?: boolean;
      permissionCodes?: string[];
    },
  ) {
    return this.service.createPolicy(body);
  }

  @Patch('policies/:code')
  updatePolicy(
    @Param('code') code: string,
    @Body()
    body: {
      name?: string;
      description?: string | null;
      role?: string;
      group?: string;
      isSystem?: boolean;
    },
  ) {
    return this.service.updatePolicy(code, body);
  }

  @Delete('policies/:code')
  deletePolicy(@Param('code') code: string) {
    return this.service.deletePolicy(code);
  }

  @Post('policies/:code/permissions')
  addPermissionToPolicy(
    @Param('code') code: string,
    @Body() body: { permissionCode: string },
  ) {
    return this.service.addPermissionToPolicy(code, body.permissionCode);
  }

  @Delete('policies/:code/permissions/:permissionCode')
  removePermissionFromPolicy(
    @Param('code') code: string,
    @Param('permissionCode') permissionCode: string,
  ) {
    return this.service.removePermissionFromPolicy(code, permissionCode);
  }

  @NoCache()
  @Get('members/:memberUid/access')
  getMemberAccess(@Param('memberUid') memberUid: string) {
    return this.service.getMemberAccess(memberUid);
  }

  @Post('assign-policy')
  assignPolicy(@Body() body: { memberUid: string; policyCode: string; assignedByUid?: string }) {
    return this.service.assignPolicy(body.memberUid, body.policyCode, body.assignedByUid);
  }

  @Delete('members/:memberUid/policies/:policyCode')
  revokePolicy(@Param('memberUid') memberUid: string, @Param('policyCode') policyCode: string) {
    return this.service.revokePolicy(memberUid, policyCode);
  }

  @Post('member-permissions')
  grantDirectPermission(
    @Body() body: { memberUid: string; permissionCode: string; grantedByUid?: string; reason?: string },
  ) {
    return this.service.grantDirectPermission(body.memberUid, body.permissionCode, body.grantedByUid, body.reason);
  }

  @Delete('members/:memberUid/direct-permissions/:permissionCode')
  revokeDirectPermission(
    @Param('memberUid') memberUid: string,
    @Param('permissionCode') permissionCode: string,
  ) {
    return this.service.revokeDirectPermission(memberUid, permissionCode);
  }
}
