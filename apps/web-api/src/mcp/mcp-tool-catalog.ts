import { Injectable } from '@nestjs/common';
import { MasterProfileService } from '../master-profile/master-profile.service';
import { WarmIntrosV2Service } from '../warm-intros-v2/warm-intros-v2.service';
import { MembersService } from '../members/members.service';
import { TeamsService } from '../teams/teams.service';
import { ProjectsService } from '../projects/projects.service';
import { PLEventGuestsService } from '../pl-events/pl-event-guests.service';
import { PLEventLocationsService } from '../pl-events/pl-event-locations.service';
import { PLEventsService } from '../pl-events/pl-events.service';
import { AiAppsService } from '../ai-apps/ai-apps.service';
import { PlNetworkPortfolioService } from '../spv-spotlights/pl-network-portfolio.service';
import { aiAppFeedbackTools, aiAppWriteTools } from './mcp-ai-app-feedback-tools';
import { forumTools } from './mcp-forum-tools';
import { forumImageTools } from './mcp-forum-image-tools';
import { ImagesService } from '../images/images.service';
import { McpMemberProofService } from './mcp-member-proof.service';
import { directoryTools } from './mcp-directory-tools';
import { portfolioTools } from './mcp-portfolio-tools';
import { newsTools } from './mcp-news-tools';
import { digestAdminNewsTools } from './mcp-digest-tools';
import { directoryWriteTools, eventWriteTools, membershipTools, newsWriteTools, profileTools } from './mcp-write-tools';
import { profileCoverageTools } from './mcp-profile-coverage-tools';
import { directoryCoverageTools } from './mcp-directory-coverage-tools';
import { actionCoverageTools } from './mcp-action-coverage-tools';
import { platformCoverageTools } from './mcp-platform-coverage-tools';
import {
  demoDaySaveTools,
  emailPreferenceTools,
  experienceTools,
  followTools,
  jobAlertTools,
  savedJobTools,
} from './mcp-member-action-tools';
import { pitchProfileTools } from './mcp-pitch-profile-tools';
import { DemoDayFundraisingProfilesService } from '../demo-days/demo-day-fundraising-profiles.service';
import { TeamPitchProfilesService } from '../team-pitches/team-pitch-profiles.service';
import { TeamPitchEngagementService } from '../team-pitches/team-pitch-engagement.service';
import { TeamPitchesService } from '../team-pitches/team-pitches.service';
import { InvestorProfileService } from '../members/investor-profile.service';
import { ParticipantsRequestService } from '../participants-request/participants-request.service';
import { TeamEnrichmentService } from '../team-enrichment/team-enrichment.service';
import { AskService } from '../asks/asks.service';
import { EventsService } from '../events/events.service';
import { ArticleCommentsService } from '../articles/article-comments.service';
import { ArticleRequestsService } from '../article-requests/article-requests.service';
import { DealRequestsService } from '../deal-requests/deal-requests.service';
import { ContactSupportService } from '../contact-support/contact-support.service';
import { SpvSpotlightsService } from '../spv-spotlights/spv-spotlights.service';
import { JobOpeningsApplicationService } from '../job-openings/job-openings-application.service';
import { JobOpeningsInterestService } from '../job-openings/job-openings-interest.service';
import { JobOpeningsReferralService } from '../job-openings/job-openings-referral.service';
import { JobMatchService } from '../job-match/job-match.service';
import { TeamHiringService } from '../team-hiring/team-hiring.service';
import { TeamNewsUpvotesService } from '../team-news/team-news-upvotes.service';
import { PathfinderService } from '../pathfinder/pathfinder.service';
import { InvestorListsService } from '../investor-lists/investor-lists.service';
import { FounderSourcingReviewService } from '../founder-sourcing/founder-sourcing-review.service';
import { RoadmapService } from '../roadmap/roadmap.service';
import { RoadmapPinsService } from '../roadmap/roadmap-pins.service';
import { WarmIntrosV2RegenerateService } from '../warm-intros-v2/warm-intros-v2-regenerate.service';
import { AiAppsAccessService } from '../ai-apps/ai-apps-access.service';
import {
  dealTools,
  demoDayFeedbackTools,
  guideLikeTools,
  notificationTools,
  officeHoursFeedbackTools,
} from './mcp-self-service-tools';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { DealsService } from '../deals/deals.service';
import { ArticlesService } from '../articles/articles.service';
import { MemberFollowUpsService } from '../member-follow-ups/member-follow-ups.service';
import { OfficeHoursService } from '../office-hours/office-hours.service';
import { NotificationSettingsService } from '../notification-settings/notification-settings.service';
import { SuggestedCandidatesEmailPreferenceService } from '../notification-settings/suggested-candidates-email-preference.service';
import { NotificationServiceClient } from '../notifications/notification-service.client';
import { DemoDaysService } from '../demo-days/demo-days.service';
import { DemoDayEngagementService } from '../demo-days/demo-day-engagement.service';
import { MemberExperiencesService } from '../member-experiences/member-experiences.service';
import { FollowsService } from '../follows/follows.service';
import { JobOpeningsSavedService } from '../job-openings/job-openings-saved.service';
import { JobOpeningsQueryService } from '../job-openings/job-openings-query.service';
import { JobAlertsService } from '../job-alerts/job-alerts.service';
import { TeamNewsService } from '../team-news/team-news.service';
import { LabosDigestService } from '../team-news/labos-digest.service';
import { MembersHooksService } from '../members/members.hooks.service';
import { PrismaService } from '../shared/prisma.service';
import { TeamNewsQueryService } from '../team-news/team-news-query.service';
import { TeamNewsSuggestionsService } from '../team-news/team-news-suggestions.service';
import { McpToolDef, toolsForPermissions, WHOAMI_TOOL, warmIntroTools } from './mcp-tools';
/**
 * The one MCP tool list (LAB-3299). The MCP server (`mcp.controller.ts`) and the LabOS in-app agent
 * read their tools from here, so both get the same tools and the same RBAC visibility rules.
 */
