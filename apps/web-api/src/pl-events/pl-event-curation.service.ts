import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PLEvent, PLEventStatus, Prisma } from '@prisma/client';
import {
  eventIssuesMessage,
  PLEventPartnerBodySchema,
  PLEventPartnerPatchBodySchema,
} from 'libs/contracts/src/schema/pl-event-body';
import {
  PL_EVENT_CURATION_DEFAULT_LIMIT,
  PL_EVENT_CURATION_MAX_LIMIT,
  PLEventBatchItemResult,
  PLEventCurationItem,
  PLEventCurationList,
  PLEventCurationStatusSchema,
  PLEventExternalIdSchema,
  PLEventUpsertResult,
} from 'libs/contracts/src/schema/pl-event-curation';
import { decodeCursor, encodeCursor } from '../integration-keys/integration-candidates.service';
import { PrismaService } from '../shared/prisma.service';
import { assembleEventDetails } from './pl-event-details.mapper';
import { EventActor, readEventContacts } from './pl-event-write';
import { PLEventWriteService } from './pl-event-write.service';

const CURATION_SELECT = {
  uid: true,
  status: true,
  externalId: true,
  sourceTeamUid: true,
  submitterUid: true,
  submitter: { select: { uid: true, name: true, email: true } },
  reviewedAt: true,
  reviewNote: true,
  name: true,
  slugURL: true,
  description: true,
  startDate: true,
  endDate: true,
  isAllDay: true,
  timezone: true,
  format: true,
  accessOption: true,
  tags: true,
  isFeatured: true,
  hostName: true,
  websiteURL: true,
  registrationUrl: true,
  meetingUrl: true,
  venueAddress: true,
  latitude: true,
  longitude: true,
  additionalInfo: true,
  privateDetails: true,
  logoUid: true,
  logo: { select: { url: true } },
  location: { select: { uid: true, location: true, timezone: true } },
  eventAssociations: { select: { role: true, memberUid: true, teamUid: true } },
  createdAt: true,
  updatedAt: true,
};

type CurationRow = Prisma.PLEventGetPayload<{ select: typeof CURATION_SELECT }>;

type RawQuery = Record<string, unknown> | undefined;

/** 422 with the problems as one line of text (the API's error filter returns `message` only when it is text). */
function unprocessable(problems: string | Array<{ path: Array<string | number>; message: string }>): never {
  throw new UnprocessableEntityException(typeof problems === 'string' ? problems : eventIssuesMessage(problems));
}

/**
 * The curation API a partner app calls with a team-scoped integration key (LAB-3326, design D7): read events in
 * every status, decide on them, and publish and maintain its own events by its own ids. Writes go through
 * `PLEventWriteService` with the key's team as the actor, so a decision or a new event is visible in LabOS in the
 * same request.
 */
@Injectable()
export class PLEventCurationService {
  constructor(private readonly prisma: PrismaService, private readonly eventWriteService: PLEventWriteService) {}

