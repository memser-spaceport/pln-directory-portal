import { Body, Controller, ForbiddenException, Logger, Param, Req, UseGuards } from '@nestjs/common';
import { Api, initNestServer } from '@ts-rest/nest';
import { Request } from 'express';
import { apiTeamNews } from 'libs/contracts/src/lib/contract-team-news';
import {
  CreateTeamNewsDiscussionRequestSchema,
  TeamNewsByTeamQueryParams,
  TeamNewsListQueryParams,
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

const server = initNestServer(apiTeamNews);

@Controller()
export class TeamNewsController {
  private readonly logger = new Logger(TeamNewsController.name);

  constructor(
    private readonly teamNewsQueryService: TeamNewsQueryService,
    private readonly teamNewsService: TeamNewsService,
    private readonly membersService: MembersService,
    private readonly accessControl: AccessControlV2Service,
    private readonly followsService: FollowsService
  ) {}

  @Api(server.route.getTeamNews)
  @NoCache()
  @UseGuards(UserTokenCheckGuard)
  async getTeamNews(@Req() request: Request & { userEmail?: string }) {
    const params = TeamNewsListQueryParams.parse(request.query);
    const followed = await this.resolveFollowedTeamUids(request.userEmail);
    return this.teamNewsQueryService.listTeamNews(params, followed);
  }

  @Api(server.route.getTeamNewsGrouped)
  @NoCache()
  @UseGuards(UserTokenCheckGuard)
  async getTeamNewsGrouped(@Req() request: Request & { userEmail?: string }) {
    const params = TeamNewsListQueryParams.parse(request.query);
    const followed = await this.resolveFollowedTeamUids(request.userEmail);
    return this.teamNewsQueryService.listGroupedByFocusArea(params, followed);
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

  @Api(server.route.getTeamNewsByTeam)
  @NoCache()
  @UseGuards(UserTokenCheckGuard)
  async getTeamNewsByTeam(@Param('teamUid') teamUid: string, @Req() request: Request & { userEmail?: string }) {
    const params = TeamNewsByTeamQueryParams.parse(request.query);
    const followed = await this.resolveFollowedTeamUids(request.userEmail);
    return this.teamNewsQueryService.listTeamNewsByTeam(teamUid, params, followed);
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

  /**
   * Resolve the authenticated caller's followed-team UIDs (empty set when
   * anonymous or not a member). Used to stamp `isFollowed` and order
   * followed-team news first on the public news endpoints.
   */
  private async resolveFollowedTeamUids(userEmail?: string): Promise<Set<string>> {
    if (!userEmail) {
      return new Set();
    }
    const member = await this.membersService.findMemberByEmail(userEmail);
    if (!member) {
      return new Set();
    }
    return this.followsService.getFollowedTeamUids(member.uid);
  }
}
