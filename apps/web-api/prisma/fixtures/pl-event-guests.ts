import { Factory } from 'fishery';
import { PLEventGuest } from '@prisma/client';
import { faker } from '@faker-js/faker';
import sample from 'lodash/sample';
import { prisma } from './../index';

const getUidsFrom = async (model, where = {}) => {
  return await prisma[model].findMany({
    select: {
      uid: true,
    },
    where,
  });
};

const eventGuestFactory = Factory.define<Omit<PLEventGuest, 'id'>>(
  ({ onCreate }) => {
    onCreate(async (eventGuest) => {
      // Fetching UIDs for relational fields
      const memberUids = await ( 
        await getUidsFrom('member')
      ).map((result) => result.uid);
      eventGuest.memberUid = sample(memberUids) || '';

      const teamUids = await (
        await getUidsFrom('team')
      ).map((result) => result.uid);
      eventGuest.teamUid = sample(teamUids) || '';

      const eventUids = await (
        await getUidsFrom('pLEvent')
      ).map((result) => result.uid);
      eventGuest.eventUid = sample(eventUids) || '';

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
      additionalInfo: faker.helpers.arrayElement([{}, { details: faker.lorem.paragraph() }]),
      topics: faker.helpers.arrayElements(faker.lorem.words(5).split(' '), faker.datatype.number({ min: 1, max: 5 })),
      priority: faker.datatype.number({ min: 1, max: 100 }),
      isHost: faker.datatype.boolean(),
      isSpeaker: faker.datatype.boolean(),
      isFeatured: faker.datatype.boolean(),
    };
  }
);

export const eventGuests = async () => await eventGuestFactory.createList(25);