  /**
   * Non-deleted events that are not drafts, oldest change first, in pages by a keyset on `(updatedAt, uid)`.
   * `nextCursor` is null on the last page; a poller then continues with `updatedSince`.
   */
  async list(teamUid: string, query: RawQuery): Promise<PLEventCurationList> {
    const statuses = this.statuses(query?.status);
    const limit = this.limit(query?.limit);
    const cursor = typeof query?.cursor === 'string' && query.cursor ? decodeCursor(query.cursor) : null;
    const updatedSince = this.date(query?.updatedSince, 'updatedSince');

    const and: Prisma.PLEventWhereInput[] = [];
    if (cursor) {
      const at = new Date(cursor.t);
      and.push({ OR: [{ updatedAt: { gt: at } }, { AND: [{ updatedAt: at }, { uid: { gt: cursor.u } }] }] });
    }
    if (updatedSince) and.push({ updatedAt: { gte: updatedSince } });

    // pl-event-visibility: a curator reads events in every status except drafts.
    const rows = await this.prisma.pLEvent.findMany({
      where: { isDeleted: false, status: { in: statuses }, AND: and },
      orderBy: [{ updatedAt: 'asc' }, { uid: 'asc' }],
      take: limit + 1,
      select: CURATION_SELECT,
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map((row) => toCurationItem(row, teamUid)),
      nextCursor: rows.length > limit && last ? encodeCursor({ t: last.updatedAt.toISOString(), u: last.uid }) : null,
    };
  }

  /** One event as the curator reads it, after a write. */
  async item(uid: string, teamUid: string): Promise<PLEventCurationItem> {
    // pl-event-visibility: a curator reads events in every status except drafts.
    const row = await this.prisma.pLEvent.findFirst({ where: { uid, isDeleted: false }, select: CURATION_SELECT });
    if (!row) throw new NotFoundException(`Event not found with uid: ${uid}.`);
    return toCurationItem(row, teamUid);
  }

  /** Approve or reject an event in any status but draft. Repeating a decision changes nothing. */
  async decide(uid: string, status: 'APPROVED' | 'REJECTED', note: string | null | undefined) {
    const event = await this.curatable(uid);
    return await this.eventWriteService.decide(event, PLEventStatus[status], note);
  }

  /**
   * Creates the event when the key's team has none with this `externalId`, updates it otherwise, and restores a
   * deleted one. A new and a restored event are `APPROVED`; an update keeps the status. Fields the body leaves out
   * keep their values on an update.
   */
  async upsert(teamUid: string, rawExternalId: unknown, rawBody: unknown): Promise<PLEventUpsertResult> {
    const externalId = PLEventExternalIdSchema.safeParse(rawExternalId);
    if (!externalId.success)
      unprocessable([{ path: ['externalId'], message: 'externalId must be 1 to 200 characters' }]);
    const parsed = PLEventPartnerBodySchema.safeParse(rawBody ?? {});
    if (!parsed.success) unprocessable(parsed.error.issues);

    const actor: EventActor = { kind: 'integration', teamUid };
    // pl-event-visibility: a partner event is found by its own id whatever its state, deleted included (restore).
    const existing = await this.prisma.pLEvent.findFirst({
      where: { sourceTeamUid: teamUid, externalId: externalId.data },
    });

    return await this.as422(async () => {
      if (!existing) {
        const created = await this.eventWriteService.createEvent(parsed.data, actor, { externalId: externalId.data });
        return { ...created, externalId: externalId.data, result: 'created' as const };
      }
      const event = existing.isDeleted ? await this.restore(existing) : existing;
      const updated = await this.eventWriteService.updateEvent(event, parsed.data, actor);
      return { ...updated, externalId: externalId.data, result: 'updated' as const };
    });
  }

  /** The single-event rules for each item, each in its own transaction. One bad item never stops the others. */
  async upsertBatch(teamUid: string, events: unknown[]): Promise<PLEventBatchItemResult[]> {
    const results: PLEventBatchItemResult[] = [];
    for (const item of events) {
      const { externalId, ...body } = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      try {
        results.push(await this.upsert(teamUid, externalId, body));
      } catch (error) {
        results.push({
          externalId: typeof externalId === 'string' ? externalId : null,
          result: 'error',
          error: this.reason(error),
        });
      }
    }
    return results;
  }

  /** Corrects the given fields of any event. The status and the submitter never change here. */
  async patch(teamUid: string, uid: string, rawBody: unknown) {
    const parsed = PLEventPartnerPatchBodySchema.safeParse(rawBody ?? {});
    if (!parsed.success) unprocessable(parsed.error.issues);
    const event = await this.curatable(uid);
    return await this.as422(() =>
      this.eventWriteService.updateEvent(event, parsed.data, { kind: 'integration', teamUid })
    );
  }

  /** Deletes an event the key's team published. Any other event answers 403. */
  async delete(teamUid: string, uid: string): Promise<void> {
    const event = await this.curatable(uid);
    this.eventWriteService.assertCanDelete(event, { kind: 'integration', teamUid });
    await this.eventWriteService.deleteEvent(event);
  }

  /** A non-deleted event a curator may act on. A draft does not exist for a curator. */
  private async curatable(uid: string): Promise<PLEvent> {
    const event = await this.eventWriteService.findEvent(uid);
    if (event.status === PLEventStatus.DRAFT) {
      throw new NotFoundException(`Event not found with uid: ${uid}.`);
    }
    return event;
  }

  private async restore(event: PLEvent): Promise<PLEvent> {
    return await this.prisma.pLEvent.update({
      where: { uid: event.uid },
      data: { isDeleted: false, status: PLEventStatus.APPROVED },
    });
  }

  /** The write path answers 400 for a body it refuses; this API answers 422, like the other integration routes. */
  private async as422<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof BadRequestException) {
        unprocessable(error.message);
      }
      throw error;
    }
  }

  private reason(error: unknown): string {
    return error instanceof HttpException ? error.message : 'The event could not be stored';
  }

  private statuses(raw: unknown): PLEventStatus[] {
    if (raw === undefined || raw === null || raw === '') {
      return [PLEventStatus.PENDING, PLEventStatus.APPROVED, PLEventStatus.REJECTED];
    }
    const values = (Array.isArray(raw) ? raw : String(raw).split(','))
      .map((value) => String(value).trim())
      .filter(Boolean);
    const parsed = PLEventCurationStatusSchema.array().safeParse(values);
    if (!parsed.success) throw new BadRequestException('status must be one or more of PENDING, APPROVED, REJECTED');
    return parsed.data.map((status) => PLEventStatus[status]);
  }

  private limit(raw: unknown): number {
    if (raw === undefined || raw === null || raw === '') return PL_EVENT_CURATION_DEFAULT_LIMIT;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1 || value > PL_EVENT_CURATION_MAX_LIMIT) {
      throw new BadRequestException(`limit must be an integer from 1 to ${PL_EVENT_CURATION_MAX_LIMIT}`);
    }
    return value;
  }

  private date(raw: unknown, name: string): Date | null {
    if (raw === undefined || raw === null || raw === '') return null;
    const parsed = new Date(String(raw));
    if (Number.isNaN(parsed.getTime())) throw new BadRequestException(`Invalid ${name}`);
    return parsed;
  }
}

