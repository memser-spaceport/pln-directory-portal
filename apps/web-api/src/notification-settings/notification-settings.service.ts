import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { LogService } from '../shared/log.service';
import { UpdateNotificationSettingsDto, UpdateParticipationDto } from 'libs/contracts/src/schema/notification-settings';

@Injectable()
export class NotificationSettingsService {
  constructor(private prisma: PrismaService, private logger: LogService) {}

  async getNotificationSettings(memberUid: string) {
    const member = await this.prisma.member.findUnique({
      where: { uid: memberUid },
    });

    if (!member) {
      throw new NotFoundException(`Member with uid '${memberUid}' not found`);
    }

    let notificationSettings = await this.prisma.notificationSetting.findUnique({
      where: {
        memberUid: memberUid,
      },
    });

    if (!notificationSettings) {
      notificationSettings = await this.prisma.notificationSetting.create({
        data: {
          memberUid,
        },
      });
    }

    return notificationSettings;
  }

  async updateOrCreateByMemberUid(memberUid: string, data: UpdateNotificationSettingsDto) {
    const member = await this.prisma.member.findUnique({
      where: { uid: memberUid },
    });

    if (!member) {
      throw new NotFoundException(`Member with uid '${memberUid}' not found`);
    }

    return this.prisma.notificationSetting.upsert({
      where: { memberUid },
      update: data,
      create: {
        memberUid,
        ...data,
      },
    });
  }

  async updateParticipation(memberUid: string, data: UpdateParticipationDto) {
    const member = await this.prisma.member.findUnique({
      where: { uid: memberUid },
    });

    if (!member) {
      throw new NotFoundException(`Member with uid '${memberUid}' not found`);
    }

    return this.prisma.notificationSetting.upsert({
      where: { memberUid },
      update: data,
      create: {
        memberUid,
        ...data,
      },
    });
  }

  async enableRecommendationsFor(memberUids: string[]) {
    try {
      await this.prisma.$transaction(
        memberUids.map((uid) =>
          this.prisma.notificationSetting.upsert({
            where: { memberUid: uid },
            update: {
              recommendationsEnabled: true,
            },
            create: {
              memberUid: uid,
              recommendationsEnabled: true,
            },
          })
        )
      );
    } catch (err) {
      this.logger.error(`The recommendations weren't enabled for ${memberUids.join(', ')}`, err);
    }
  }
}
