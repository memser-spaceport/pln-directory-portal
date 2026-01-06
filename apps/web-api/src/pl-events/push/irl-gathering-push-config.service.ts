import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';

export type IrlGatheringPushConfigDto = {
  uid: string;
  enabled: boolean;
  minAttendeesPerEvent: number;
  upcomingWindowDays: number;
  reminderDaysBefore: number;
  updatedAt: Date;
};

export type UpdateIrlGatheringPushConfigDto = Partial<{
  enabled: boolean;
  minAttendeesPerEvent: number;
  upcomingWindowDays: number;
  reminderDaysBefore: number;
  updatedByMemberUid: string | null;
}>;

export type CreateIrlGatheringPushConfigDto = {
  enabled: boolean;
  minAttendeesPerEvent: number;
  upcomingWindowDays: number;
  reminderDaysBefore: number;
  updatedByMemberUid?: string | null;
};

@Injectable()
export class IrlGatheringPushConfigService {
  private readonly logger = new Logger(IrlGatheringPushConfigService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getActiveConfigOrNull(): Promise<IrlGatheringPushConfigDto | null> {
    this.logger.log('[config] loading active config from DB...');

    const cfg = await this.prisma.irlGatheringPushConfig.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
      select: {
        uid: true,
        enabled: true,
        minAttendeesPerEvent: true,
        upcomingWindowDays: true,
        reminderDaysBefore: true,
        updatedAt: true,
      },
    });

    if (!cfg) {
      this.logger.warn('[config] active config not found (isActive=true).');
      return null;
    }

    return cfg;
  }

  async getActiveConfigOrThrow(): Promise<IrlGatheringPushConfigDto> {
    const cfg = await this.getActiveConfigOrNull();
    if (!cfg) throw new NotFoundException('Active IRL gathering push config not found');
    return cfg;
  }

  async updateByUid(uid: string, body: UpdateIrlGatheringPushConfigDto) {
    // keep controller thin: existence check lives here
    const exists = await this.prisma.irlGatheringPushConfig.findUnique({ where: { uid } });
    if (!exists) throw new NotFoundException(`Config not found: ${uid}`);

    return this.prisma.irlGatheringPushConfig.update({
      where: { uid },
      data: {
        enabled: body.enabled,
        minAttendeesPerEvent: body.minAttendeesPerEvent,
        upcomingWindowDays: body.upcomingWindowDays,
        reminderDaysBefore: body.reminderDaysBefore,
        // if field is omitted -> no update; if null -> set null
        updatedByMemberUid: body.updatedByMemberUid ?? undefined,
      },
    });
  }

  async createAndActivate(body: CreateIrlGatheringPushConfigDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.irlGatheringPushConfig.updateMany({
        data: { isActive: false },
      });

      return tx.irlGatheringPushConfig.create({
        data: {
          isActive: true,
          enabled: body.enabled,
          minAttendeesPerEvent: body.minAttendeesPerEvent,
          upcomingWindowDays: body.upcomingWindowDays,
          reminderDaysBefore: body.reminderDaysBefore,
          updatedByMemberUid: body.updatedByMemberUid ?? null,
        },
      });
    });
  }

  async activate(uid: string) {
    return this.prisma.$transaction(async (tx) => {
      const exists = await tx.irlGatheringPushConfig.findUnique({ where: { uid } });
      if (!exists) throw new NotFoundException(`Config not found: ${uid}`);

      await tx.irlGatheringPushConfig.updateMany({
        data: { isActive: false },
      });

      return tx.irlGatheringPushConfig.update({
        where: { uid },
        data: { isActive: true },
      });
    });
  }
}