/** One event as a partner app reads it. */
export function toCurationItem(row: CurationRow, teamUid: string): PLEventCurationItem {
  const details = assembleEventDetails(row.additionalInfo, row);
  const contacts = readEventContacts(row.privateDetails);
  const coHosts = contacts.coHosts.length
    ? contacts.coHosts
    : details.coHosts.map((coHost) => ({ name: coHost.name, email: null }));

  return {
    uid: row.uid,
    status: row.status as PLEventCurationItem['status'],
    externalId: row.externalId ?? null,
    createdByYourTeam: !!row.sourceTeamUid && row.sourceTeamUid === teamUid,
    submitter: row.submitterUid
      ? { memberUid: row.submitterUid, name: row.submitter?.name ?? null, email: row.submitter?.email ?? null }
      : null,
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    reviewNote: row.reviewNote ?? null,
    name: row.name,
    slugURL: row.slugURL,
    description: row.description ?? null,
    startDate: row.startDate.toISOString(),
    endDate: row.endDate.toISOString(),
    allDay: row.isAllDay,
    timezone: row.timezone ?? row.location?.timezone ?? null,
    format: row.format ?? null,
    accessOption: row.accessOption ?? null,
    tags: details.tags.map((tag) => tag.name),
    isFeatured: row.isFeatured === true,
    hostName: details.host?.name ?? null,
    hostEmail: contacts.hostEmail,
    coHosts,
    websiteUrl: row.websiteURL ?? null,
    registrationUrl: row.registrationUrl ?? null,
    meetingUrl: row.meetingUrl ?? null,
    locationUrl: details.locationUrl ?? null,
    contactInfos: details.contactInfos ?? null,
    agenda: details.agenda,
    address: {
      address: row.venueAddress ?? null,
      city: contacts.address.city,
      state: contacts.address.state,
      country: contacts.address.country,
      latitude: row.latitude ?? null,
      longitude: row.longitude ?? null,
      locationInstructions: details.locationInstructions ?? null,
    },
    gathering: row.location ? { uid: row.location.uid, name: row.location.location } : null,
    logoUid: row.logoUid ?? null,
    logo: row.logo?.url ?? null,
    associations: row.eventAssociations.map((link) => ({
      role: link.role,
      memberUid: link.memberUid,
      teamUid: link.teamUid,
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
