import { Body, Controller, ForbiddenException, Logger, Param, Req, UseGuards } from '@nestjs/common';
import { Api, initNestServer } from '@ts-rest/nest';
import { Request } from 'express';
import { apiFeed } from 'libs/contracts/src/lib/contract-feed';
import {
  CreateFeedCommentRequestSchema,
  FeedCommentCountsRequestSchema,
  FeedCommentsQueryParams,
  FeedForumPostsQueryParams,
} from 'libs/contracts/src/schema/feed';
import { NoCache } from '../decorators/no-cache.decorator';
import { UserTokenCheckGuard } from '../guards/user-token-check.guard';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { MembersService } from '../members/members.service';
import { AccessControlV2Service } from '../access-control-v2/services/access-control-v2.service';
import { FORUM_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { FeedForumPostsService } from './feed-forum-posts.service';
import { FeedCommentsService } from './feed-comments.service';
import { FeedLikesService } from './feed-likes.service';

const server = initNestServer(apiFeed);

@Controller()
export class FeedController {
  private readonly logger = new Logger(FeedController.name);

  constructor(
    private readonly feedForumPostsService: FeedForumPostsService,
    private readonly feedCommentsService: FeedCommentsService,
    private readonly feedLikesService: FeedLikesService,
    private readonly membersService: MembersService,
    private readonly accessControl: AccessControlV2Service
  ) {}

  @Api(server.route.getFeedForumPosts)
  @NoCache()
  @UseGuards(UserTokenCheckGuard)
  async getFeedForumPosts(@Req() req: Request & { userEmail?: string }) {
    const params = FeedForumPostsQueryParams.parse(req.query);

    const canReadForum = await this.hasForumReadPermission(req.userEmail);
    if (!canReadForum) {
      // Degrade gracefully — omit forum posts entirely rather than 403,
      // matching search.controller.ts's handling of gated forum content.
      return { items: [] };
    }

    const member = req.userEmail ? await this.membersService.findMemberByEmail(req.userEmail) : null;
    return this.feedForumPostsService.listForumPosts(params, member?.uid);
  }

  @Api(server.route.getFeedCommentCounts)
  @NoCache()
  async getFeedCommentCounts(@Body() body: unknown) {
    const { uids } = FeedCommentCountsRequestSchema.parse(body);
    return this.feedCommentsService.getCommentCounts(uids);
  }

  @Api(server.route.getFeedComments)
  @NoCache()
  @UseGuards(UserTokenCheckGuard)
  async getFeedComments(@Req() req: Request & { userEmail?: string }) {
    const { itemUid } = FeedCommentsQueryParams.parse(req.query);
    const member = req.userEmail ? await this.membersService.findMemberByEmail(req.userEmail) : null;
    return this.feedCommentsService.listComments(itemUid, member?.uid);
  }

  @Api(server.route.createFeedComment)
  @UseGuards(UserTokenValidation)
  async createFeedComment(@Req() req: Request & { userEmail?: string }, @Body() body: unknown) {
    const validated = CreateFeedCommentRequestSchema.parse(body);
    const member = await this.resolveMember(req);
    return this.feedCommentsService.createComment(member.uid, validated);
  }

  @Api(server.route.deleteFeedComment)
  @UseGuards(UserTokenValidation)
  async deleteFeedComment(@Param('commentUid') commentUid: string, @Req() req: Request & { userEmail?: string }) {
    const member = await this.resolveMember(req);
    return this.feedCommentsService.deleteComment(member.uid, commentUid);
  }

  @Api(server.route.likeFeedForumPost)
  @UseGuards(UserTokenValidation)
  async likeFeedForumPost(@Param('uid') uid: string, @Req() req: Request & { userEmail?: string }) {
    const member = await this.resolveMember(req);
    return this.feedLikesService.like(member.uid, uid);
  }

  @Api(server.route.unlikeFeedForumPost)
  @UseGuards(UserTokenValidation)
  async unlikeFeedForumPost(@Param('uid') uid: string, @Req() req: Request & { userEmail?: string }) {
    const member = await this.resolveMember(req);
    return this.feedLikesService.unlike(member.uid, uid);
  }

  private async hasForumReadPermission(userEmail?: string): Promise<boolean> {
    if (!userEmail) return false;
    try {
      const { allowed } = await this.accessControl.hasPermissionByEmail(userEmail, FORUM_PERMISSIONS.READ);
      return allowed;
    } catch {
      return false;
    }
  }

  private async resolveMember(req: Request & { userEmail?: string }) {
    if (!req.userEmail) {
      throw new ForbiddenException('Authenticated member required');
    }
    const member = await this.membersService.findMemberByEmail(req.userEmail);
    if (!member) {
      this.logger.warn(`Feed request from authenticated email ${req.userEmail} that is not a member`);
      throw new ForbiddenException('Member not found');
    }
    return member;
  }
}
