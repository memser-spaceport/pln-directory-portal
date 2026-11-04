import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { AnalyticsService } from '../analytics/service/analytics.service';
import { ANALYTICS_EVENTS } from '../utils/constants';
import { isExcludedMember } from './member-exclusion';
import { MemberSignalOwnershipResolver } from './member-signal-ownership';
import {
  MEMBER_SIGNAL_DAILY_DEDUPE_ACTIONS,
  MemberSignalAction,
  MemberSignalEntityType,
  isMemberSignalAction,
  isMemberSignalEntityType,
} from './member-signals.constants';

export type RecordMemberSignalInput = {
  memberUid: string;
  action: MemberSignalAction;
  entityType: MemberSignalEntityType;
  entityUid: string;
};

/**
 * Writes the member signal log (LAB-3121, LAB-3123).
 *
 * `record` never throws: callers fire it after their own action has succeeded
 * (`void this.memberSignals.record(...)`), so a signal problem is logged and
 * never reaches the member. It returns whether a row was added.
 */
@Injectable()
export class MemberSignalsService {
  private readonly logger = new Logger(MemberSignalsService.name);

  constructor(private readonly prisma: PrismaService, private readonly analytics: AnalyticsService) {}

  async record(input: RecordMemberSignalInput): Promise<boolean> {
    try {
      return await this.write(input);
    } catch (error) {
      this.logger.error(
        `Failed to record member signal ${input.action} ${input.entityType}:${input.entityUid} for ${input.memberUid}`,
        error instanceof Error ? error.stack : String(error)
      );
      return false;
    }
  }

  /** The active member behind a session email, or 401. */
  async resolveSessionMemberUid(email: string | undefined): Promise<string> {
    if (!email) throw new UnauthorizedException('Invalid Session. Please login and try again');
    const member = await this.prisma.member.findUnique({ where: { email }, select: { uid: true, deletedAt: true } });
    if (!member || member.deletedAt) throw new UnauthorizedException('Invalid Session. Please login and try again');
    return member.uid;
  }

  private async write({ memberUid, action, entityType, entityUid }: RecordMemberSignalInput): Promise<boolean> {
    if (!isMemberSignalAction(action) || !isMemberSignalEntityType(entityType) || !entityUid) {
      this.logger.warn(`Ignored member signal with unknown action/entity: ${action} ${entityType}`);
      return false;
    }

    const member = await this.prisma.member.findUnique({
      where: { uid: memberUid },
      select: { signUpSource: true, email: true },
    });
    if (isExcludedMember(member)) return false;

    if (MEMBER_SIGNAL_DAILY_DEDUPE_ACTIONS.has(action)) {
      const dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0);
      const existing = await this.prisma.memberSignal.findFirst({
        where: { memberUid, action, entityType, entityUid, createdAt: { gte: dayStart } },
        select: { id: true },
      });
      if (existing) return false;
    }

    const own = await new MemberSignalOwnershipResolver(this.prisma).isOwn(memberUid, entityType, entityUid);
    await this.prisma.memberSignal.create({ data: { memberUid, action, entityType, entityUid, own } });

    void this.analytics.trackEvent({
      name: ANALYTICS_EVENTS.PERSONALIZATION.MEMBER_SIGNAL_RECORDED,
      distinctId: memberUid,
      properties: { action, entityType, own },
    });
    return true;
  }
}
