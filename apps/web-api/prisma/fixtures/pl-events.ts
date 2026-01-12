import { Factory } from 'fishery';
import { PLEvent, PLEventLocationStatus } from '@prisma/client';
import { faker } from '@faker-js/faker';
import sample from 'lodash/sample';
import { prisma } from './../index';

const getUidsFrom = async (model: string, where: Record<string, any> = {}) => {
  const rows = await (prisma as any)[model].findMany({
    select: { uid: true },
    where,
  });
  return (rows ?? []).map((r: any) => r.uid);
};

const eventFactory = Factory.define<Omit<PLEvent, 'id'>>(({ sequence, onCreate }) => {
  onCreate(async (event) => {
    const locationUids = await getUidsFrom('pLEventLocation', { isDeleted: false });
    event.locationUid = sample(locationUids) ?? null;

    // FK-safe: real image uid OR null
    const imageUids = await getUidsFrom('image');
    const imageUid = sample(imageUids) ?? null;

    event.logoUid = imageUid;
    event.bannerUid = imageUid;

    return event;
  });

  const startDate = faker.date.future();
  const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);

  return {
    uid: `event-${sequence}`,
    type: null,
    name: faker.company.name(),
    description: faker.lorem.paragraph(),
    shortDescription: faker.lorem.sentence(),
    eventsCount: 0,
    startDate,
    endDate,
    slugURL: `event-${sequence}`,
    telegramId: null,
    websiteURL: null,
    resources: [],
    isFeatured: false,

    // ❗ CRITICAL: must be null, NOT empty string
    logoUid: null,
    bannerUid: null,
    locationUid: null,

    additionalInfo: {},
    priority: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    externalId: faker.datatype.uuid(),
    syncedAt: new Date(),
    isAggregated: false,
    isDeleted: false,
    aggregatedPriority: 1,

    locationStatus: 'AUTO_MAPPED' as PLEventLocationStatus,
    reviewerUid: null,
    pLEventLocationAssociationUid: null,
  };
});

export const events = async () => await eventFactory.createList(25);
