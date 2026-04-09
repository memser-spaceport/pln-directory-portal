import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { AssignRoleDto } from './dto/assign-role.dto';
import { GrantPermissionDto } from './dto/grant-permission.dto';
import { RevokePermissionDto } from './dto/revoke-permission.dto';
import { RevokeRoleDto } from './dto/revoke-role.dto';
import { UpdateMemberPermissionScopesDto, UpdateRolePermissionScopesDto } from './dto/update-scopes.dto';
import { RbacService } from './rbac.service';
import { NoCache } from '../decorators/no-cache.decorator';

@Controller('v1/admin/rbac')
@UseGuards(AdminAuthGuard)
export class AdminRbacController {
  constructor(private readonly rbacService: RbacService) { }

  @NoCache()
  @Get('members')
  async listMembers(
    @Query('search') search?: string,
    @Query('role') roleCode?: string,
    @Query('excludeRole') excludeRoleCode?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    return this.rbacService.listMembers({
      search,
      roleCode,
      excludeRoleCode,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
    });
  }

  @NoCache()
  @Get('members/search')
  async searchMembers(@Query('q') query?: string, @Query('limit') limit?: string) {
    return this.rbacService.searchMembers(query ?? '', limit ? parseInt(limit, 10) : 20);
  }

  @NoCache()
  @Get('members/:memberUid')
  async getMemberAccess(@Param('memberUid') memberUid: string) {
    return this.rbacService.getMemberAccessDetails(memberUid);
  }

  @NoCache()
  @Get('roles')
  async listRoles() {
    return this.rbacService.listRoles();
  }

  @NoCache()
  @Get('roles/:code')
  async getRoleDetails(
    @Param('code') code: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    return this.rbacService.getRoleDetails(code, {
      search,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Post('roles/assign')
  async assignRole(@Body() body: AssignRoleDto) {
    return this.rbacService.assignRole(body.memberUid, body.roleCode, body.assignedByMemberUid);
  }

  @Post('roles/revoke')
  async revokeRole(@Body() body: RevokeRoleDto) {
    return this.rbacService.revokeRole(body.memberUid, body.roleCode);
  }

  @NoCache()
  @Get('permissions')
  async listPermissions() {
    return this.rbacService.listPermissions();
  }

  @NoCache()
  @Get('permissions/:code')
  async getPermissionDetails(
    @Param('code') code: string,
    @Query('search') search?: string,
    @Query('filter') filter?: 'all' | 'direct' | 'viaRoles',
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    return this.rbacService.getPermissionDetails(code, {
      search,
      filter: filter || 'all',
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Post('permissions/grant')
  async grantPermission(@Body() body: GrantPermissionDto) {
    return this.rbacService.grantPermission(body.memberUid, body.permissionCode, body.grantedByMemberUid, body.scopes);
  }

  @Post('permissions/revoke')
  async revokePermission(@Body() body: RevokePermissionDto) {
    return this.rbacService.revokePermission(body.memberUid, body.permissionCode);
  }

  @Post('permissions/scopes')
  async updateMemberPermissionScopes(@Body() body: UpdateMemberPermissionScopesDto) {
    return this.rbacService.updateMemberPermissionScopes(body.memberUid, body.permissionCode, body.scopes);
  }

  @Post('roles/permission-scopes')
  async updateRolePermissionScopes(@Body() body: UpdateRolePermissionScopesDto) {
    return this.rbacService.updateRolePermissionScopes(body.roleCode, body.permissionCode, body.scopes);
  }
}