@Injectable()
export class McpToolCatalog {
  constructor(
    private readonly masterProfiles: MasterProfileService,
    private readonly warmIntros: WarmIntrosV2Service,
    private readonly members: MembersService,
    private readonly teams: TeamsService,
    private readonly projects: ProjectsService,
    private readonly plEvents: PLEventsService,
    private readonly aiApps: AiAppsService,
    private readonly portfolio: PlNetworkPortfolioService,
    private readonly newsQuery: TeamNewsQueryService,
    private readonly newsSuggestions: TeamNewsSuggestionsService,
    private readonly teamNews: TeamNewsService,
    private readonly memberHooks: MembersHooksService,
    private readonly prisma: PrismaService,
    private readonly eventGuests: PLEventGuestsService,
    private readonly eventLocations: PLEventLocationsService,
    private readonly experiences: MemberExperiencesService,
    private readonly follows: FollowsService,
    private readonly savedJobs: JobOpeningsSavedService,
    private readonly jobAlerts: JobAlertsService,
    private readonly jobQuery: JobOpeningsQueryService,
    private readonly notificationSettings: NotificationSettingsService,
    private readonly notificationClient: NotificationServiceClient,
    private readonly suggestedCandidatesEmail: SuggestedCandidatesEmailPreferenceService,
    private readonly demoDays: DemoDaysService,
    private readonly demoDayEngagement: DemoDayEngagementService,
    private readonly pushNotifications: PushNotificationsService,
    private readonly deals: DealsService,
    private readonly articles: ArticlesService,
    private readonly followUps: MemberFollowUpsService,
    private readonly officeHours: OfficeHoursService,
    private readonly fundraisingProfiles: DemoDayFundraisingProfilesService,
    private readonly teamPitchProfiles: TeamPitchProfilesService,
    private readonly investorProfiles: InvestorProfileService,
    private readonly participants: ParticipantsRequestService,
    private readonly enrichment: TeamEnrichmentService,
    private readonly asks: AskService,
    private readonly events: EventsService,
    private readonly articleComments: ArticleCommentsService,
    private readonly articleRequests: ArticleRequestsService,
    private readonly dealRequests: DealRequestsService,
    private readonly support: ContactSupportService,
    private readonly spotlights: SpvSpotlightsService,
    private readonly jobApplications: JobOpeningsApplicationService,
    private readonly jobInterests: JobOpeningsInterestService,
    private readonly jobReferrals: JobOpeningsReferralService,
    private readonly jobMatch: JobMatchService,
    private readonly hiring: TeamHiringService,
    private readonly newsUpvotes: TeamNewsUpvotesService,
    private readonly pathfinder: PathfinderService,
    private readonly investorLists: InvestorListsService,
    private readonly founderReviews: FounderSourcingReviewService,
    private readonly roadmap: RoadmapService,
    private readonly roadmapPins: RoadmapPinsService,
    private readonly warmIntroRegenerate: WarmIntrosV2RegenerateService,
    private readonly aiAccess: AiAppsAccessService,
    private readonly pitches: TeamPitchesService,
    private readonly pitchEngagement: TeamPitchEngagementService,
    private readonly memberProofs: McpMemberProofService,
    private readonly images: ImagesService,
    private readonly labosDigest: LabosDigestService
  ) {}

