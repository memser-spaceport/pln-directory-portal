import { Injectable } from '@nestjs/common';
import { MembersService } from '../../members/members.service';
import { ExternalGuest, MatchedGuest } from './pl-event-guest-sync.interface';

/**
 * Service for matching external guests with directory members by email
 */
@Injectable()
export class PLEventGuestMatchingService {
  constructor(private readonly membersService: MembersService) {}

  /**
   * Matches guests with directory members by email
   * @param guests - External guests to match
   * @returns Only guests that matched with a member
   */
  async matchGuests(guests: ExternalGuest[]): Promise<MatchedGuest[]> {
    const emails = this.extractGuestEmails(guests);
    if (emails.length === 0) return [];

    const members = await this.membersService.getMembersByEmails(emails);
    if (members.size === 0) return [];

    const memberUids = Array.from(members.values()).map(member => member.uid);
    const teamByMember = await this.membersService.getMainTeamsByMemberUids(memberUids);

    return this.buildMatchedGuests(guests, members, teamByMember);
  }

  /**
   * Extracts and normalizes emails from guests
   */
  private extractGuestEmails(guests: ExternalGuest[]): string[] {
    return guests
      .map(g => g.email?.toLowerCase().trim())
      .filter((email): email is string => !!email);
  }

  /**
   * Builds matched guest list from lookups
   */
  private buildMatchedGuests(
    guests: ExternalGuest[],
    members: Map<string, { uid: string; email: string }>,
    teamByMember: Map<string, string>
  ): MatchedGuest[] {
    const matchedGuests: MatchedGuest[] = [];
    for (const guest of guests) {
      const email = guest.email?.toLowerCase().trim();
      if (!email) continue;
      const member = members.get(email);
      if (!member) continue;
      matchedGuests.push({
        externalGuest: guest,
        memberUid: member.uid,
        teamUid: teamByMember.get(member.uid) ?? null,
      });
    }
    return matchedGuests;
  }
}
