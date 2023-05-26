import { Location, Member } from '@prisma/client';
import { Factory } from 'fishery';
import { prisma } from '../../../prisma/__mocks__/index';
import { TestFactorySeederParams } from '../../utils/factory-interfaces';

async function createLocation() {
  const locationFactory = Factory.define<Omit<Location, 'id'>>(
    ({ sequence }) => ({
      uid: `industry-category-${sequence}`,
      placeId: `placeId-${sequence}`,
      city: `city-${sequence}`,
      country: 'country',
      continent: 'continent',
      latitude: 0,
      longitude: 0,
      region: 'region',
      regionAbbreviation: 'regionAbbreviation',
      metroArea: 'metroArea',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  );

  const location = await locationFactory.build();
  return await prisma.location.create({ data: location });
}

export async function createMember({ amount }: TestFactorySeederParams) {
  const location = await createLocation();

  const memberFactory = Factory.define<Omit<Member, 'id'>>(({ sequence }) => {
    const industryTag = {
      uid: `uid-${sequence}`,
      name: `name-${sequence}`,
      email: `email-${sequence}@mail.com`,
      imageUid: null,
      githubHandler: 'githubHandler',
      discordHandler: 'discordHandler',
      twitterHandler: 'twitterHandler',
      linkedinHandler: 'linkedinHandler',
      moreDetails: 'moreDetails',
      officeHours: 'officeHours',
      plnFriend: true,
      airtableRecId: `airtable-rec-id-${sequence}`,
      plnStartDate: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      locationUid: location.uid,
      openToWork: false,
    };

    return industryTag;
  });

  const members = await memberFactory.buildList(amount);
  await prisma.member.createMany({
    data: members,
  });
}
