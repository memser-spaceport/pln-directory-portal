import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  forwardRef,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { IntroRequestType, Prisma, TeamStatus } from '@prisma/client';
import { CreateIntroRequestDto } from 'libs/contracts/src/schema';
import { MembersService } from '../members/members.service';
import { PL_INFRA_POLICY_CODE } from '../pl-infra-members/pl-infra-members.constants';
import { PrismaService } from '../shared/prisma.service';
import { PL_PORTFOLIO_COMMUNITY_AFFILIATION } from '../teams/team-affiliation.constants';
import { enforceDeletedTeamHidden } from '../teams/team-public-visibility';
import { introRequestTelegramText, requesterTeamLabel } from './intro-request-message';
import { IntroRequestTelegram, redactAsksBotToken } from './intro-request-telegram';

const NOT_ELIGIBLE = 'Only members of portfolio teams and PL Infra can send an intro request';
const CLAIM_STALE_MS = 10 * 60 * 1000;
const RETRY_BATCH = 20;

/**
 * LAB-3457: a check that the C3 route (`POST /v1/intro-requests`) runs before it sends. `send` is the plain C3 send. The
 * LabOS agent registers one so an intro draft that is saved in a chat thread is never sent twice (C3 and C5).
 */
export type IntroRequestRouteGate = (
  email: string,
  input: CreateIntroRequestDto,
  send: () => Promise<{ uid: string }>
) => Promise<{ uid: string }>;

export type RequesterRow = {
  uid: string;
  name: string;
  teamMemberRoles: { mainTeam: boolean; team: { name: string } }[];
  policyAssignmentsV2: { uid: string }[];
};

@Injectable()
export class IntroRequestsService {
  private readonly logger = new Logger(IntroRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: IntroRequestTelegram,
    @Inject(forwardRef(() => MembersService)) private readonly membersService: MembersService
  ) {}

  private routeGate?: IntroRequestRouteGate;

  /** LAB-3457: set by the LabOS agent at start (`LabosAgentThreadsService`). Only the C3 route uses it. */
  useRouteGate(gate: IntroRequestRouteGate): void {
    this.routeGate = gate;
  }

  /**
   * C3, the HTTP route. With a gate, the gate decides and calls the plain send. Other callers (the LabOS agent C5) call
   * `create` and do not pass the gate.
   */
  async createFromRoute(email: string | undefined, input: CreateIntroRequestDto): Promise<{ uid: string }> {
    const send = () => this.create(email, input);
    if (!this.routeGate || !email?.trim()) return send();
    return this.routeGate(email, input, send);
  }

  async create(email: string | undefined, input: CreateIntroRequestDto): Promise<{ uid: string }> {
    if (!email?.trim()) {
      throw new UnauthorizedException('Invalid Session. Please login and try again');
    }

    const requester = await this.loadEligibleRequester(email);
    await this.requireTarget(input.type, input.targetId, email);
    const row = await this.prisma.introRequest.create({
      data: {
        requesterUid: requester.uid,
        type: input.type,
        targetUid: input.targetId,
        text: input.text,
      },
    });

    try {
      await this.deliver(row.uid);
    } catch (error) {
      this.logger.error(`Intro request ${row.uid} Telegram post failed: ${this.errorText(error)}`);
    }

    return { uid: row.uid };
  }

  async retryPending(): Promise<void> {
    const pending = await this.prisma.introRequest.findMany({
      where: this.unsentWhere(new Date()),
      orderBy: { createdAt: 'asc' },
      take: RETRY_BATCH,
      select: { uid: true },
    });

    for (const row of pending) {
      try {
        await this.deliver(row.uid);
      } catch (error) {
        this.logger.error(`Intro request ${row.uid} Telegram post failed: ${this.errorText(error)}`);
      }
    }
  }

  private async deliver(uid: string): Promise<void> {
    const now = new Date();
    const claimed = await this.prisma.introRequest.updateMany({
      where: { uid, ...this.unsentWhere(now) },
      data: { telegramClaimedAt: now },
    });
    if (claimed.count !== 1) {
      return;
    }

    let text: string;
    try {
      text = await this.messageFor(uid);
    } catch (error) {
      await this.releaseClaim(uid);
      throw error;
    }

    let messageId: string;
    try {
      messageId = await this.telegram.send(text);
    } catch (error) {
      await this.releaseClaim(uid);
      throw error;
    }

    await this.prisma.introRequest.update({
      where: { uid },
      data: { telegramMessageId: messageId, telegramClaimedAt: null },
    });
  }

  /**
   * The intro sender rule, shared by C3 (`create`) and the LabOS agent `draft_intro` tool (LAB-3300): a live member
   * with a current role on a PL Portfolio team, or with the PL Infra policy. Returns the member, or null.
   */
  async findEligibleRequester(email: string | null | undefined): Promise<RequesterRow | null> {
    if (!email?.trim()) return null;
    const requester = (await this.prisma.member.findFirst({
      where: { email: email.toLowerCase().trim(), deletedAt: null },
      select: this.requesterSelect(new Date()),
    })) as RequesterRow | null;
    return requester && this.isEligible(requester) ? requester : null;
  }

