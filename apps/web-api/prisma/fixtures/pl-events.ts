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
      ).map((result) => result.uid);
      event.logoUid = sample(logoImageUids) || '';
      event.bannerUid = sample(logoImageUids) || '';
      return event;
    });

    const startDate = faker.date.future();
    // Manually set endDate to a random time after startDate, ensuring it's in the future
    const endDate = new Date(startDate.getTime() + faker.datatype.number({ min: 1, max: 30 }) * 24 * 60 * 60 * 1000);

    return {
      uid: faker.datatype.uuid(),
      type: faker.helpers.arrayElement(['INVITE_ONLY', null]),
      name: faker.company.name(),
      description: faker.lorem.paragraph(),
      eventsCount: faker.datatype.number({ min: 1, max: 100 }),
      startDate: startDate,
      endDate: endDate,
      shortDescription: faker.lorem.sentence(),
      isFeatured: faker.datatype.boolean(),
      telegramId: faker.datatype.uuid(),
      websiteURL: faker.internet.url(),
      resources: [{ 
        url: faker.internet.url(), 
        description: faker.lorem.sentence(),
        name: faker.company.name() 
      }],
      logoUid: '',
      bannerUid: '',
      locationUid: '',
      additionalInfo: {},
      priority: faker.datatype.number({ min: 1, max: 100 }),
      slugURL: `${faker.helpers.slugify(faker.company.name())}-${sequence}`,
      createdAt: faker.date.past(),
      updatedAt: faker.date.recent(),
    };
  }
);

export const events = async () => await eventFactory.createList(25);
