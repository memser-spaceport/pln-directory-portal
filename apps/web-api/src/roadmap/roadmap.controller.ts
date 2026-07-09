import { Body, Controller, ForbiddenException, Req, UseGuards } from '@nestjs/common';
import { Api, initNestServer } from '@ts-rest/nest';
import { Request } from 'express';
import { apiRoadmap } from 'libs/contracts/src/lib/contract-roadmap';
import {
  ArchiveRoadmapItemSchema,
  CreateRoadmapItemSchema,
  CreateRoadmapObjectiveSchema,
  DeclineRoadmapItemSchema,
  PinRoadmapItemSchema,
  ReorderRoadmapItemsSchema,
  RoadmapItemListQueryParams,
  SetRoadmapItemObjectivesSchema,
  TransitionRoadmapItemSchema,
  UpdatePinNoteSchema,
  UpdateRoadmapItemSchema,
  UpdateRoadmapSettingsSchema,
  UpsertRoadmapDraftSchema,
} from 'libs/contracts/src/schema/roadmap';
import { NoCache } from '../decorators/no-cache.decorator';
import { UserTokenCheckGuard } from '../guards/user-token-check.guard';
import { MembersService } from '../members/members.service';
import { RbacGuard } from '../rbac/rbac.guard';
import { RequirePermissions } from '../rbac/rbac.decorator';
import { ADMIN_PERMISSIONS, ROADMAP_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { RoadmapDraftsService } from './roadmap-drafts.service';
import { RoadmapObjectivesService } from './roadmap-objectives.service';
import { RoadmapPinsService } from './roadmap-pins.service';
import { RoadmapService } from './roadmap.service';

const server = initNestServer(apiRoadmap);

const VIEW = { anyOf: [ROADMAP_PERMISSIONS.VIEW] };
const CREATE = { anyOf: [ROADMAP_PERMISSIONS.IDEA_CREATE] };
const UPVOTE = { anyOf: [ROADMAP_PERMISSIONS.ITEM_UPVOTE] };
const TRANSITION = { anyOf: [ROADMAP_PERMISSIONS.ITEM_TRANSITION] };
const CURATE = { anyOf: [ROADMAP_PERMISSIONS.ITEM_CURATE, ADMIN_PERMISSIONS.DIRECTORY_FULL] };

@Controller()
@UseGuards(UserTokenCheckGuard, RbacGuard)
export class RoadmapController {
  constructor(
    private readonly roadmapService: RoadmapService,
    private readonly roadmapPinsService: RoadmapPinsService,
    private readonly roadmapObjectivesService: RoadmapObjectivesService,
    private readonly roadmapDraftsService: RoadmapDraftsService,
    private readonly membersService: MembersService
  ) {}

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

  @Api(server.route.trackBuildButtonClick)
  @RequirePermissions(VIEW)
  async trackBuildButtonClick(@Req() req: Request) {
    const member = await this.resolveMember(req);
    await this.roadmapService.trackBuildButtonClick(req.params.uid, member.uid);
    return { status: 204 as const, body: undefined };
  }

  @Api(server.route.reorderRoadmapItems)
  @RequirePermissions(CURATE)
  async reorderRoadmapItems(@Body() body: unknown, @Req() req: Request) {
    const member = await this.resolveMember(req);
    const parsed = ReorderRoadmapItemsSchema.parse(body);
    return this.roadmapService.reorderItems(parsed, member.uid);
  }

  @Api(server.route.pinRoadmapItem)
  @RequirePermissions(UPVOTE)
  async pinRoadmapItem(@Body() body: unknown, @Req() req: Request) {
    const member = await this.resolveMember(req);
    const parsed = PinRoadmapItemSchema.parse(body ?? {});
    return this.roadmapPinsService.pinItem(req.params.uid, parsed, member.uid);
  }

  @Api(server.route.unpinRoadmapItem)
  @RequirePermissions(UPVOTE)
  async unpinRoadmapItem(@Req() req: Request) {
    const member = await this.resolveMember(req);
    return this.roadmapPinsService.unpinItem(req.params.uid, member.uid);
  }

  @Api(server.route.updateRoadmapPinNote)
  @RequirePermissions(UPVOTE)
  async updateRoadmapPinNote(@Body() body: unknown, @Req() req: Request) {
    const member = await this.resolveMember(req);
    const parsed = UpdatePinNoteSchema.parse(body);
    return this.roadmapPinsService.updatePinNote(req.params.uid, parsed.note, member.uid);
  }

  @Api(server.route.getMyRoadmapPinBalance)
  @RequirePermissions(VIEW)
  @NoCache()
  async getMyRoadmapPinBalance(@Req() req: Request) {
    const member = await this.resolveMember(req);
    return this.roadmapPinsService.getMyBalance(member.uid);
  }

  @Api(server.route.listRoadmapItemPinners)
  @RequirePermissions(CURATE)
  @NoCache()
  async listRoadmapItemPinners(@Req() req: Request) {
    const member = await this.resolveMember(req);
    return this.roadmapPinsService.listItemPinners(req.params.uid, member.uid);
  }

  @Api(server.route.listRoadmapObjectives)
  @RequirePermissions(VIEW)
  @NoCache()
  async listRoadmapObjectives(@Req() req: Request) {
    await this.resolveMember(req);
    return this.roadmapObjectivesService.listObjectives();
  }

  @Api(server.route.createRoadmapObjective)
  @RequirePermissions(CURATE)
  async createRoadmapObjective(@Body() body: unknown, @Req() req: Request) {
    const member = await this.resolveMember(req);
    const parsed = CreateRoadmapObjectiveSchema.parse(body);
    return this.roadmapObjectivesService.createObjective(parsed, member.uid);
  }

  @Api(server.route.setRoadmapItemObjectives)
  @RequirePermissions(CURATE)
  async setRoadmapItemObjectives(@Body() body: unknown, @Req() req: Request) {
    const member = await this.resolveMember(req);
    const parsed = SetRoadmapItemObjectivesSchema.parse(body ?? {});
    return this.roadmapObjectivesService.setItemObjectives(req.params.uid, parsed, member.uid);
  }

  @Api(server.route.getRoadmapSettings)
  @RequirePermissions(VIEW)
  @NoCache()
  async getRoadmapSettings(@Req() req: Request) {
    await this.resolveMember(req);
    return this.roadmapPinsService.getSettings();
  }

  @Api(server.route.updateRoadmapSettings)
  @RequirePermissions(CURATE)
  async updateRoadmapSettings(@Body() body: unknown, @Req() req: Request) {
    const member = await this.resolveMember(req);
    const parsed = UpdateRoadmapSettingsSchema.parse(body);
    return this.roadmapPinsService.updateSettings(parsed, member.uid);
  }

  @Api(server.route.getMyRoadmapDraft)
  @RequirePermissions(VIEW)
  @NoCache()
  async getMyRoadmapDraft(@Req() req: Request) {
    const member = await this.resolveMember(req);
    return this.roadmapDraftsService.getMyDraft(member.uid);
  }

  @Api(server.route.upsertMyRoadmapDraft)
  @RequirePermissions(VIEW)
  async upsertMyRoadmapDraft(@Body() body: unknown, @Req() req: Request) {
    const member = await this.resolveMember(req);
    const parsed = UpsertRoadmapDraftSchema.parse(body ?? {});
    return this.roadmapDraftsService.upsertMyDraft(parsed, member.uid);
  }

  @Api(server.route.deleteMyRoadmapDraft)
  @RequirePermissions(VIEW)
  async deleteMyRoadmapDraft(@Req() req: Request) {
    const member = await this.resolveMember(req);
    return this.roadmapDraftsService.discardMyDraft(member.uid);
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
