import { Injectable } from '@nestjs/common';
import type { JobBoardSignUpInput } from 'libs/contracts/src/schema/job-application';
import { MembersService } from '../members/members.service';

const JOB_BOARD_SIGN_UP_SOURCE = 'job-board';

@Injectable()
export class JobOpeningsSignUpService {
  constructor(private readonly membersService: MembersService) {}

  async signUp(input: JobBoardSignUpInput) {
    return this.membersService.createMemberAndAttach(
      {
        name: input.name,
        email: input.email,
        linkedinHandler: input.linkedinHandler,
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
  }
}
