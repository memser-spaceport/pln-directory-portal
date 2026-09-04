import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { AdminAuthGuard, DemoDayAdminAuthGuard } from '../guards/admin-auth.guard';

import { ZodValidationPipe } from '@abitia/zod-dto';
import {
  CreateMemberDto,
  MemberStateCounts,
  RequestMembersDto,
  UpdateMemberDto,
} from 'libs/contracts/src/schema/admin-member';
import { NoCache } from '../decorators/no-cache.decorator';
import { Member } from '@prisma/client';
import { MemberService } from './member.service';
import { UpdateMemberRolesDto } from './dto/update-member-roles.dto';
import { UpdateMemberRolesAndHostsDto } from './dto/update-member-roles-and-hosts.dto';
import { MemberBioRefreshService } from '../husky/member-bio-refresh.service';
import { MemberEnrichmentService } from '../member-enrichment/member-enrichment.service';
import { MemberEnrichmentJob } from '../member-enrichment/member-enrichment.job';
import { MemberEnrichmentSourcePreference } from '../member-enrichment/member-enrichment.types';

const MEMBER_ENRICHMENT_SOURCE_VALUES: MemberEnrichmentSourcePreference[] = ['auto', 'coresignal', 'scrapingdog'];

function parseEnrichmentSource(raw: unknown): MemberEnrichmentSourcePreference {
  if (raw === undefined || raw === null) return 'auto';
  if (typeof raw === 'string' && (MEMBER_ENRICHMENT_SOURCE_VALUES as string[]).includes(raw)) {
    return raw as MemberEnrichmentSourcePreference;
  }
  throw new BadRequestException(`source must be one of: ${MEMBER_ENRICHMENT_SOURCE_VALUES.join(', ')}`);
}

@Controller('v1/admin/members')
export class MemberController {
  constructor(
    private readonly memberService: MemberService,
    private readonly memberBioRefreshService: MemberBioRefreshService,
    private readonly memberEnrichmentService: MemberEnrichmentService,
    private readonly memberEnrichmentJob: MemberEnrichmentJob
  ) {}

  @Get()
  @UseGuards(DemoDayAdminAuthGuard)
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async getMembers(@Query() query: RequestMembersDto) {
    return await this.memberService.findMembers(query);
  }

  @Get('member-state-counts')
  @UseGuards(DemoDayAdminAuthGuard)
  @NoCache()
  async getMemberStateCounts(): Promise<MemberStateCounts> {
    return this.memberService.getMemberStateCounts();
  }

  @Get('sign-up-sources')
  @UseGuards(DemoDayAdminAuthGuard)
  @NoCache()
  async getSignUpSources(): Promise<string[]> {
    return this.memberService.getSignUpSources();
  }

  /**
   * Count of members whose bio carries the AI-generated disclaimer, plus the
   * in-flight/last bio-refresh run. Cheap; poll this while a refresh runs.
   */
  @Get('ai-bios/status')
  @UseGuards(AdminAuthGuard)
  @NoCache()
  async getAiBioRefreshStatus() {
    return this.memberBioRefreshService.getStatus();
  }

  /**
   * Refreshes AI-generated member bios with correct gender handling.
   * Defaults to dryRun (report only, zero paid calls) — pass dryRun: false to
   * regenerate and save. An apply run executes in the background; progress is
   * polled via GET ai-bios/status.
   */
  @Post('ai-bios/refresh')
  @UseGuards(AdminAuthGuard)
  @NoCache()
  async triggerAiBioRefresh(@Body() body: { dryRun?: boolean; limit?: number; emails?: string[]; noScrape?: boolean }) {
    const limit = body?.limit != null ? Number(body.limit) : null;
    if (limit != null && (!Number.isInteger(limit) || limit <= 0)) {
      throw new BadRequestException('limit must be a positive integer');
    }
    return this.memberBioRefreshService.trigger({
      dryRun: body?.dryRun !== false,
      limit,
      emails: Array.isArray(body?.emails) ? body.emails : undefined,
      noScrape: body?.noScrape === true,
    });
  }

  /**
   * Profile-enrichment cron status + pending/in-progress/enriched counts. Cheap;
   * poll this while a trigger runs. See docs/MEMBER_ENRICHMENT.md.
   */
  @Get('profile-enrichment/status')
  @UseGuards(AdminAuthGuard)
  @NoCache()
  async getProfileEnrichmentStatus() {
    const counts = await this.memberEnrichmentService.getEnrichmentCounts();
    return {
      isMarkingRunning: this.memberEnrichmentJob.markingRunning,
      isEnrichmentRunning: this.memberEnrichmentJob.enrichmentRunning,
      ...counts,
    };
  }

  /**
   * Runs profile enrichment (primary team/role, bio, email, skills — gaps only) for a
   * single member in the background. Returns immediately; poll profile-enrichment/status.
   */
  @Post(':uid/trigger-profile-enrichment')
  @UseGuards(AdminAuthGuard)
  @NoCache()
  async triggerProfileEnrichment(@Param('uid') uid: string) {
    return this.memberEnrichmentService.enrichMember(uid, 'manually');
  }

  /** Runs profile enrichment for every member currently marked pending. */
  @Post('trigger-profile-enrichment')
  @UseGuards(AdminAuthGuard)
  @NoCache()
  async triggerProfileEnrichmentForAllPending() {
    return this.memberEnrichmentService.triggerEnrichmentForAllPending('manually');
  }

