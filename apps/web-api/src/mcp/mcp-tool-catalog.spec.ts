// Light stubs for the services the catalog takes, as in mcp.controller.spec.ts. Tool lists never call them.
jest.mock('../demo-days/demo-day-fundraising-profiles.service', () => ({
  DemoDayFundraisingProfilesService: jest.fn(),
}));
jest.mock('../team-pitches/team-pitch-profiles.service', () => ({ TeamPitchProfilesService: jest.fn() }));
jest.mock('../push-notifications/push-notifications.service', () => ({ PushNotificationsService: jest.fn() }));
jest.mock('../deals/deals.service', () => ({ DealsService: jest.fn() }));
jest.mock('../articles/articles.service', () => ({ ArticlesService: jest.fn() }));
jest.mock('../member-follow-ups/member-follow-ups.service', () => ({ MemberFollowUpsService: jest.fn() }));
jest.mock('../office-hours/office-hours.service', () => ({ OfficeHoursService: jest.fn() }));
jest.mock('../notification-settings/notification-settings.service', () => ({ NotificationSettingsService: jest.fn() }));
jest.mock('../notification-settings/suggested-candidates-email-preference.service', () => ({
  SuggestedCandidatesEmailPreferenceService: jest.fn(),
}));
jest.mock('../notifications/notification-service.client', () => ({ NotificationServiceClient: jest.fn() }));
jest.mock('../demo-days/demo-days.service', () => ({ DemoDaysService: jest.fn() }));
jest.mock('../demo-days/demo-day-engagement.service', () => ({ DemoDayEngagementService: jest.fn() }));
jest.mock('../member-experiences/member-experiences.service', () => ({ MemberExperiencesService: jest.fn() }));
jest.mock('../follows/follows.service', () => ({ FollowsService: jest.fn() }));
jest.mock('../job-openings/job-openings-saved.service', () => ({ JobOpeningsSavedService: jest.fn() }));
jest.mock('../job-openings/job-openings-query.service', () => ({ JobOpeningsQueryService: jest.fn() }));
jest.mock('../job-alerts/job-alerts.service', () => ({ JobAlertsService: jest.fn() }));
jest.mock('../analytics/service/analytics.service', () => ({ AnalyticsService: jest.fn() }));
jest.mock('../access-control-v2/services/access-control-v2.service', () => ({ AccessControlV2Service: jest.fn() }));
jest.mock('../master-profile/master-profile.service', () => ({ MasterProfileService: jest.fn() }));
jest.mock('../warm-intros-v2/warm-intros-v2.service', () => ({ WarmIntrosV2Service: jest.fn() }));
jest.mock('../members/members.service', () => ({ MembersService: jest.fn() }));
jest.mock('../teams/teams.service', () => ({ TeamsService: jest.fn() }));
jest.mock('../projects/projects.service', () => ({ ProjectsService: jest.fn() }));
jest.mock('../pl-events/pl-events.service', () => ({ PLEventsService: jest.fn() }));
jest.mock('../pl-events/pl-event-guests.service', () => ({ PLEventGuestsService: jest.fn() }));
jest.mock('../pl-events/pl-event-locations.service', () => ({ PLEventLocationsService: jest.fn() }));
jest.mock('../ai-apps/ai-apps.service', () => ({ AiAppsService: jest.fn() }));
jest.mock('../spv-spotlights/pl-network-portfolio.service', () => ({ PlNetworkPortfolioService: jest.fn() }));
jest.mock('./mcp-oauth.service', () => ({ McpOAuthService: jest.fn() }));
jest.mock('../members/members.hooks.service', () => ({ MembersHooksService: jest.fn() }));
jest.mock('../team-news/team-news.service', () => ({ TeamNewsService: jest.fn() }));
jest.mock('../team-news/team-news-query.service', () => ({ TeamNewsQueryService: jest.fn() }));
jest.mock('../team-news/team-news-suggestions.service', () => ({ TeamNewsSuggestionsService: jest.fn() }));
jest.mock('../team-news/team-news-upvotes.service', () => ({ TeamNewsUpvotesService: jest.fn() }));
jest.mock('../members/investor-profile.service', () => ({ InvestorProfileService: jest.fn() }));
jest.mock('../participants-request/participants-request.service', () => ({ ParticipantsRequestService: jest.fn() }));
jest.mock('../team-enrichment/team-enrichment.service', () => ({ TeamEnrichmentService: jest.fn() }));
jest.mock('../asks/asks.service', () => ({ AskService: jest.fn() }));
jest.mock('../events/events.service', () => ({ EventsService: jest.fn() }));
jest.mock('../articles/article-comments.service', () => ({ ArticleCommentsService: jest.fn() }));
jest.mock('../article-requests/article-requests.service', () => ({ ArticleRequestsService: jest.fn() }));
jest.mock('../deal-requests/deal-requests.service', () => ({ DealRequestsService: jest.fn() }));
jest.mock('../contact-support/contact-support.service', () => ({ ContactSupportService: jest.fn() }));
jest.mock('../spv-spotlights/spv-spotlights.service', () => ({ SpvSpotlightsService: jest.fn() }));
jest.mock('../job-openings/job-openings-application.service', () => ({ JobOpeningsApplicationService: jest.fn() }));
jest.mock('../job-openings/job-openings-interest.service', () => ({ JobOpeningsInterestService: jest.fn() }));
jest.mock('../job-openings/job-openings-referral.service', () => ({ JobOpeningsReferralService: jest.fn() }));
jest.mock('../job-match/job-match.service', () => ({ JobMatchService: jest.fn() }));
jest.mock('../team-hiring/team-hiring.service', () => ({ TeamHiringService: jest.fn() }));
jest.mock('../pathfinder/pathfinder.service', () => ({ PathfinderService: jest.fn() }));
jest.mock('../investor-lists/investor-lists.service', () => ({ InvestorListsService: jest.fn() }));
jest.mock('../founder-sourcing/founder-sourcing-review.service', () => ({ FounderSourcingReviewService: jest.fn() }));
jest.mock('../roadmap/roadmap.service', () => ({ RoadmapService: jest.fn() }));
jest.mock('../roadmap/roadmap-pins.service', () => ({ RoadmapPinsService: jest.fn() }));
jest.mock('../warm-intros-v2/warm-intros-v2-regenerate.service', () => ({ WarmIntrosV2RegenerateService: jest.fn() }));
jest.mock('../ai-apps/ai-apps-access.service', () => ({ AiAppsAccessService: jest.fn() }));
jest.mock('../team-pitches/team-pitches.service', () => ({ TeamPitchesService: jest.fn() }));
jest.mock('../team-pitches/team-pitch-engagement.service', () => ({ TeamPitchEngagementService: jest.fn() }));