  /** Every tool, before RBAC. A new list each call: the tool objects hold no request state. */
  all(): McpToolDef[] {
    return [
      WHOAMI_TOOL,
      ...warmIntroTools(this.masterProfiles, this.warmIntros),
      ...directoryTools(this.members, this.teams, this.projects, this.plEvents),
      ...forumTools(this.memberProofs),
      ...forumImageTools(this.images),
      ...aiAppFeedbackTools(this.aiApps),
      ...aiAppWriteTools(this.aiApps),
      ...portfolioTools(this.portfolio),
      ...newsTools(this.newsQuery, this.newsSuggestions),
      ...digestAdminNewsTools(this.labosDigest),
      ...newsWriteTools(this.teamNews, this.newsQuery, this.members),
      ...profileTools(this.members, this.memberHooks, this.prisma),
      ...membershipTools(this.members, this.memberHooks, this.prisma),
      ...experienceTools(this.experiences, this.prisma),
      ...followTools(this.follows),
      ...savedJobTools(this.savedJobs),
      ...jobAlertTools(this.jobAlerts, this.jobQuery),
      ...emailPreferenceTools(
        this.notificationSettings,
        this.notificationClient,
        this.suggestedCandidatesEmail,
        this.members,
        this.prisma
      ),
      ...demoDaySaveTools(this.demoDays, this.demoDayEngagement, this.prisma),
      ...notificationTools(this.pushNotifications),
      ...dealTools(this.deals),
      ...guideLikeTools(this.articles),
      ...demoDayFeedbackTools(this.demoDays),
      ...officeHoursFeedbackTools(this.followUps, this.officeHours),
      ...eventWriteTools(this.eventGuests, this.eventLocations, this.members, this.prisma),
      ...directoryWriteTools(this.teams, this.projects, this.members, this.prisma, this.enrichment),
      ...pitchProfileTools(this.fundraisingProfiles, this.teamPitchProfiles, this.prisma),
      ...profileCoverageTools({
        members: this.members,
        investorProfiles: this.investorProfiles,
        notificationSettings: this.notificationSettings,
      }),
      ...directoryCoverageTools({
        teams: this.teams,
        members: this.members,
        projects: this.projects,
        prisma: this.prisma,
        participants: this.participants,
        enrichment: this.enrichment,
      }),
      ...actionCoverageTools({
        events: this.events,
        guests: this.eventGuests,
        prisma: this.prisma,
        applications: this.jobApplications,
        interests: this.jobInterests,
        referrals: this.jobReferrals,
        jobMatch: this.jobMatch,
        hiring: this.hiring,
        asks: this.asks,
        projects: this.projects,
        upvotes: this.newsUpvotes,
        comments: this.articleComments,
        articleRequests: this.articleRequests,
        officeHours: this.officeHours,
        demoDays: this.demoDays,
        demoDayEngagement: this.demoDayEngagement,
        pitches: this.pitches,
        pitchEngagement: this.pitchEngagement,
        deals: this.deals,
        dealRequests: this.dealRequests,
        spotlights: this.spotlights,
        support: this.support,
        notifications: this.pushNotifications,
      }),
      ...platformCoverageTools({
        aiApps: this.aiApps,
        aiAccess: this.aiAccess,
        regenerate: this.warmIntroRegenerate,
        warmIntros: this.warmIntros,
        lists: this.investorLists,
        pathfinder: this.pathfinder,
        founders: this.founderReviews,
        roadmap: this.roadmap,
        pins: this.roadmapPins,
      }),
    ];
  }

  /** The tools the member's RBAC permissions allow (`toolsForPermissions`). Scope levels apply on top in MCP. */
  forPermissions(permissions: Set<string>): McpToolDef[] {
    return toolsForPermissions(permissions, this.all());
  }
}
