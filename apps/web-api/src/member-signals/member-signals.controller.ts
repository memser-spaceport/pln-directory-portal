import { BadRequestException, Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ZodError } from 'zod';
import { MemberSignalBody, MemberSignalBodySchema } from 'libs/contracts/src/schema/member-signal';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { NoCache } from '../decorators/no-cache.decorator';
import { MemberSignalsService } from './member-signals.service';
import { MemberSignalEntityType } from './member-signals.constants';

const ENTITY_TYPES: Record<MemberSignalBody['entityType'], MemberSignalEntityType> = {
  member: 'MEMBER',
  team: 'TEAM',
  project: 'PROJECT',
};

/**
 * POST /v1/member-signals (LAB-3123): views and clicks of the logged-in member.
 * The member comes from the session only. The frontend fires and forgets, so
 * the answer is always an empty 204 once the request is valid.
 */
@Controller('v1/member-signals')
export class MemberSignalsController {
  constructor(private readonly memberSignals: MemberSignalsService) {}

  @Post()
  @HttpCode(204)
  @NoCache()
  @UseGuards(UserTokenValidation)
  async recordMemberSignal(@Body() body: unknown, @Req() req: Request & { userEmail?: string }): Promise<void> {
    const signal = parseBody(body);
    const memberUid = await this.memberSignals.resolveSessionMemberUid(req.userEmail);
    await this.memberSignals.record({
      memberUid,
      action: signal.action,
      entityType: ENTITY_TYPES[signal.entityType],
      entityUid: signal.entityId,
    });
  }
}

function parseBody(body: unknown): MemberSignalBody {
  try {
    return MemberSignalBodySchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      throw new BadRequestException(err.errors.map((e) => `${e.path.join('.') || 'body'}: ${e.message}`).join('; '));
    }
    throw err;
  }
}