import { McpToolCatalog } from './mcp-tool-catalog';
import { toolsForPermissions } from './mcp-tools';
import BEFORE from './mcp-tool-catalog.spec.fixture.json';

/**
 * LAB-3299 prep: the MCP server and the LabOS agent share one tool list. The fixture holds the exact tool names
 * that `toolsForPermissions` gave the MCP controller for each test role before the move (captured on 653497a).
 */
const ROLES: Record<keyof typeof BEFORE, string[]> = {
  none: [],
  forum_reader: ['forum.read'],
  forum_writer: ['forum.read', 'forum.write'],
  investor_viewer: ['investor_db.view'],
  investor_editor: ['investor_db.edit'],
  directory_admin: ['directory.admin.full', 'forum.read', 'forum.write'],
};

describe('McpToolCatalog (LAB-3299)', () => {
  const catalog = new McpToolCatalog(...(Array(60).fill({}) as ConstructorParameters<typeof McpToolCatalog>));

  it.each(Object.keys(ROLES) as Array<keyof typeof BEFORE>)('lists the same tools as before for role %s', (role) => {
    const names = catalog.forPermissions(new Set(ROLES[role])).map((tool) => tool.name);
    expect(names).toEqual(BEFORE[role]);
  });

  it('applies the same RBAC filter as toolsForPermissions', () => {
    const permissions = new Set(ROLES.forum_writer);
    expect(catalog.forPermissions(permissions).map((t) => t.name)).toEqual(
      toolsForPermissions(permissions, catalog.all()).map((t) => t.name)
    );
  });

  it('has unique tool names', () => {
    const names = catalog.all().map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
