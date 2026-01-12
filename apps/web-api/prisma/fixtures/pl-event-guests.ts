import { Factory } from 'fishery';
import { PLEventGuest } from '@prisma/client';
import { faker } from '@faker-js/faker';
import sample from 'lodash/sample';
import { prisma } from './../index';

const getUidsFrom = async (model: keyof typeof prisma, where: Record<string, any> = {}) => {
  const rows = await (prisma as any)[model].findMany({
    select: { uid: true },
    where,
  });

  return (rows ?? []).map((r: any) => r.uid);
};

/**
 * PLEventGuest fixtures
 *
 * IMPORTANT:
 * - `locationUid` is REQUIRED by Prisma schema
 * - We always derive `locationUid` from the chosen `eventUid`
 *   to keep relations consistent.
 */
const eventGuestFactory = Factory.define<Omit<PLEventGuest, 'id'>>(({ onCreate }) => {
  onCreate(async (eventGuest) => {
    // Fetching UIDs for relational fields
    const memberUids = await getUidsFrom('member');
    if (!memberUids.length) {
      throw new Error('PLEventGuest fixture: no members found (member table is empty)');
    }
    eventGuest.memberUid = sample(memberUids) || '';

    const teamUids = await getUidsFrom('team');
    if (!teamUids.length) {
      throw new Error('PLEventGuest fixture: no teams found (team table is empty)');
    }
    eventGuest.teamUid = sample(teamUids) || '';

    const eventUids = await getUidsFrom('pLEvent', { isDeleted: false });
    if (!eventUids.length) {
      throw new Error('PLEventGuest fixture: no events found (pLEvent table is empty)');
    }
    eventGuest.eventUid = sample(eventUids) || '';

    if (!eventGuest.eventUid) {
      throw new Error('PLEventGuest fixture: eventUid is empty (sampling failed)');
    }

    // Derive locationUid from eventUid (required by schema)
    const ev = await prisma.pLEvent.findUnique({
      where: { uid: eventGuest.eventUid },
      select: { locationUid: true },
    });

    if (!ev?.locationUid) {
      throw new Error(
        `PLEventGuest fixture: cannot derive locationUid (event not found or missing locationUid), eventUid=${eventGuest.eventUid}`
      );
    }

    eventGuest.locationUid = ev.locationUid;
    return eventGuest;
  });

  return {
    uid: faker.datatype.uuid(),
    telegramId: faker.datatype.uuid(),
    officeHours: faker.helpers.arrayElement([null, faker.internet.url()]),
    reason: faker.helpers.arrayElement([null, faker.lorem.sentence()]),
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),

    memberUid: '',
    teamUid: '',
    eventUid: '',

    // REQUIRED by schema (will be overridden in onCreate)
    locationUid: 'TEMP',

    additionalInfo: faker.helpers.arrayElement([{}, { details: faker.lorem.paragraph() }]),
    topics: faker.helpers.arrayElements(
      faker.lorem.words(5).split(' '),
      faker.datatype.number({ min: 1, max: 5 })
    ),
    priority: faker.datatype.number({ min: 1, max: 100 }),
    isHost: faker.datatype.boolean(),
    isSpeaker: faker.datatype.boolean(),
    isSponsor: faker.datatype.boolean(),
    isFeatured: faker.datatype.boolean(),
  };
});

export const eventGuests = async () => await eventGuestFactory.createList(25);
