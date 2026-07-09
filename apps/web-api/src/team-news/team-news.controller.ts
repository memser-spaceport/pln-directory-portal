import { Body, Controller, ForbiddenException, Logger, Param, Req, UseGuards } from '@nestjs/common';
import { Api, initNestServer } from '@ts-rest/nest';
import { Request } from 'express';
import { apiTeamNews } from 'libs/contracts/src/lib/contract-team-news';
import {
  CreateTeamNewsDiscussionRequestSchema,
  TeamNewsByTeamQueryParams,
  TeamNewsFollowSuggestionsQueryParams,
  TeamNewsListQueryParams,
  TeamNewsPopularQueryParams,
  TeamNewsRecentQueryParams,
} from 'libs/contracts/src/schema/team-news';
import { NoCache } from '../decorators/no-cache.decorator';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { UserTokenCheckGuard } from '../guards/user-token-check.guard';
import { MembersService } from '../members/members.service';
import { AccessControlV2Service } from '../access-control-v2/services/access-control-v2.service';
import { FORUM_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { FollowsService } from '../follows/follows.service';
import { TeamNewsQueryService } from './team-news-query.service';
import { TeamNewsService } from './team-news.service';
import { TeamNewsUpvotesService } from './team-news-upvotes.service';
import { TeamNewsSuggestionsService } from './team-news-suggestions.service';

const server = initNestServer(apiTeamNews);

@Controller()
export class TeamNewsController {
  private readonly logger = new Logger(TeamNewsController.name);

  constructor(
    private readonly teamNewsQueryService: TeamNewsQueryService,
    private readonly teamNewsService: TeamNewsService,
    private readonly teamNewsUpvotesService: TeamNewsUpvotesService,
    private readonly teamNewsSuggestionsService: TeamNewsSuggestionsService,
    private readonly membersService: MembersService,
    private readonly accessControl: AccessControlV2Service,
    private readonly followsService: FollowsService
  ) {}

  @Api(server.route.getTeamNews)
  @NoCache()
  @UseGuards(UserTokenCheckGuard)
  async getTeamNews(@Req() request: Request & { userEmail?: string }) {
    const params = TeamNewsListQueryParams.parse(request.query);
    const { followed, memberUid } = await this.resolveViewerContext(request.userEmail);
    return this.teamNewsQueryService.listTeamNews(params, followed, memberUid);
  }

  @Api(server.route.getTeamNewsGrouped)
  @NoCache()
  @UseGuards(UserTokenCheckGuard)
  async getTeamNewsGrouped(@Req() request: Request & { userEmail?: string }) {
    const params = TeamNewsListQueryParams.parse(request.query);
    const { followed, memberUid } = await this.resolveViewerContext(request.userEmail);
    return this.teamNewsQueryService.listGroupedByFocusArea(params, followed, memberUid);
  }

  @Api(server.route.getTeamNewsFilters)
  @NoCache()
  async getTeamNewsFilters(@Req() request: Request) {
    const params = TeamNewsListQueryParams.parse(request.query);
    return this.teamNewsQueryService.getFilters(params);
  }

  // The notification service pulls this at digest-cron time
  // to build the "Latest Network News" email section. Selection is by the
  // ingestion-time watermark window (sinceCreatedAt, untilCreatedAt].
  @Api(server.route.getTeamNewsRecent)
  @NoCache()
  async getTeamNewsRecent(@Req() request: Request) {
    const { sinceCreatedAt, untilCreatedAt, limit } = TeamNewsRecentQueryParams.parse(request.query);
    const toDate = (value?: string): Date | undefined => {
      if (!value) return undefined;
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? undefined : d;
    };
    return this.teamNewsQueryService.getRecentNews({
      sinceCreatedAt: toDate(sinceCreatedAt),
      untilCreatedAt: toDate(untilCreatedAt),
      limit,
    });
  }

  @Api(server.route.getTeamNewsFollowSuggestions)
  @NoCache()
  @UseGuards(UserTokenValidation)
  async getTeamNewsFollowSuggestions(@Req() req: Request & { userEmail?: string }) {
    const { limit } = TeamNewsFollowSuggestionsQueryParams.parse(req.query);
    const member = await this.resolveMember(req);
    return this.teamNewsSuggestionsService.getFollowSuggestions(member.uid, limit);
  }

  @Api(server.route.getTeamNewsPopular)
  @NoCache()
  @UseGuards(UserTokenCheckGuard)
  async getTeamNewsPopular(@Req() request: Request) {
    const params = TeamNewsPopularQueryParams.parse(request.query);
    return this.teamNewsQueryService.getPopular(params);
  }

  @Api(server.route.getTeamNewsByTeam)
  @NoCache()
  @UseGuards(UserTokenCheckGuard)
  async getTeamNewsByTeam(@Param('teamUid') teamUid: string, @Req() request: Request & { userEmail?: string }) {
    const params = TeamNewsByTeamQueryParams.parse(request.query);
    const { followed, memberUid } = await this.resolveViewerContext(request.userEmail);
    return this.teamNewsQueryService.listTeamNewsByTeam(teamUid, params, followed, memberUid);
  }

  @Api(server.route.upvoteTeamNews)
  @UseGuards(UserTokenValidation)
  async upvoteTeamNews(@Param('newsItemUid') newsItemUid: string, @Req() req: Request & { userEmail?: string }) {
    const member = await this.resolveMember(req);
    return this.teamNewsUpvotesService.upvote(member.uid, newsItemUid);
  }

  @Api(server.route.removeTeamNewsUpvote)
  @UseGuards(UserTokenValidation)
  async removeTeamNewsUpvote(@Param('newsItemUid') newsItemUid: string, @Req() req: Request & { userEmail?: string }) {
    const member = await this.resolveMember(req);
    return this.teamNewsUpvotesService.removeUpvote(member.uid, newsItemUid);
  }

  @Api(server.route.createTeamNewsDiscussion)
  @UseGuards(UserTokenValidation)
  async createTeamNewsDiscussion(
    @Param('newsItemUid') newsItemUid: string,
    @Body() body: unknown,
    @Req() req: Request & { userEmail?: string }
  ) {
    const validated = CreateTeamNewsDiscussionRequestSchema.parse(body);

    if (!req.userEmail) {
      throw new ForbiddenException('Authenticated user required to create a news-discussion link');
    }
    const member = await this.membersService.findMemberByEmail(req.userEmail);
    if (!member) {
      this.logger.warn(`createTeamNewsDiscussion: authenticated email ${req.userEmail} not found as a member`);
      throw new ForbiddenException('Member not found');
    }

    // Gate the write on forum.write. The forum-post create that produced
    // this link is itself gated on forum.write upstream, so any honest
    // caller already has it; the check here defends against malicious
    // callers attempting to attach arbitrary forum topics to news items.
    const access = await this.accessControl.hasPermission(member.uid, FORUM_PERMISSIONS.WRITE);
    if (!access.allowed) {
      throw new ForbiddenException(`forum.write permission required to link a news item to a forum topic`);
    }

    return this.teamNewsService.createForumLink(newsItemUid, validated, member.uid);
  }

  private async resolveViewerContext(userEmail?: string): Promise<{ followed: Set<string>; memberUid?: string }> {
    if (!userEmail) {
      return { followed: new Set() };
    }
    const member = await this.membersService.findMemberByEmail(userEmail);
    if (!member) {
      return { followed: new Set() };
    }
    const followed = await this.followsService.getFollowedTeamUids(member.uid);
    return { followed, memberUid: member.uid };
  }

  private async resolveMember(req: Request & { userEmail?: string }) {
    if (!req.userEmail) {
      throw new ForbiddenException('Authenticated member required');
    }
    const member = await this.membersService.findMemberByEmail(req.userEmail);
    if (!member) {
      this.logger.warn(`Team news request from authenticated email ${req.userEmail} that is not a member`);
      throw new ForbiddenException('Member not found');
    }
    return member;
  }
}
