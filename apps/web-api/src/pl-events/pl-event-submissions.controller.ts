import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  NotFoundException,
  Param,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { PLEventStatus } from '@prisma/client';
import { Api, initNestServer } from '@ts-rest/nest';
import { Request } from 'express';
import { apiEvents } from 'libs/contracts/src/lib/contract-pl-events';
import {
  eventIssuesMessage,
  PLEventPatchBody,
  PLEventPatchBodySchema,
  PLEventSubmitBody,
  PLEventSubmitBodySchema,
} from 'libs/contracts/src/schema/pl-event-body';
import { NoCache } from '../decorators/no-cache.decorator';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { MembersService } from '../members/members.service';
import { isLocalEventSubmitEnabled } from './pl-event-submit.constants';
import { PLEventWriteService } from './pl-event-write.service';
import { PLEventsService } from './pl-events.service';

const server = initNestServer(apiEvents);

/**
 * `@Api` does not validate bodies in this app, so each route parses its own (400 before any write). The problems
 * are sent as one line of text, because the API's error filter returns `message` only when it is text.
 */
function parseBody<T>(schema: { safeParse: (input: unknown) => any }, body: unknown): T {
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    throw new BadRequestException(eventIssuesMessage(parsed.error.issues));
  }
  return parsed.data as T;
}

/**
 * Submitting an event in LabOS and working with your own events (LAB-3325): `POST /v1/irl/events`,
 * `GET /v1/irl/events/mine`, `PATCH` and `DELETE /v1/irl/events/:uid`. Every route needs a signed-in member, because
 * the submitter edits the event later; a request with no session answers 401.
 *
 * Listed before `PLEventsController` in the module, so the static `/mine` path is matched before `/:uid`.
 * Every route answers 404 while `EVENTS_LOCAL_SUBMIT_ENABLED` is off.
 */
@Controller()
export class PLEventSubmissionsController {
  constructor(
    private readonly memberService: MembersService,
    private readonly eventService: PLEventsService,
    private readonly eventWriteService: PLEventWriteService
  ) {}

  @Api(server.route.submitPLEvent)
  @UseGuards(UserTokenValidation)
  @HttpCode(201)
  @NoCache()
  async submitPLEvent(@Body() rawBody: unknown, @Req() request: Request) {
    this.assertEnabled();
    const { draft, ...body } = parseBody<PLEventSubmitBody>(PLEventSubmitBodySchema, rawBody);
    const member = await this.requireMember(request);
    const actor = await this.eventWriteService.memberActor(member);
    return await this.eventWriteService.createEvent(body, actor, { draft: draft === true });
  }

  @Api(server.route.getMyPLEvents)
  @UseGuards(UserTokenValidation)
  @NoCache()
  async getMyPLEvents(@Req() request: Request) {
    this.assertEnabled();
    const member = await this.requireMember(request);
    return await this.eventService.listMyPLEvents(member.uid);
  }

  @Api(server.route.updatePLEvent)
  @UseGuards(UserTokenValidation)
  @NoCache()
  async updatePLEvent(@Param('uid') uid: string, @Body() rawBody: unknown, @Req() request: Request) {
    this.assertEnabled();
    const { submit, status, ...patch } = parseBody<PLEventPatchBody>(PLEventPatchBodySchema, rawBody);
    const member = await this.requireMember(request);
    const actor = await this.eventWriteService.memberActor(member);
    const event = await this.findOwnOrAdminEvent(uid, member.uid);
    this.eventWriteService.assertCanEdit(event, actor);

    // Only a directory admin sets a status; a submitter's `status` is ignored, as on submit.
    const adminStatus = actor.kind === 'member' && actor.isAdmin && status ? PLEventStatus[status] : undefined;
    return await this.eventWriteService.updateEvent(event, patch, actor, {
      submit: submit === true,
      status: adminStatus,
    });
  }

  @Api(server.route.deletePLEvent)
  @UseGuards(UserTokenValidation)
  @NoCache()
  async deletePLEvent(@Param('uid') uid: string, @Req() request: Request) {
    this.assertEnabled();
    const member = await this.requireMember(request);
    const actor = await this.eventWriteService.memberActor(member);
    const event = await this.findOwnOrAdminEvent(uid, member.uid);
    this.eventWriteService.assertCanDelete(event, actor);
    await this.eventWriteService.deleteEvent(event);
    return { uid, deleted: true };
  }

  private assertEnabled(): void {
    if (!isLocalEventSubmitEnabled()) {
      throw new NotFoundException();
    }
  }

  /** A draft is for its submitter only: for anyone else, a directory admin included, it does not exist. */
  private async findOwnOrAdminEvent(uid: string, memberUid: string) {
    const event = await this.eventWriteService.findEvent(uid);
    if (event.status === PLEventStatus.DRAFT && event.submitterUid !== memberUid) {
      throw new NotFoundException(`Event not found with uid: ${uid}.`);
    }
    return event;
  }

  private async signedInMember(request: Request) {
    const email: string | undefined = request['userEmail'];
    return email ? await this.memberService.findMemberByEmail(email) : null;
  }

  private async requireMember(request: Request) {
    const member = await this.signedInMember(request);
    if (!member) {
      throw new UnauthorizedException('Sign in to work with your events');
    }
    return member;
  }
}
