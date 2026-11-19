import { Injectable, NotFoundException } from '@nestjs/common';
import { LabosDigestEmailFrequency, LabosDigestEmailSettings } from 'libs/contracts/src/schema/team-news';
import { NotificationServiceClient } from '../notifications/notification-service.client';
import { PrismaService } from '../shared/prisma.service';
import { verifyDigestLinkToken } from './labos-digest-link-token.util';

/** `forumDigestFrequency` is a number of days in the notification service. */
const FREQUENCY_DAYS: Record<LabosDigestEmailFrequency, number> = { daily: 1, weekly: 7 };

type StoredSetting = { forumDigestEnabled?: boolean | null; forumDigestFrequency?: number | null } | null;

export type DigestEmailSettingsChange = { enabled?: boolean; frequency?: LabosDigestEmailFrequency };

/**
 * The digest email settings behind the digest email footer (LAB-3309, LAB-3310): Manage preferences, Switch to
 * weekly / daily and Unsubscribe work from the email's signed link, without sign-in. The settings live in the
 * notification service, where the signed-in email settings page reads and writes them too.
 */
@Injectable()
export class LabosDigestEmailSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationServiceClient
  ) {}

  /**
   * @throws DigestLinkError for a bad token; NotFoundException when the member no longer exists.
   * Changes nothing: the notification service answers its defaults for a member with no settings row.
   */
  async read(token: string): Promise<LabosDigestEmailSettings> {
    const member = await this.memberOf(token);
    return toSettings(member.name, await this.notificationService.getNotificationSetting(member.uid));
  }

  /** Saves only the given fields and returns the settings after the change. Undo is this call with the old values. */
  async change(token: string, change: DigestEmailSettingsChange): Promise<LabosDigestEmailSettings> {
    const member = await this.memberOf(token);
    const update: Record<string, unknown> = { memberUid: member.uid };
    if (member.externalId) update.memberExternalId = member.externalId;
    if (change.enabled !== undefined) update.forumDigestEnabled = change.enabled;
    if (change.frequency !== undefined) {
      update.forumDigestFrequency = FREQUENCY_DAYS[change.frequency];
    } else if (change.enabled === true) {
      // Turning the digest back on with a frequency the email can't offer (none, or not 1 or 7) makes it daily,
      // which is what the read showed.
      const stored: StoredSetting = await this.notificationService.getNotificationSetting(member.uid);
      if (!isKnownFrequency(stored?.forumDigestFrequency)) update.forumDigestFrequency = FREQUENCY_DAYS.daily;
    }
    return toSettings(member.name, await this.notificationService.upsertNotificationSetting(member.uid, update));
  }

  /** RFC 8058 one-click unsubscribe: turns the digest off, and stays off when it already is. */
  async unsubscribe(token: string): Promise<void> {
    await this.change(token, { enabled: false });
  }

  private async memberOf(token: string) {
    const link = verifyDigestLinkToken(token);
    const member = await this.prisma.member.findUnique({
      where: { uid: link.m },
      select: { uid: true, name: true, externalId: true },
    });
    if (!member) throw new NotFoundException('Digest not found');
    return member;
  }
}

const isKnownFrequency = (days: number | null | undefined): boolean =>
  days === FREQUENCY_DAYS.daily || days === FREQUENCY_DAYS.weekly;

function toSettings(name: string | null, stored: StoredSetting): LabosDigestEmailSettings {
  return {
    firstName: name?.trim().split(/\s+/)[0] || null,
    // The digest is opt-in: the notification service's default for a member with no row is off.
    enabled: stored?.forumDigestEnabled ?? false,
    frequency: stored?.forumDigestFrequency === FREQUENCY_DAYS.weekly ? 'weekly' : 'daily',
  };
}
