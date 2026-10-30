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
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';
import { DealsModule } from '../deals/deals.module';
import { ArticlesModule } from '../articles/articles.module';
import { MemberFollowUpsModule } from '../member-follow-ups/member-follow-ups.module';
import { OfficeHoursModule } from '../office-hours/office-hours.module';
import { ParticipantsRequestModule } from '../participants-request/participants-request.module';
import { TeamEnrichmentModule } from '../team-enrichment/team-enrichment.module';
import { AskModule } from '../asks/asks.module';
import { EventsModule } from '../events/events.module';
import { ArticleRequestsModule } from '../article-requests/article-requests.module';
import { DealRequestsModule } from '../deal-requests/deal-requests.module';
import { ContactSupportModule } from '../contact-support/contact-support.module';
import { SpvSpotlightsModule } from '../spv-spotlights/spv-spotlights.module';
import { JobMatchModule } from '../job-match/job-match.module';
import { TeamHiringModule } from '../team-hiring/team-hiring.module';
import { PathfinderModule } from '../pathfinder/pathfinder.module';
import { InvestorListsModule } from '../investor-lists/investor-lists.module';
import { FounderSourcingModule } from '../founder-sourcing/founder-sourcing.module';
import { RoadmapModule } from '../roadmap/roadmap.module';
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
    PushNotificationsModule,
    DealsModule,
    ArticlesModule,
    MemberFollowUpsModule,
    OfficeHoursModule,
    ParticipantsRequestModule,
    TeamEnrichmentModule,
    AskModule,
    EventsModule,
    ArticleRequestsModule,
    DealRequestsModule,
    ContactSupportModule,
    SpvSpotlightsModule,
    JobMatchModule,
    TeamHiringModule,
    PathfinderModule,
    InvestorListsModule,
    FounderSourcingModule,
    RoadmapModule,
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
