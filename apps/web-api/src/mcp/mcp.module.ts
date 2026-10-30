import { Module } from '@nestjs/common';
import { AccessControlV2Module } from '../access-control-v2/access-control-v2.module';
import { AiAppsModule } from '../ai-apps/ai-apps.module';
import { IntegrationKeysModule } from '../integration-keys/integration-keys.module';
import { MasterProfileModule } from '../master-profile/master-profile.module';
import { MembersModule } from '../members/members.module';
import { TeamsModule } from '../teams/teams.module';
import { ProjectsModule } from '../projects/projects.module';
import { PLEventsModule } from '../pl-events/pl-events.module';
import { SearchModule } from '../search/search.module';
import { RbacModule } from '../rbac/rbac.module';
import { SharedModule } from '../shared/shared.module';
import { PlNetworkPortfolioModule } from '../spv-spotlights/pl-network-portfolio.module';
import { WarmIntrosV2Module } from '../warm-intros-v2/warm-intros-v2.module';
import { TeamNewsModule } from '../team-news/team-news.module';
import { MemberExperiencesModule } from '../member-experiences/member-experiences.module';
import { FollowsModule } from '../follows/follows.module';
import { JobOpeningsModule } from '../job-openings/job-openings.module';
import { JobAlertsModule } from '../job-alerts/job-alerts.module';
import { NotificationSettingsModule } from '../notification-settings/notification-settings.module';
import { SuggestedCandidatesEmailPreferenceModule } from '../notification-settings/suggested-candidates-email-preference.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DemoDaysModule } from '../demo-days/demo-days.module';
import { TeamPitchesModule } from '../team-pitches/team-pitches.module';
import { McpAdminScopesController } from './mcp-admin-scopes.controller';
import { McpAppSessionService } from './mcp-app-session.service';
import { McpAppSessionsController } from './mcp-app-sessions.controller';
import { McpAuthorizationsController } from './mcp-authorizations.controller';
import { McpMemberProofService } from './mcp-member-proof.service';
import { McpMemberProofsController, McpMemberProofsIntegrationController } from './mcp-member-proofs.controller';
import { McpOAuthController } from './mcp-oauth.controller';
import { McpOAuthService } from './mcp-oauth.service';
import { McpController } from './mcp.controller';
import { McpScopesService } from './mcp-scopes.service';
import { McpAccessRequestsService } from './mcp-access-requests.service';
import { McpWriteLimitService } from './mcp-write-limit.service';
import { JwtService } from '../utils/jwt/jwt.service';

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
    AiAppsModule,
    PlNetworkPortfolioModule,
    IntegrationKeysModule,
    TeamNewsModule,
    MemberExperiencesModule,
    FollowsModule,
    JobOpeningsModule,
    JobAlertsModule,
    NotificationSettingsModule,
    SuggestedCandidatesEmailPreferenceModule,
    NotificationsModule,
    DemoDaysModule,
    TeamPitchesModule,
  ],
  controllers: [
    McpOAuthController,
    McpAuthorizationsController,
    McpAdminScopesController,
    McpAppSessionsController,
    McpMemberProofsController,
    McpMemberProofsIntegrationController,
    McpController,
  ],
  providers: [
    McpOAuthService,
    McpAppSessionService,
    McpMemberProofService,
    McpScopesService,
    McpAccessRequestsService,
    McpWriteLimitService,
    JwtService,
  ],
})
export class McpModule {}
