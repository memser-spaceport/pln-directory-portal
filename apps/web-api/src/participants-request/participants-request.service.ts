import { BadRequestException, Injectable, Inject, forwardRef } from '@nestjs/common';
import { MembersService } from '../members/members.service';
import { LogService } from '../shared/log.service';

@Injectable()
export class ParticipantsRequestService {
  constructor(
    @Inject(forwardRef(() => MembersService))
    private readonly membersService: MembersService,
    private readonly logger: LogService,
  ) {}

  /**
   * Validate and normalize body for /v1/participants-request/member
   */
  private validateMemberRequestBody(body: any): void {
    if (!body) {
      throw new BadRequestException('Request body is required');
    }

    const newData = body.newData || {};

    const email =
      newData.email ||
      body.email ||
      null;

    if (!email) {
      throw new BadRequestException('newData.email (or email) is required for member request');
    }

    if (body.isTeamNew) {
      const team = body.team || {};
      const teamName =
        team.name ||
        newData.teamTitle ||
        null;

      if (!teamName) {
        throw new BadRequestException(
          'team.name (or newData.teamTitle) is required when isTeamNew = true',
        );
      }
    }
  }

  /**
   * Handle member participant request in the NEW model:
   *  - no "participants_request" table
   *  - no statuses
   *  - directly create/reuse Member and Team, then attach relation
   */
  async handleMemberRequest(body: any): Promise<any> {
    this.logger.info(
      '[ParticipantsRequestService.handleMemberRequest] Incoming body=' + JSON.stringify(body),
    );

    this.validateMemberRequestBody(body);

    const newData = body.newData || {};
    const opts: any = {
      role: body.role || null,
      isTeamNew: body.isTeamNew === true,
      requestorEmail: (newData && newData.email) || body.email || null,
      team: null,
      website: null,
    };

    if (body.team) {
      opts.team = {
        uid: body.team.uid,
        name: body.team.name,
        website: body.team.website,
      };
    }

    if (!opts.team && body.website) {
      opts.website = body.website;
    }

    const result = await this.membersService.createMemberAndAttach(newData, opts);

    this.logger.info(
      '[ParticipantsRequestService.handleMemberRequest] Created/updated member uid=' +
      result.uid,
    );

    return result;
  }
}
