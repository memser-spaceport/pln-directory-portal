import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';

/**
 * The weekly suggested-candidates email preference (LAB-2850), stored on the local `NotificationSetting` row.
 * A member without a row has it on. Reads never create a row; writes upsert one.
 *
 * Prisma-only on purpose: `JobMatchModule` uses it for the send and the unsubscribe route without importing
 * `NotificationSettingsModule` and its dependencies.
 */
@Injectable()
export class SuggestedCandidatesEmailPreferenceService {
  constructor(private readonly prisma: PrismaService) {}

  async isEnabled(memberUid: string): Promise<boolean> {
    const setting = await this.prisma.notificationSetting.findUnique({
      where: { memberUid },
      select: { suggestedCandidatesEmailEnabled: true },
    });
    return setting?.suggestedCandidatesEmailEnabled ?? true;
  }

  /** The preference as the GET route returns it; 404 for an unknown member. Never creates a row. */
  async get(memberUid: string): Promise<{ memberUid: string; suggestedCandidatesEmailEnabled: boolean }> {
    await this.assertMember(memberUid);
    return { memberUid, suggestedCandidatesEmailEnabled: await this.isEnabled(memberUid) };
  }

  /** The member uids among `memberUids` that have the preference on (absent row counts as on). */
  async enabledFor(memberUids: string[]): Promise<Set<string>> {
    const unique = [...new Set(memberUids)];
    if (!unique.length) return new Set();
    const optedOut = await this.prisma.notificationSetting.findMany({
      where: { memberUid: { in: unique }, suggestedCandidatesEmailEnabled: false },
      select: { memberUid: true },
    });
    const off = new Set(optedOut.map((row) => row.memberUid));
    return new Set(unique.filter((uid) => !off.has(uid)));
  }

  /** Stores the preference; 404 for an unknown member. */
  async set(
    memberUid: string,
    enabled: boolean
  ): Promise<{ memberUid: string; suggestedCandidatesEmailEnabled: boolean }> {
    await this.assertMember(memberUid);
    const setting = await this.prisma.notificationSetting.upsert({
      where: { memberUid },
      update: { suggestedCandidatesEmailEnabled: enabled },
      create: { memberUid, suggestedCandidatesEmailEnabled: enabled },
      select: { suggestedCandidatesEmailEnabled: true },
    });
    return { memberUid, suggestedCandidatesEmailEnabled: setting.suggestedCandidatesEmailEnabled };
  }

  /**
   * Turns the preference off, as the email's unsubscribe link does; 404 for an unknown member. `changed` is true
   * when it was on before (absent row counts as on), false for a repeated unsubscribe.
   */
  async unsubscribe(memberUid: string): Promise<{ changed: boolean }> {
    await this.assertMember(memberUid);
    const wasEnabled = await this.isEnabled(memberUid);
    await this.set(memberUid, false);
    return { changed: wasEnabled };
  }

  private async assertMember(memberUid: string): Promise<void> {
    const member = await this.prisma.member.findUnique({ where: { uid: memberUid }, select: { uid: true } });
    if (!member) {
      throw new NotFoundException(`Member with uid '${memberUid}' not found`);
    }
  }
}
