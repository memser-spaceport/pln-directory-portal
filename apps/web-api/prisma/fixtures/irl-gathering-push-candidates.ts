import { IrlGatheringPushRuleKind, PLEvent, PLEventGuest, PLEventLocation } from '@prisma/client';
import { prisma } from '../index';

const daysFromNow = (d: number) => new Date(Date.now() + d * 24 * 60 * 60 * 1000);

/**
 * Deterministic fixtures for IRL Gathering Push Notifications.
 *
 * Goals:
 * - Create a single location with multiple upcoming events
 * - Ensure thresholds are met:
 *   - totalEventsThreshold >= 5
 *   - minAttendeesPerEvent >= 5
 * - Produce stable UPCOMING and REMINDER candidates
 * - Allow processor + back-office to be tested end-to-end
 */

export const IRL_FIXTURE_LOCATION_UID = 'irl-loc-fixture-kyiv';

export const IRL_FIXTURE_EVENT_UIDS = [
  'irl-ev-fixture-1',
  'irl-ev-fixture-2',
  'irl-ev-fixture-3',
  'irl-ev-fixture-4',
  'irl-ev-fixture-5',
];

/**
 * Single deterministic location used by all fixture events.
 */
export const irlGatheringPushEventLocations: Array<Omit<PLEventLocation, 'id'>> = [
  {
    uid: IRL_FIXTURE_LOCATION_UID,
    location: 'Kyiv',
    description: 'IRL gathering push fixtures location',
    country: 'Ukraine',
    timezone: 'Europe/Kyiv',
    latitude: '50.4501',
    longitude: '30.5234',
    flag: 'https://plabs-assets.s3.us-west-1.amazonaws.com/images/Ukraine-flag.png',
    icon: 'https://plabs-assets.s3.us-west-1.amazonaws.com/images/Kyiv.svg',
    priority: 1,
    resources: [],
    additionalInfo: {},
    isFeatured: false,
    isAggregated: false,
    aggregatedPriority: 1,
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

/**
 * Five upcoming events inside the UPCOMING window.
 *
 * Event #1 starts in 1 day → eligible for REMINDER (assuming reminderDaysBefore = 1).
 * All events share the same location.
 */
export const irlGatheringPushEvents: Array<Omit<PLEvent, 'id'>> = IRL_FIXTURE_EVENT_UIDS.map(
  (uid, idx) => ({
    uid,
    type: null,
    name: `Fixture IRL #${idx + 1}`,
    description: `IRL gathering push fixture event ${idx + 1}`,
    shortDescription: `Fixture IRL #${idx + 1}`,
    eventsCount: 0,
    startDate: daysFromNow(idx + 1),
    endDate: daysFromNow(idx + 1.5),
    slugURL: `fixture-irl-${idx + 1}`,
    locationUid: IRL_FIXTURE_LOCATION_UID,
    isFeatured: false,
    isDeleted: false,
    isAggregated: false,
    aggregatedPriority: 1,
    priority: 1,
    telegramId: null,
    websiteURL: null,
    resources: [],
    logoUid: null,
    bannerUid: null,
    additionalInfo: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    externalId: `fixture-irl-${idx + 1}`,
    syncedAt: new Date(),
    locationStatus: 'AUTO_MAPPED' as any,
    reviewerUid: null,
    pLEventLocationAssociationUid: null,
  }),
);

/**
 * Create deterministic event guests.
 *
 * Guarantees:
 * - At least 6 attendees per event (minAttendeesPerEvent >= 5)
 * - Partial overlap of attendees across events
 *   → allows testing "top attendees" aggregation
 */
export const irlGatheringPushEventGuests = async (): Promise<Array<Omit<PLEventGuest, 'id'>>> => {
  const members = await prisma.member.findMany({
    select: { uid: true },
    orderBy: { createdAt: 'asc' },
    take: 40,
  });

  if (members.length < 12) {
    throw new Error(`Not enough members for IRL push fixtures (need >= 12, got ${members.length})`);
  }

  const guests: Array<Omit<PLEventGuest, 'id'>> = [];
  const attendeesPerEvent = 6;

  for (let i = 0; i < IRL_FIXTURE_EVENT_UIDS.length; i++) {
    const eventUid = IRL_FIXTURE_EVENT_UIDS[i];
    const offset = i * 3;

    members.slice(offset, offset + attendeesPerEvent).forEach((m, idx) => {
      guests.push({
        uid: `irl-guest-${i + 1}-${idx + 1}-${m.uid}`,
        memberUid: m.uid,
        eventUid,

        locationUid: IRL_FIXTURE_LOCATION_UID,

        // optional / nullable in schema
        teamUid: null,
        telegramId: null,
        officeHours: null,
        reason: null,

        topics: [],
        additionalInfo: {},
        priority: 1,
        isHost: false,
        isSpeaker: false,
        isSponsor: false,
        isFeatured: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
    });
  }

  return guests;
};

/**
 * Create IRL Gathering Push Candidates.
 *
 * - UPCOMING: first 2 events (qualifiedEventsThreshold >= 2)
 * - REMINDER: first event only (inside reminder window)
 *
 * Attendee count is derived from guests and stored explicitly
 * because candidates are the authoritative source for payload counts.
 */
export const irlGatheringPushCandidates = async () => {
  const counts = await prisma.pLEventGuest.groupBy({
    by: ['eventUid'],
    where: { eventUid: { in: IRL_FIXTURE_EVENT_UIDS } },
    _count: { eventUid: true },
  });

  const countByEventUid = new Map(counts.map((c) => [c.eventUid, c._count.eventUid]));

  const events = await prisma.pLEvent.findMany({
    where: { uid: { in: IRL_FIXTURE_EVENT_UIDS } },
    select: { uid: true, startDate: true, endDate: true },
  });

  const eventByUid = new Map(events.map((e) => [e.uid, e]));

  const candidateFor = (eventUid: string) => {
    const ev = eventByUid.get(eventUid);
    if (!ev) throw new Error(`Fixture event not found: ${eventUid}`);

    return {
      eventUid,
      eventStartDate: ev.startDate,
      eventEndDate: ev.endDate,
      attendeeCount: countByEventUid.get(eventUid) ?? 0,
    };
  };

  const upcoming = [IRL_FIXTURE_EVENT_UIDS[0], IRL_FIXTURE_EVENT_UIDS[1]].map(candidateFor);
  const reminder = [IRL_FIXTURE_EVENT_UIDS[0]].map(candidateFor);

  return [
    ...upcoming.map((c, i) => ({
      uid: `irl-cand-upcoming-${i + 1}`,
      ruleKind: IrlGatheringPushRuleKind.UPCOMING,
      gatheringUid: IRL_FIXTURE_LOCATION_UID,
      ...c,
      isSuppressed: false,
      processedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    ...reminder.map((c, i) => ({
      uid: `irl-cand-reminder-${i + 1}`,
      ruleKind: IrlGatheringPushRuleKind.REMINDER,
      gatheringUid: IRL_FIXTURE_LOCATION_UID,
      ...c,
      isSuppressed: false,
      processedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  ];
};
