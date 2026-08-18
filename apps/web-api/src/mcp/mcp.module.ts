import { Module } from '@nestjs/common';
import { AccessControlV2Module } from '../access-control-v2/access-control-v2.module';
import { MasterProfileModule } from '../master-profile/master-profile.module';
import { RbacModule } from '../rbac/rbac.module';
import { SharedModule } from '../shared/shared.module';
import { McpAuthorizationsController } from './mcp-authorizations.controller';
import { McpOAuthController } from './mcp-oauth.controller';
import { McpOAuthService } from './mcp-oauth.service';
import { McpController } from './mcp.controller';

@Module({
  imports: [SharedModule, RbacModule, AccessControlV2Module, MasterProfileModule],
  controllers: [McpOAuthController, McpAuthorizationsController, McpController],
  providers: [McpOAuthService],
})
export class McpModule {}
