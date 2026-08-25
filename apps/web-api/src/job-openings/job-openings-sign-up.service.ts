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
        signUpSource: JOB_BOARD_SIGN_UP_SOURCE,
      },
      {
        role: input.role,
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
