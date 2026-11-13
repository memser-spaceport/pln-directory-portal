import { BadRequestException, Controller, forwardRef, Inject, Param, Query, Req, UseGuards } from '@nestjs/common';
import { Api, initNestServer } from '@ts-rest/nest';
import { Request } from 'express';
import { apiEvents } from 'libs/contracts/src/lib/contract-pl-events';
import {
  PROFILE_EVENTS_DEFAULT_LIMIT,
  ProfileEventsQuery,
  ProfileEventsQuerySchema,
} from 'libs/contracts/src/schema/profile-events';
import { NoCache } from '../decorators/no-cache.decorator';
import { OptionalUserTokenCheckGuard } from '../guards/user-token-check.guard';
import { MembersService } from '../members/members.service';
import { ProfileEventsService } from './profile-events.service';

const server = initNestServer(apiEvents);

/** `@Api` does not validate queries here, so the query is parsed before any read (400 on a bad one). */
export function parseProfileEventsQuery(raw: unknown): ProfileEventsQuery {
  const parsed = ProfileEventsQuerySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    throw new BadRequestException(parsed.error.issues);
  }
  return {
    group: parsed.data.group,
    page: parsed.data.page ?? 1,
    limit: parsed.data.limit ?? PROFILE_EVENTS_DEFAULT_LIMIT,
  };
}

/**
 * The events sections on member and team profiles (LAB-3215). Both responses depend on the viewer (signed in, owner),
 * so neither is cached.
 */
@Controller()
export class ProfileEventsController {
  constructor(
    private readonly profileEventsService: ProfileEventsService,
    @Inject(forwardRef(() => MembersService))
    private readonly membersService: MembersService
  ) {}

  @Api(server.route.getMemberEvents)
  @UseGuards(OptionalUserTokenCheckGuard)
  @NoCache()
  async getMemberEvents(@Param('uid') uid: string, @Query() rawQuery: unknown, @Req() request: Request) {
    const query = parseProfileEventsQuery(rawQuery);
    return await this.profileEventsService.getMemberEvents(uid, await this.viewerOf(request), query);
  }

  @Api(server.route.getTeamEvents)
  @UseGuards(OptionalUserTokenCheckGuard)
  @NoCache()
  async getTeamEvents(@Param('uid') uid: string, @Query() rawQuery: unknown, @Req() request: Request) {
    const query = parseProfileEventsQuery(rawQuery);
    const userEmail: string | undefined = request['userEmail'];
    return await this.profileEventsService.getTeamEvents(uid, await this.viewerOf(request), userEmail, query);
  }

  /** Signed in means the token's email belongs to a member. */
  private async viewerOf(request: Request): Promise<{ uid: string } | null> {
    const email: string | undefined = request['userEmail'];
    if (!email) {
      return null;
    }
    const member = await this.membersService.findMemberByEmail(email);
    return member ? { uid: member.uid } : null;
  }
}
