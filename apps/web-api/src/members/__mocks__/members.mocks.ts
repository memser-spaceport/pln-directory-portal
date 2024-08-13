import { Location, Member, PrismaClient, Prisma } from '@prisma/client';
import { Factory } from 'fishery';
import { prisma } from '../../../prisma/__mocks__/index';
import { TestFactorySeederParams } from '../../utils/factory-interfaces';
import { JsonValue } from 'aws-sdk/clients/glue';
import zodToJsonSchema from 'zod-to-json-schema';
import { JSONInput } from 'aws-sdk/clients/s3';

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

  const memberFactory = Factory.define<Omit<Prisma.MemberCreateManyInput, 'id'>>(({ sequence }) => {
    const industryTag = {
      uid: `uid-${sequence}`,
      name: `name-${sequence}`,
      email: `email-${sequence}@mail.com`,
      imageUid: null,
      githubHandler: 'githubHandler',
      discordHandler: 'discordHandler',
      twitterHandler: 'twitterHandler',
      linkedinHandler: 'linkedinHandler',
      telegramHandler: 'telegramHandler',
      moreDetails: 'moreDetails',
      officeHours: 'officeHours',
      plnFriend: true,
      isFeatured: false,
      airtableRecId: `airtable-rec-id-${sequence}`,
      externalId: `external-${sequence}`,
      plnStartDate: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      locationUid: location.uid,
      openToWork: false,
      preferences: {showEmail:true,showGithubHandle:true,showTelegram:true,showLinkedin:true,showDiscord:false,showGithubProjects:false,showTwitter:true}
    } as Prisma.MemberCreateManyInput;

    return industryTag;
  });

  const members = await memberFactory.buildList(amount);
  await prisma.member.createMany({
    data: members,
  });
}
