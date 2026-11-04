import { ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { IntroRequestType, Prisma } from '@prisma/client';
import { CreateIntroRequestDto } from 'libs/contracts/src/schema';
import { PL_INFRA_POLICY_CODE } from '../pl-infra-members/pl-infra-members.constants';
import { PrismaService } from '../shared/prisma.service';
import { PL_PORTFOLIO_COMMUNITY_AFFILIATION } from '../teams/team-affiliation.constants';
import { introRequestTelegramText, requesterTeamLabel } from './intro-request-message';
import { IntroRequestTelegram, redactAsksBotToken } from './intro-request-telegram';

const NOT_ELIGIBLE = 'Only members of portfolio teams and PL Infra can send an intro request';
const CLAIM_STALE_MS = 10 * 60 * 1000;
const RETRY_BATCH = 20;

type RequesterRow = {
  uid: string;
  name: string;
  teamMemberRoles: { mainTeam: boolean; team: { name: string } }[];
  policyAssignmentsV2: { uid: string }[];
};

@Injectable()
export class IntroRequestsService {
  private readonly logger = new Logger(IntroRequestsService.name);

  constructor(private readonly prisma: PrismaService, private readonly telegram: IntroRequestTelegram) {}

  async create(email: string | undefined, input: CreateIntroRequestDto): Promise<{ uid: string }> {
    if (!email?.trim()) {
      throw new UnauthorizedException('Invalid Session. Please login and try again');
    }

    const requester = await this.loadEligibleRequester(email);
    await this.requireTarget(input.type, input.targetId);
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

  private async loadEligibleRequester(email: string): Promise<RequesterRow> {
    const requester = (await this.prisma.member.findFirst({
      where: { email: email.toLowerCase().trim(), deletedAt: null },
      select: this.requesterSelect(new Date()),
    })) as RequesterRow | null;
    if (!requester || !this.isEligible(requester)) {
      throw new ForbiddenException(NOT_ELIGIBLE);
    }
    return requester;
  }

  private isEligible(requester: RequesterRow): boolean {
    return requester.teamMemberRoles.length > 0 || requester.policyAssignmentsV2.length > 0;
  }

  private async requireTarget(type: IntroRequestType, targetId: string): Promise<void> {
    const name = await this.lookupTargetName(type, targetId);
    if (!name) {
      throw new NotFoundException(type === 'MEMBER' ? 'Member not found' : 'Team not found');
    }
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