  /**
   * Marks an explicit list of member uids for force re-enrichment — e.g. a hand-picked list of
   * newly-important fund/team-lead members. Only marks; it does not run the pipeline itself. The
   * marked members are picked up and processed (concurrency-bounded) by the existing hourly
   * enrichment cron, same as a single-member force-trigger.
   *
   * `source` optionally forces which provider to use for every member in this list:
   * `'coresignal'` (always try Coresignal first, still falling back to ScrapingDog on failure),
   * `'scrapingdog'` (never attempt Coresignal for these members), or the default `'auto'`
   * (per-member value-tier heuristic — see docs/MEMBER_ENRICHMENT.md).
   */
  @Post('trigger-force-profile-enrichment-bulk')
  @UseGuards(AdminAuthGuard)
  @NoCache()
  async triggerForceProfileEnrichmentBulk(@Body() body: { uids?: string[]; source?: string }) {
    const uids = Array.isArray(body?.uids)
      ? body.uids.filter((u) => typeof u === 'string' && u.trim().length > 0).map((u) => u.trim())
      : [];
    if (uids.length === 0) {
      throw new BadRequestException('uids must be a non-empty array of member uids');
    }
    const source = parseEnrichmentSource(body?.source);
    return this.memberEnrichmentService.markMembersForForceEnrichment(uids, source);
  }

  /**
   * Re-runs profile enrichment for a member even if already enriched. There is no
   * candidate-column staging in this pipeline (unlike TeamEnrichment), so force always
   * means the same thing: re-check each field's current DB emptiness and fill gaps —
   * fields that already have a value are never overwritten, force or not.
   *
   * `source` optionally forces which provider to use for this member — see
   * `trigger-force-profile-enrichment-bulk` above for the accepted values.
   */
  @Post(':uid/trigger-force-profile-enrichment')
  @UseGuards(AdminAuthGuard)
  @NoCache()
  async triggerForceProfileEnrichment(@Param('uid') uid: string, @Body() body?: { source?: string }) {
    const source = parseEnrichmentSource(body?.source);
    return this.memberEnrichmentService.forceEnrichMember(uid, 'manually', source);
  }

  @Get(':uid')
  @UseGuards(DemoDayAdminAuthGuard)
  @NoCache()
  async getMemberByUid(@Param('uid') uid: string): Promise<any> {
    return await this.memberService.findMemberByUid(uid);
  }

  @Post('/create')
  @UseGuards(DemoDayAdminAuthGuard)
  async addNewMember(@Body() body: any): Promise<Member> {
    return this.memberService.createMemberByAdmin(
      body as CreateMemberDto & {
        roleCodes?: string[];
        policyCodes?: string[];
        permissionCodes?: string[];
      }
    );
  }

  @Patch('/edit/:uid')
  @UseGuards(DemoDayAdminAuthGuard)
  @UsePipes(ZodValidationPipe)
  async editMember(@Param('uid') uid: string, @Body() body: UpdateMemberDto): Promise<string> {
    return this.memberService.updateMemberByAdmin(uid, body);
  }

  /**
   * Updates a member to a verfied user.
   *
   * @param body - array of memberIds to be updated.
   * @returns Array of updation status of the provided memberIds.
   */
  @Post('/')
  @UseGuards(DemoDayAdminAuthGuard)
  async verifyMembers(@Body() body) {
    const requestor = await this.memberService.findMemberByRole();
    const { memberIds } = body;
    return await this.memberService.verifyMembers(memberIds, requestor?.email);
  }

  /**
   * Updates a member to a verfied user.
   *
   * @param body - participation request data with updated member details
   * @returns updated member object
   */
  @Patch('/:uid')
  @UseGuards(DemoDayAdminAuthGuard)
  async updateMemberAndVerify(@Param('uid') uid, @Body() participantsRequest) {
    const requestor = await this.memberService.findMemberByRole();
    const requestorEmail = requestor?.email ?? '';
    return await this.memberService.updateMemberFromParticipantsRequest(uid, participantsRequest, requestorEmail, true);
  }

  /**
   * Updates demo day admin HOST scopes for a member and returns the updated member,
   * including roles and demo day admin scopes.
   *
   * Expects an array of hosts (e.g. ["plnetwork.io", "founders.plnetwork.io"]).
   */
  @Patch(':uid/demo-day-hosts')
  @UseGuards(DemoDayAdminAuthGuard)
  async updateDemoDayAdminHosts(@Param('uid') uid: string, @Body() body: { hosts: string[] }): Promise<Member> {
    return await this.memberService.updateDemoDayAdminHosts(uid, body.hosts || []);
  }

  /**
   * Updates member roles (replaces the whole set) and returns the updated member.
   * Only directory/super admins are allowed to call this endpoint.
   */
  @Patch(':uid/roles')
  @UseGuards(DemoDayAdminAuthGuard)
  async updateMemberRoles(@Param('uid') uid: string, @Body() body: UpdateMemberRolesDto) {
    return await this.memberService.updateMemberRolesByUid(uid, body.roles);
  }

  /**
   * Updates both member roles and demo day admin hosts in a single transaction.
   * More efficient than calling roles and hosts endpoints separately.
   * Only directory/super admins are allowed to call this endpoint.
   */
  @Patch(':uid/roles-and-hosts')
  @UseGuards(DemoDayAdminAuthGuard)
  async updateMemberRolesAndHosts(
    @Param('uid') uid: string,
    @Body() body: UpdateMemberRolesAndHostsDto
  ): Promise<Member> {
    return await this.memberService.updateMemberRolesAndHosts(uid, body.roles, body.hosts);
  }
}
