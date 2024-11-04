import { Factory } from 'fishery';
import { PLEvent } from '@prisma/client';
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

const eventFactory = Factory.define<Omit<PLEvent, 'id'>>(
  ({ sequence, onCreate }) => {
    onCreate(async (event) => {
      const locationUids = await ( 
        await getUidsFrom('pLEventLocation')
      ).map((result) => result.uid);
      event.locationUid = sample(locationUids) || '';
      const logoImageUids = await ( 
        await getUidsFrom('image', { thumbnailToUid: null })
      ).map((result) => result.uid);;
      event.logoUid = sample(logoImageUids) || '';
      event.bannerUid = sample(logoImageUids) || '';
      return event;
    });

    return {
      uid: faker.datatype.uuid(),
      type: faker.helpers.arrayElement(['INVITE_ONLY', null]),
      name: faker.company.name(),
      description: faker.lorem.paragraph(),
      eventsCount: faker.datatype.number({ min: 1, max: 100 }),
      startDate: faker.date.future(),
      endDate: faker.date.future(),
      shortDescription: faker.lorem.sentence(),
      isFeatured: faker.datatype.boolean(),
      telegramId: faker.datatype.uuid(),
      websiteURL: faker.internet.url(),
      resources: [{ url: faker.internet.url(), description: faker.lorem.sentence() }],
      logoUid: '',
      bannerUid: '',
      locationUid: '',
      additionalInfo: {},
      priority: faker.datatype.number({min: 1, max: 100}),
      slugURL: `${faker.helpers.slugify(faker.company.name())} + ${sequence}`,
      createdAt: faker.date.past(),
      updatedAt: faker.date.recent(),
    };
  }
);

export const events = async () => await eventFactory.createList(25);

  