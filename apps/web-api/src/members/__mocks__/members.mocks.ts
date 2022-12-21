import { Location, Member } from '@prisma/client';
import { Factory } from 'fishery';
import { prisma } from '../../../prisma/__mocks__/index';
import { TestFactorySeederParams } from '../../utils/factory-interfaces';

async function createLocation() {
  const locationFactory = Factory.define<Location>(({ sequence }) => ({
    id: sequence,
    uid: `industry-category-${sequence}`,
    city: 'city',
    country: 'country',
    continent: 'continent',
    formattedAddress: 'formattedAddress',
    latitude: 0,
    longitude: 0,
    region: 'region',
    regionAbbreviation: 'regionAbbreviation',
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  const location = await locationFactory.build();
  return await prisma.location.create({ data: location });
}

export async function createMember({ amount }: TestFactorySeederParams) {
  const location = await createLocation();

  const memberFactory = Factory.define<Member>(({ sequence }) => {
    const industryTag = {
      id: sequence,
      uid: `uid-${sequence}`,
      name: 'name',
      email: `email-${sequence}@mail.com`,
      imageUid: null,
      githubHandler: 'githubHandler',
      discordHandler: 'discordHandler',
      twitterHandler: 'twitterHandler',
      officeHours: 'officeHours',
      plnFriend: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      locationUid: location.uid,
    };

    return industryTag;
  });

  const members = await memberFactory.buildList(amount);
  await prisma.member.createMany({
    data: members,
  });
}
