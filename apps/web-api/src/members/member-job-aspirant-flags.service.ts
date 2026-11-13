import { Injectable } from '@nestjs/common';
import { JOB_ASPIRANT_POLICY_CODE } from '../access-control-v2/access-control-v2.constants';
import { PrismaService } from '../shared/prisma.service';
import { MembersService } from './members.service';

type ListedMember = { uid?: string };

/**
 * Adds `isJobAspirant` to listed members when a directory admin is looking, so admin-only list cards can mark them.
 * Other viewers get the list unchanged: job-seeking is admin-only data, like `jobSearchStatus`.
 */
@Injectable()
export class MemberJobAspirantFlagsService {
  constructor(private readonly prisma: PrismaService, private readonly membersService: MembersService) {}

  async flagForViewer<T>(members: T[], viewerEmail?: string): Promise<T[]> {
    if (members.length === 0 || !(await this.isAdminViewer(viewerEmail))) {
      return members;
    }
    const listed = members as (T & ListedMember)[];
    const aspirantUids = await this.findJobAspirantUids(listed);
    return listed.map((member) => ({ ...member, isJobAspirant: aspirantUids.has(member.uid ?? '') }));
  }

  private async isAdminViewer(viewerEmail?: string): Promise<boolean> {
    if (!viewerEmail) {
      return false;
    }
    const viewer = await this.membersService.findMemberByEmail(viewerEmail);
    return viewer?.isDirectoryAdmin === true;
  }

  private async findJobAspirantUids(members: ListedMember[]): Promise<Set<string>> {
    const memberUids = members.map((member) => member.uid).filter((uid): uid is string => !!uid);
    const assignments = await this.prisma.policyAssignment.findMany({
      where: { memberUid: { in: memberUids }, policy: { code: JOB_ASPIRANT_POLICY_CODE } },
      select: { memberUid: true },
    });
    return new Set(assignments.map((assignment) => assignment.memberUid));
  }
}
