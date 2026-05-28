import { Body, Controller, ForbiddenException, Req, UseGuards } from '@nestjs/common';
import { Api, initNestServer } from '@ts-rest/nest';
import { Request } from 'express';
import { apiRoadmap } from 'libs/contracts/src/lib/contract-roadmap';
import {
  ArchiveRoadmapItemSchema,
  CreateRoadmapItemSchema,
  DeclineRoadmapItemSchema,
  RoadmapItemListQueryParams,
  RoadmapUpvoteSchema,
  TransitionRoadmapItemSchema,
  UpdateRoadmapItemSchema,
} from 'libs/contracts/src/schema/roadmap';
import { NoCache } from '../decorators/no-cache.decorator';
import { UserTokenCheckGuard } from '../guards/user-token-check.guard';
import { MembersService } from '../members/members.service';
import { RbacGuard } from '../rbac/rbac.guard';
import { RequirePermissions } from '../rbac/rbac.decorator';
import { ROADMAP_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { RoadmapService } from './roadmap.service';

const server = initNestServer(apiRoadmap);

const VIEW = { anyOf: [ROADMAP_PERMISSIONS.VIEW] };
const CREATE = { anyOf: [ROADMAP_PERMISSIONS.IDEA_CREATE] };
const UPVOTE = { anyOf: [ROADMAP_PERMISSIONS.ITEM_UPVOTE] };
const TRANSITION = { anyOf: [ROADMAP_PERMISSIONS.ITEM_TRANSITION] };

@Controller()
@UseGuards(UserTokenCheckGuard, RbacGuard)
export class RoadmapController {
  constructor(private readonly roadmapService: RoadmapService, private readonly membersService: MembersService) {}

  @Api(server.route.listRoadmapItems)
  @RequirePermissions(VIEW)
  @NoCache()
  async listRoadmapItems(@Req() req: Request) {
    const member = await this.resolveMember(req);
    const query = RoadmapItemListQueryParams.parse(req.query);
    return this.roadmapService.listItems(query, member.uid);
  }

  @Api(server.route.getRoadmapItem)
  @RequirePermissions(VIEW)
  @NoCache()
  async getRoadmapItem(@Req() req: Request) {
    const member = await this.resolveMember(req);
    const uid = req.params.uid;
    return this.roadmapService.getItem(uid, member.uid);
  }

  @Api(server.route.createRoadmapItem)
  @RequirePermissions(CREATE)
  async createRoadmapItem(@Body() body: unknown, @Req() req: Request) {
    const member = await this.resolveMember(req);
    const parsed = CreateRoadmapItemSchema.parse(body);
    return await this.roadmapService.createItem(parsed, member.uid);
  }

  @Api(server.route.updateRoadmapItem)
  @RequirePermissions(VIEW)
  async updateRoadmapItem(@Body() body: unknown, @Req() req: Request) {
    const member = await this.resolveMember(req);
    const parsed = UpdateRoadmapItemSchema.parse(body);
    return this.roadmapService.updateItem(req.params.uid, parsed, member.uid);
  }

  @Api(server.route.archiveRoadmapItem)
  @RequirePermissions(VIEW)
  async archiveRoadmapItem(@Body() body: unknown, @Req() req: Request) {
    const member = await this.resolveMember(req);
    const parsed = ArchiveRoadmapItemSchema.parse(body ?? {});
    return this.roadmapService.archiveItem(req.params.uid, parsed, member.uid);
  }

  @Api(server.route.promoteRoadmapItem)
  @RequirePermissions(TRANSITION)
  async promoteRoadmapItem(@Req() req: Request) {
    const member = await this.resolveMember(req);
    return this.roadmapService.promoteItem(req.params.uid, member.uid);
  }

  @Api(server.route.declineRoadmapItem)
  @RequirePermissions(TRANSITION)
  async declineRoadmapItem(@Body() body: unknown, @Req() req: Request) {
    const member = await this.resolveMember(req);
    const parsed = DeclineRoadmapItemSchema.parse(body);
    return this.roadmapService.declineItem(req.params.uid, parsed, member.uid);
  }

  @Api(server.route.transitionRoadmapItem)
  @RequirePermissions(TRANSITION)
  async transitionRoadmapItem(@Body() body: unknown, @Req() req: Request) {
    const member = await this.resolveMember(req);
    const parsed = TransitionRoadmapItemSchema.parse(body);
    return this.roadmapService.transitionItem(req.params.uid, parsed, member.uid);
  }

  @Api(server.route.addRoadmapUpvote)
  @RequirePermissions(UPVOTE)
  async addRoadmapUpvote(@Body() body: unknown, @Req() req: Request) {
    const member = await this.resolveMember(req);
    const parsed = RoadmapUpvoteSchema.parse(body ?? {});
    return this.roadmapService.addUpvote(req.params.uid, parsed.note, member.uid);
  }

  @Api(server.route.removeRoadmapUpvote)
  @RequirePermissions(UPVOTE)
  async removeRoadmapUpvote(@Req() req: Request) {
    const member = await this.resolveMember(req);
    return this.roadmapService.removeUpvote(req.params.uid, member.uid);
  }

  @Api(server.route.trackBuildButtonClick)
  @RequirePermissions(VIEW)
  async trackBuildButtonClick(@Req() req: Request) {
    const member = await this.resolveMember(req);
    await this.roadmapService.trackBuildButtonClick(req.params.uid, member.uid);
    return { status: 204 as const, body: undefined };
  }

  private async resolveMember(req: Request & { userEmail?: string }) {
    if (!req.userEmail) {
      throw new ForbiddenException('Authenticated member required');
    }
    const member = await this.membersService.findMemberByEmail(req.userEmail);
    if (!member) {
      throw new ForbiddenException('Member not found');
    }
    return member;
  }
}
