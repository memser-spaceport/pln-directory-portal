import { Injectable, NotFoundException } from '@nestjs/common';
import type { JobBoardSignUpInput } from 'libs/contracts/src/schema/job-application';
import { JOB_ASPIRANT_POLICY_CODE } from '../access-control-v2/access-control-v2.constants';
import { MembersService } from '../members/members.service';
import { PrismaService } from '../shared/prisma.service';

const JOB_BOARD_SIGN_UP_SOURCE = 'job-board';

@Injectable()
export class JobOpeningsSignUpService {
  constructor(private readonly membersService: MembersService, private readonly prisma: PrismaService) {}

  async signUp(input: JobBoardSignUpInput) {
    const member = await this.membersService.createMemberAndAttach(
      {
        name: input.name,
        email: input.email,
        linkedinHandler: input.linkedinHandler,
        /* On the dto rather than in `options` beside `teamEmail`, and the
           asymmetry is deliberate. `teamEmail` has no entry in the member
           create path's `directFields` whitelist, so it has nowhere to go but
           the follow-up update `options` drives. This one does have a route:
           `prepareMemberFromParticipantRequest` already calls
           `assignJobSearchStatusFromInput`, which is how every other writer of
           this column (the members controller, the admin service) sets it and
           which owns the wire→enum mapping. So it lands in the same insert that
           creates the member, and no new code writes it. */
        jobSearchStatus: input.jobSearchStatus,
        signUpSource: JOB_BOARD_SIGN_UP_SOURCE,
      },
      {
        role: input.role,
        teamEmail: input.teamEmail,
        isTeamNew: input.isTeamNew === true,
        team: input.team,
        requestorEmail: input.email,
      }
    );

    await this.assignJobAspirantPolicy(member.uid);
    return member;
  }

  private async assignJobAspirantPolicy(memberUid: string) {
    const policy = await this.prisma.policy.findUnique({
      where: { code: JOB_ASPIRANT_POLICY_CODE },
      select: { uid: true },
    });
    if (!policy) {
      throw new NotFoundException(`Policy not found: ${JOB_ASPIRANT_POLICY_CODE}`);
    }

    await this.prisma.policyAssignment.upsert({
      where: {
        memberUid_policyUid: {
          memberUid,
          policyUid: policy.uid,
        },
      },
      update: {},
      create: {
        memberUid,
        policyUid: policy.uid,
      },
    });
  }
}
