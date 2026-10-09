import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MembersService } from '../members/members.service';
import { PrismaService } from '../shared/prisma.service';
import { GOOD_FIT, asMarkedCriteria, isLiveOpening, labelText } from './job-match.logic';

export type SuggestedCandidate = {
  memberUid: string;
  name: string;
  role: string | null;
  imageUrl: string | null;
  fit: number;
  label: 'Strong match' | 'Good match';
  rank: number;
  blurb: string | null;
  criteria: { text: string; matched: boolean }[];
  /** The member said they are interested in this role or in its team, as of the stored run (LAB-2788). */
  interested: boolean;
};

@Injectable()
export class JobMatchService {
  constructor(private readonly prisma: PrismaService, private readonly membersService: MembersService) {}

  async listForRole(roleUid: string, userEmail: string | undefined): Promise<{ suggestions: SuggestedCandidate[] }> {
    if (!userEmail) {
      throw new ForbiddenException('Only hiring team members and directory admins can read suggested candidates');
    }
    const member = await this.membersService.findMemberByEmail(userEmail);
    if (!member) {
      throw new ForbiddenException('Only hiring team members and directory admins can read suggested candidates');
    }

    const job = await this.prisma.jobOpening.findUnique({
      where: { uid: roleUid },
      select: { uid: true, teamUid: true, status: true, publishedAt: true },
    });
    if (!job) throw new NotFoundException('Job opening not found');

    const allowed =
      member.isDirectoryAdmin || (job.teamUid ? await this.isCurrentMember(job.teamUid, member.uid) : false);
    if (!allowed) {
      throw new ForbiddenException('Only hiring team members and directory admins can read suggested candidates');
    }
    if (!isLiveOpening(job)) return { suggestions: [] };

    const latest = await this.prisma.jobMatchRow.findFirst({
      where: { kind: 'ROLE', roleUid },
      orderBy: { createdAt: 'desc' },
      select: { runUid: true },
    });
    if (!latest) return { suggestions: [] };

    const rows = await this.prisma.jobMatchRow.findMany({
      where: { kind: 'SUGGESTION', runUid: latest.runUid, roleUid },
      orderBy: { rank: 'asc' },
      take: 5,
    });
    const members = await this.prisma.member.findMany({
      where: { uid: { in: rows.map((row) => row.memberUid) }, deletedAt: null },
      select: { uid: true, name: true, role: true, image: { select: { url: true } } },
    });
    const byUid = new Map(members.map((item) => [item.uid, item]));

    const suggestions = rows.flatMap((row) => {
      const person = byUid.get(row.memberUid);
      if (!person || row.fit == null || row.rank == null || row.fit < GOOD_FIT || !row.label) return [];
      return [
        {
          memberUid: row.memberUid,
          name: person.name,
          role: person.role,
          imageUrl: person.image?.url ?? null,
          fit: row.fit,
          label: labelText(row.label),
          rank: row.rank,
          blurb: row.blurb,
          criteria: asMarkedCriteria(row.payload),
          interested: row.interested === true,
        },
      ];
    });
    return { suggestions };
  }

  private async isCurrentMember(teamUid: string, memberUid: string): Promise<boolean> {
    const role = await this.prisma.teamMemberRole.findFirst({
      where: {
        teamUid,
        memberUid,
        OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
      },
      select: { id: true },
    });
    return Boolean(role);
  }
}