  /**
   * The LabOS agent target lookup (LAB-3300 C1 and `draft_intro`): a member with no `deletedAt`, or a team that is
   * not deleted (status INACTIVE, LAB-3192). Returns the target name, or null. This mirrors `GET /v1/teams/:uid`, which
   * gives a non-admin 404 for a deleted team (`enforceDeletedTeamHidden`). The agent has no admin exception. C3
   * (`create`) checks a team target with `requireVisibleTeam` (LAB-3323).
   */
  async findAgentTargetName(type: IntroRequestType, targetId: string): Promise<string | null> {
    if (type === 'MEMBER') return this.lookupTargetName(type, targetId);
    const team = await this.prisma.team.findFirst({
      where: { uid: targetId, status: { not: TeamStatus.INACTIVE } },
      select: { name: true },
    });
    return team?.name ?? null;
  }

  private async loadEligibleRequester(email: string): Promise<RequesterRow> {
    const requester = await this.findEligibleRequester(email);
    if (!requester) {
      throw new ForbiddenException(NOT_ELIGIBLE);
    }
    return requester;
  }

  private isEligible(requester: RequesterRow): boolean {
    return requester.teamMemberRoles.length > 0 || requester.policyAssignmentsV2.length > 0;
  }

  private async requireTarget(type: IntroRequestType, targetId: string, email: string): Promise<void> {
    if (type === 'TEAM') {
      await this.requireVisibleTeam(targetId, email);
      return;
    }
    const name = await this.lookupTargetName(type, targetId);
    if (!name) {
      throw new NotFoundException('Member not found');
    }
  }

  /**
   * The rule of `GET /v1/teams/:uid` (enforceDeletedTeamHidden, LAB-3192): a deleted (INACTIVE) team is
   * "Team not found" to everyone except a directory admin (LAB-3323).
   */
  private async requireVisibleTeam(teamUid: string, email: string): Promise<void> {
    const team = await this.prisma.team.findUnique({
      where: { uid: teamUid },
      select: { uid: true, status: true },
    });
    if (!team) {
      throw new NotFoundException('Team not found');
    }
    try {
      await enforceDeletedTeamHidden(team, email, (userEmail) => this.isDirectoryAdminEmail(userEmail));
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException('Team not found');
      }
      throw error;
    }
  }

  /** The same admin check as `TeamsService.isDirectoryAdminEmail`. */
  private async isDirectoryAdminEmail(email: string): Promise<boolean> {
    const member = await this.membersService.findMemberByEmail(email);
    return !!member?.isDirectoryAdmin;
  }

  private async messageFor(uid: string): Promise<string> {
    const row = await this.prisma.introRequest.findUnique({ where: { uid } });
    if (!row) {
      throw new Error(`Intro request ${uid} was not found`);
    }

    const requester = (await this.prisma.member.findUnique({
      where: { uid: row.requesterUid },
      select: this.requesterSelect(new Date()),
    })) as RequesterRow | null;
    const targetName = (await this.lookupTargetName(row.type, row.targetUid)) ?? row.targetUid;
    return introRequestTelegramText({
      requesterName: requester?.name ?? row.requesterUid,
      requesterUid: row.requesterUid,
      teamLabel: requesterTeamLabel(
        (requester?.teamMemberRoles ?? []).map((role) => ({ mainTeam: role.mainTeam, teamName: role.team.name })),
        (requester?.policyAssignmentsV2.length ?? 0) > 0
      ),
      type: row.type,
      targetName,
      targetUid: row.targetUid,
      text: row.text,
    });
  }

  private async lookupTargetName(type: IntroRequestType, targetId: string): Promise<string | null> {
    if (type === 'MEMBER') {
      const member = await this.prisma.member.findFirst({
        where: { uid: targetId, deletedAt: null },
        select: { name: true },
      });
      return member?.name ?? null;
    }
    const team = await this.prisma.team.findUnique({
      where: { uid: targetId },
      select: { name: true },
    });
    return team?.name ?? null;
  }

  private requesterSelect(now: Date) {
    return {
      uid: true,
      name: true,
      teamMemberRoles: {
        where: {
          OR: [{ endDate: null }, { endDate: { gte: now } }],
          team: { communityAffiliations: { some: { title: PL_PORTFOLIO_COMMUNITY_AFFILIATION } } },
        },
        select: { mainTeam: true, team: { select: { name: true } } },
      },
      policyAssignmentsV2: {
        where: { policy: { code: PL_INFRA_POLICY_CODE } },
        select: { uid: true },
      },
    };
  }

  private unsentWhere(now: Date): Prisma.IntroRequestWhereInput {
    return {
      telegramMessageId: null,
      OR: [{ telegramClaimedAt: null }, { telegramClaimedAt: { lt: new Date(now.getTime() - CLAIM_STALE_MS) } }],
    };
  }

  private async releaseClaim(uid: string): Promise<void> {
    await this.prisma.introRequest.update({
      where: { uid },
      data: { telegramClaimedAt: null },
    });
  }

  private errorText(error: unknown): string {
    const message = error instanceof Error ? error.message : 'Telegram send failed';
    return redactAsksBotToken(message);
  }
}
