import { Module } from '@nestjs/common';
import { AccessControlV2Module } from '../access-control-v2/access-control-v2.module';
import { MasterProfileModule } from '../master-profile/master-profile.module';
import { MembersModule } from '../members/members.module';
import { TeamsModule } from '../teams/teams.module';
import { ProjectsModule } from '../projects/projects.module';
import { PLEventsModule } from '../pl-events/pl-events.module';
import { SearchModule } from '../search/search.module';
import { RbacModule } from '../rbac/rbac.module';
import { SharedModule } from '../shared/shared.module';
import { WarmIntrosV2Module } from '../warm-intros-v2/warm-intros-v2.module';
import { McpAuthorizationsController } from './mcp-authorizations.controller';
import { McpOAuthController } from './mcp-oauth.controller';
import { McpOAuthService } from './mcp-oauth.service';
import { McpController } from './mcp.controller';

@Module({
  imports: [
    SharedModule,
    RbacModule,
    AccessControlV2Module,
    MasterProfileModule,
    WarmIntrosV2Module,
    MembersModule,
    TeamsModule,
    ProjectsModule,
    PLEventsModule,
    SearchModule,
  ],
  controllers: [McpOAuthController, McpAuthorizationsController, McpController],
  providers: [McpOAuthService],
})
export class McpModule {}
