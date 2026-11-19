import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AssociationEntityType,
  AssociationRole,
  PLEvent,
  PLEventLocationStatus,
  PLEventStatus,
  Prisma,
} from '@prisma/client';
import {
  eventDateIssues,
  eventIssuesMessage,
  eventSubmissionIssues,
  isDateOnly,
  PLEventBodyAssociation,
  PLEventBodyFields,
} from 'libs/contracts/src/schema/pl-event-body';
import { FORUM_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { AccessControlV2Service } from '../access-control-v2/services/access-control-v2.service';
import { LogService } from '../shared/log.service';
import { PrismaService } from '../shared/prisma.service';
import { CacheService } from '../utils/cache/cache.service';
import { IrlGatheringPushCandidatesService } from './push/irl-gathering-push-candidates.service';
import {
  EventActor,
  eventSlug,
  eventWriteData,
  guestFlagsOfRole,
  readEventContacts,
  resolveEventDate,
  statusOnSubmit,
} from './pl-event-write';

type Tx = Prisma.TransactionClient;

/** A body with any subset of the event fields: a full body on create, a patch on edit. */
export type EventBodyInput = Partial<PLEventBodyFields>;

export type CreateEventOptions = {
  /** Store a draft: only its submitter sees it, and the submission checks wait for `submit`. */
  draft?: boolean;
  /** The source's own id of a partner event; unique per source team. */
  externalId?: string;
};

export type UpdateEventOptions = {
  /** Send a draft for approval: the submission checks run, then the status follows the rule for new submissions. */
  submit?: boolean;
  /** Set by a directory admin, or by a curator's decision. */
  status?: PLEventStatus;
};

export type EventWriteResult = { uid: string; status: PLEventStatus };

const LOG_CONTEXT = 'PLEventWriteService';
const DEFAULT_TIMEZONE = 'UTC';

function badRequest(issues: Array<{ path: string; message: string }>): never {
  throw new BadRequestException(eventIssuesMessage(issues));
}

/**
 * The one write path for events (LAB-3325, OpenSpec change `events-on-labos-stack`, design D4). A member submit and
 * edit, a curator's upsert and decision, and the MCP submit tool all go through it with a different actor. It
 * derives `type`, resolves the gathering from the address, stores the links to members and teams, and decides the
 * status. Guest rows of named members exist only while the event is approved.
 */
@Injectable()
export class PLEventWriteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LogService,
    private readonly cacheService: CacheService,
    private readonly pushCandidates: IrlGatheringPushCandidatesService,
    private readonly accessControl: AccessControlV2Service
  ) {}

  /** The actor of a signed-in member. Forum access is checked on the server, with the check the forum tools use. */
  async memberActor(member: { uid: string; isDirectoryAdmin?: boolean | null }): Promise<EventActor> {
    const access = await this.accessControl.hasPermission(member.uid, FORUM_PERMISSIONS.WRITE);
    return {
      kind: 'member',
      memberUid: member.uid,
      trusted: access.allowed === true,
      isAdmin: member.isDirectoryAdmin === true,
    };
  }

  /**
   * Stores a new event. The body is already parsed with the caller's schema (member or partner); this method
   * checks what needs the database (members, teams, images) and applies the rules that do not depend on the caller.
   */
  async createEvent(
    body: PLEventBodyFields,
    actor: EventActor,
    options: CreateEventOptions = {}
  ): Promise<EventWriteResult> {
    if (options.draft && actor.kind !== 'member') {
      throw new BadRequestException('Only a member can save a draft');
    }
    await this.assertReferencesExist(body);

    const event = await this.prisma.$transaction(async (tx) => {
      const data = eventWriteData(body, null);
      const contacts = readEventContacts(data.privateDetails);
      const gathering = await this.resolveGathering(data.format, contacts.address, body, tx);
      const timezone = body.timezone ?? gathering.timezone ?? DEFAULT_TIMEZONE;
      const startDate = resolveEventDate(body.startDate, 'start', timezone);
      const endDate = resolveEventDate(body.endDate ?? body.startDate, 'end', timezone);
      const status = options.draft ? PLEventStatus.DRAFT : statusOnSubmit(actor);

      const created = await tx.pLEvent.create({
        data: {
          ...data,
          name: body.name,
          slugURL: eventSlug(body.name),
          startDate,
          endDate,
          isAllDay: body.allDay === true,
          timezone,
          status,
          reviewedAt: null,
          externalId: options.externalId ?? null,
          submitterUid: actor.kind === 'member' ? actor.memberUid : null,
          sourceTeamUid: actor.kind === 'integration' ? actor.teamUid : null,
          locationUid: gathering.locationUid,
          pLEventLocationAssociationUid: gathering.associationUid,
          locationStatus: gathering.locationUid ? PLEventLocationStatus.AUTO_MAPPED : null,
        },
      });
      await this.replaceAssociations(created.uid, body.associations ?? [], tx);
      await this.syncNamedGuests(created, tx);
      return created;
    });

    await this.afterWrite(event.uid);
    this.logger.info(`Created event uid=${event.uid} status=${event.status} actor=${actor.kind}`, LOG_CONTEXT);
    return { uid: event.uid, status: event.status };
  }

  /**
   * Applies a patch to an event. A missing field keeps its value and `null` clears it. The status changes only
   * through `options`: an edit never changes it by itself.
   */
  async updateEvent(
    event: PLEvent,
    patch: EventBodyInput,
    actor: EventActor,
    options: UpdateEventOptions = {}
  ): Promise<EventWriteResult> {
    await this.assertReferencesExist(patch);

    const timezone = patch.timezone === undefined ? event.timezone : patch.timezone;
    const isAllDay = patch.allDay === undefined || patch.allDay === null ? event.isAllDay : patch.allDay;
    const dates = this.patchedDates(event, patch, isAllDay, timezone ?? DEFAULT_TIMEZONE);

    const wasDraft = event.status === PLEventStatus.DRAFT;
    const submitting = wasDraft && options.submit === true;
    let status: PLEventStatus = event.status;
    if (submitting) status = statusOnSubmit(actor);
    if (options.status) status = options.status;

    const updated = await this.prisma.$transaction(async (tx) => {
      const data = eventWriteData(patch, event);
      const name = patch.name ?? event.name;

      // A member's own event keeps what a submission needs; a draft waits for `submit`.
      if (actor.kind === 'member' && !actor.isAdmin && (submitting || !wasDraft)) {
        const issues = eventSubmissionIssues(
          { endDate: dates.endDate, timezone, format: data.format, tags: data.tags, hostName: data.hostName },
          { draft: false }
        );
        if (issues.length) badRequest(issues);
      } else if (actor.kind !== 'member' && !data.format) {
        badRequest([{ path: 'format', message: 'format is required' }]);
      }

      const addressChanged = patch.address !== undefined || patch.format !== undefined;
      const gathering = addressChanged
        ? await this.resolveGathering(data.format, readEventContacts(data.privateDetails).address, patch, tx)
        : null;

      const saved = await tx.pLEvent.update({
        where: { uid: event.uid },
        data: {
          ...data,
          name,
          startDate: dates.startDate,
          endDate: dates.endDate,
          isAllDay,
          timezone,
          status,
          ...(status !== event.status && !submitting ? { reviewedAt: new Date() } : {}),
          ...(gathering
            ? {
                locationUid: gathering.locationUid,
                pLEventLocationAssociationUid: gathering.associationUid,
                locationStatus: gathering.locationUid ? PLEventLocationStatus.AUTO_MAPPED : null,
              }
            : {}),
        },
      });
      if (patch.associations !== undefined) {
        await this.replaceAssociations(event.uid, patch.associations ?? [], tx);
      }
      await this.syncNamedGuests(saved, tx);
      return saved;
    });

    await this.afterWrite(event.uid);
    return { uid: updated.uid, status: updated.status };
  }

  /**
   * Sets the approval status of an event, with an optional note. Repeating a decision changes nothing. Guest rows of
   * the members the event names follow the status in the same transaction.
   */
  async decide(event: PLEvent, status: PLEventStatus, note?: string | null): Promise<EventWriteResult> {
    if (event.status === status) {
      return { uid: event.uid, status: event.status };
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.pLEvent.update({
        where: { uid: event.uid },
        data: { status, reviewedAt: new Date(), reviewNote: note ?? null },
      });
      await this.syncNamedGuests(saved, tx);
      return saved;
    });
    await this.afterWrite(event.uid);
    this.logger.info(`Event uid=${event.uid} decided ${event.status} → ${status}`, LOG_CONTEXT);
    return { uid: updated.uid, status: updated.status };
  }

  /** Soft-deletes an event; it leaves every read. Its guest rows of named members go with it. */
  async deleteEvent(event: PLEvent): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const saved = await tx.pLEvent.update({ where: { uid: event.uid }, data: { isDeleted: true } });
      await this.syncNamedGuests(saved, tx);
    });
    await this.afterWrite(event.uid);
  }

  /** Whether the actor may edit the event: the member who submitted it, a directory admin, or a curator key. */
  assertCanEdit(event: PLEvent, actor: EventActor): void {
    if (actor.kind === 'integration') return;
    if (actor.kind === 'member' && (actor.isAdmin || event.submitterUid === actor.memberUid)) return;
    throw new ForbiddenException('Only the member who submitted this event can change it');
  }

  /**
   * Whether the actor may delete the event. A submitter cannot delete their approved event; a directory admin can.
   * A curator key deletes only the events its own team published.
   */
  assertCanDelete(event: PLEvent, actor: EventActor): void {
    if (actor.kind === 'integration') {
      if (event.sourceTeamUid && event.sourceTeamUid === actor.teamUid) return;
      throw new ForbiddenException('An integration key can delete only the events its team published');
    }
    if (actor.kind === 'member' && actor.isAdmin) return;
    if (actor.kind === 'member' && event.submitterUid === actor.memberUid) {
      if (event.status === PLEventStatus.APPROVED) {
        throw new ForbiddenException('A published event can be removed by a directory admin only');
      }
      return;
    }
    throw new ForbiddenException('Only the member who submitted this event can delete it');
  }

  /** A non-deleted event by uid, whatever its status. The write path and the owner's read use it. */
  async findEvent(uid: string): Promise<PLEvent> {
    // pl-event-visibility: the write path and the submitter's own read see an event in every status.
    const event = await this.prisma.pLEvent.findFirst({ where: { uid, isDeleted: false } });
    if (!event) throw new NotFoundException(`Event not found with uid: ${uid}.`);
    return event;
  }

  /** The dates of the event with the patch applied, checked as a whole. */
  private patchedDates(event: PLEvent, patch: EventBodyInput, isAllDay: boolean, timezone: string) {
    for (const [path, value] of [
      ['startDate', patch.startDate],
      ['endDate', patch.endDate],
    ] as const) {
      if (value && isDateOnly(value) !== isAllDay) {
        badRequest(eventDateIssues({ [path]: value, allDay: isAllDay }));
      }
    }
    if (isAllDay !== event.isAllDay && !(patch.startDate && patch.endDate)) {
      badRequest([{ path: 'allDay', message: 'send startDate and endDate when allDay changes' }]);
    }
    const startDate = patch.startDate ? resolveEventDate(patch.startDate, 'start', timezone) : event.startDate;
    const endDate = patch.endDate ? resolveEventDate(patch.endDate, 'end', timezone) : event.endDate;
    if (endDate < startDate) {
      badRequest([{ path: 'endDate', message: 'endDate is before startDate' }]);
    }
    return { startDate, endDate };
  }

  /** Members, teams and images a body names must exist; an unknown uid answers 400 before anything is stored. */
  private async assertReferencesExist(body: EventBodyInput): Promise<void> {
    const associations = body.associations ?? [];
    const memberUids = [...new Set(associations.map((item) => item.memberUid).filter((uid): uid is string => !!uid))];
    const teamUids = [...new Set(associations.map((item) => item.teamUid).filter((uid): uid is string => !!uid))];
    const imageUids = [body.logoUid, body.bannerUid].filter((uid): uid is string => !!uid);

    const [members, teams, images] = await Promise.all([
      memberUids.length
        ? this.prisma.member.findMany({ where: { uid: { in: memberUids } }, select: { uid: true } })
        : [],
      teamUids.length ? this.prisma.team.findMany({ where: { uid: { in: teamUids } }, select: { uid: true } }) : [],
      imageUids.length ? this.prisma.image.findMany({ where: { uid: { in: imageUids } }, select: { uid: true } }) : [],
    ]);
    const missing = (wanted: string[], found: Array<{ uid: string }>) =>
      wanted.filter((uid) => !found.some((row) => row.uid === uid));

    const unknownMembers = missing(memberUids, members);
    const unknownTeams = missing(teamUids, teams);
    const unknownImages = missing([...new Set(imageUids)], images);
    if (unknownMembers.length) throw new BadRequestException(`Unknown member: ${unknownMembers.join(', ')}`);
    if (unknownTeams.length) throw new BadRequestException(`Unknown team: ${unknownTeams.join(', ')}`);
    if (unknownImages.length) throw new BadRequestException(`Unknown image: ${unknownImages.join(', ')}`);
  }

  /**
   * The gathering of an event, from its city, state and country (design D6). A known triple reuses its gathering.
   * An unknown one creates a gathering named from the city and country, with the event's time zone, and an
   * association. A virtual event, and an event with no city, has no gathering.
   */
  private async resolveGathering(
    format: string | null,
    address: { city: string | null; state: string | null; country: string | null },
    body: EventBodyInput,
    tx: Tx
  ): Promise<{ locationUid: string | null; associationUid: string | null; timezone: string | null }> {
    if (format === 'VIRTUAL' || !address.city) {
      return { locationUid: null, associationUid: null, timezone: null };
    }
    const triple = { city: address.city, state: address.state, country: address.country };

    const association = await tx.pLEventLocationAssociation.findFirst({
      where: {
        city: { equals: triple.city, mode: 'insensitive' },
        state: triple.state ? { equals: triple.state, mode: 'insensitive' } : null,
        country: triple.country ? { equals: triple.country, mode: 'insensitive' } : null,
        isDeleted: false,
        location: { isDeleted: false },
      },
      orderBy: { createdAt: 'desc' },
      select: { uid: true, locationUid: true, location: { select: { timezone: true } } },
    });
    if (association) {
      return {
        locationUid: association.locationUid,
        associationUid: association.uid,
        timezone: association.location.timezone,
      };
    }

    const name = triple.country ? `${triple.city}, ${triple.country}` : triple.city;
    const existing = await tx.pLEventLocation.findFirst({
      where: {
        isDeleted: false,
        OR: [
          { location: { equals: name, mode: 'insensitive' } },
          { location: { equals: triple.city, mode: 'insensitive' } },
        ],
      },
      select: { uid: true, timezone: true },
    });
    const location =
      existing ??
      (await tx.pLEventLocation.create({
        data: {
          location: name,
          country: triple.country,
          timezone: body.timezone ?? null,
          latitude: body.address?.latitude != null ? body.address.latitude.toFixed(2) : null,
          longitude: body.address?.longitude != null ? body.address.longitude.toFixed(2) : null,
        },
        select: { uid: true, timezone: true },
      }));

    const created = await tx.pLEventLocationAssociation.create({
      data: {
        locationUid: location.uid,
        googlePlaceId: '',
        locationName: body.address?.address ?? name,
        city: triple.city,
        state: triple.state,
        country: triple.country,
      },
      select: { uid: true },
    });
    this.logger.info(
      `Gathering ${location.uid} mapped for "${name}" (${existing ? 'reused' : 'created'})`,
      LOG_CONTEXT
    );
    return { locationUid: location.uid, associationUid: created.uid, timezone: location.timezone };
  }

  /** Replaces the event's links to members and teams with the given list. */
  private async replaceAssociations(eventUid: string, associations: PLEventBodyAssociation[], tx: Tx): Promise<void> {
    // Guest rows that came from a link are removed with it (cascade); syncNamedGuests writes the current ones.
    await tx.pLEventAssociation.deleteMany({ where: { eventUid } });
    const seen = new Set<string>();
    for (const item of associations) {
      const key = `${item.role}:${item.memberUid ?? ''}:${item.teamUid ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      await tx.pLEventAssociation.create({
        data: {
          eventUid,
          role: AssociationRole[item.role],
          entityType: item.memberUid ? AssociationEntityType.MEMBER : AssociationEntityType.TEAM,
          memberUid: item.memberUid ?? null,
          teamUid: item.teamUid ?? null,
        },
      });
    }
  }

  /**
   * Keeps the guest rows of the members an event names in step with its status (design D5): written when the event
   * is approved, visible and has a gathering, removed otherwise. So a member never shows as going to an event that
   * is not approved. Rows of members who chose "I'm going" themselves are left alone.
   */
  private async syncNamedGuests(event: PLEvent, tx: Tx): Promise<void> {
    const visible = event.status === PLEventStatus.APPROVED && !event.isDeleted && !!event.locationUid;
    const links = await tx.pLEventAssociation.findMany({
      where: { eventUid: event.uid, entityType: AssociationEntityType.MEMBER, memberUid: { not: null } },
      select: { uid: true, memberUid: true, role: true },
    });

    if (!visible || !event.locationUid) {
      await tx.pLEventGuest.deleteMany({ where: { eventUid: event.uid, associationUid: { not: null } } });
      return;
    }

    // One row per member: a member named twice (host and speaker) gets both flags.
    const byMember = new Map<
      string,
      { associationUid: string; isHost: boolean; isSpeaker: boolean; isSponsor: boolean }
    >();
    for (const link of links) {
      if (!link.memberUid) continue;
      const flags = guestFlagsOfRole(link.role);
      const entry = byMember.get(link.memberUid) ?? {
        associationUid: link.uid,
        isHost: false,
        isSpeaker: false,
        isSponsor: false,
      };
      byMember.set(link.memberUid, {
        associationUid: entry.associationUid,
        isHost: entry.isHost || flags.isHost,
        isSpeaker: entry.isSpeaker || flags.isSpeaker,
        isSponsor: entry.isSponsor || flags.isSponsor,
      });
    }

    await tx.pLEventGuest.deleteMany({
      where: {
        eventUid: event.uid,
        associationUid: { not: null },
        memberUid: { notIn: [...byMember.keys()] },
      },
    });

    for (const [memberUid, entry] of byMember) {
      const existing = await tx.pLEventGuest.findFirst({
        where: { memberUid, eventUid: event.uid },
        select: { uid: true },
      });
      if (existing) {
        await tx.pLEventGuest.update({
          where: { uid: existing.uid },
          data: { ...entry, locationUid: event.locationUid },
        });
        continue;
      }
      // PLEventGuest holds one team per member; the main team, as the events sync chose it.
      const teamRole = await tx.teamMemberRole.findFirst({
        where: { memberUid },
        orderBy: { mainTeam: 'desc' },
        select: { teamUid: true },
      });
      await tx.pLEventGuest.create({
        data: {
          memberUid,
          eventUid: event.uid,
          locationUid: event.locationUid,
          teamUid: teamRole?.teamUid ?? null,
          ...entry,
        },
      });
    }
  }

  /** Caches and push candidates read events; they are refreshed after the transaction commits. */
  private async afterWrite(eventUid: string): Promise<void> {
    this.cacheService.reset({ service: 'PLEventGuest' });
    try {
      await this.pushCandidates.refreshCandidatesForEvents([eventUid]);
    } catch (error) {
      this.logger.error(
        `Push candidates refresh failed for event ${eventUid}: ${error?.message}`,
        error?.stack,
        LOG_CONTEXT
      );
    }
  }
}
