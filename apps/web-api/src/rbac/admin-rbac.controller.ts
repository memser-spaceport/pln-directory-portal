import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { AssignRoleDto } from './dto/assign-role.dto';
import { GrantPermissionDto } from './dto/grant-permission.dto';
import { RevokePermissionDto } from './dto/revoke-permission.dto';
import { RevokeRoleDto } from './dto/revoke-role.dto';
import { RbacService } from './rbac.service';
import {NoCache} from "../decorators/no-cache.decorator";

@Controller('v1/admin/rbac')
@UseGuards(AdminAuthGuard)
export class AdminRbacController {
  constructor(private readonly rbacService: RbacService) {}

  @NoCache()
  @Get('members/:memberUid')
  async getMemberAccess(@Param('memberUid') memberUid: string) {
    return this.rbacService.getAccessForMember(memberUid);
  }

  @Post('roles/assign')
  async assignRole(@Body() body: AssignRoleDto) {
    return this.rbacService.assignRole(
      body.memberUid,
      body.roleCode,
      body.assignedByMemberUid,
    );
  }

  @Post('roles/revoke')
  async revokeRole(@Body() body: RevokeRoleDto) {
    return this.rbacService.revokeRole(body.memberUid, body.roleCode);
  }

  @Post('permissions/grant')
  async grantPermission(@Body() body: GrantPermissionDto) {
    return this.rbacService.grantPermission(
      body.memberUid,
      body.permissionCode,
      body.grantedByMemberUid,
    );
  }

  @Post('permissions/revoke')
  async revokePermission(@Body() body: RevokePermissionDto) {
    return this.rbacService.revokePermission(body.memberUid, body.permissionCode);
  }
}
