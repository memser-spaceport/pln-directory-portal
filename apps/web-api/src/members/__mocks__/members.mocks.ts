import { Location, Prisma, MemberRole } from '@prisma/client';
import { Factory } from 'fishery';
import sample from 'lodash/sample';
import { faker } from '@faker-js/faker';
import camelCase from 'lodash/camelCase';
import random from 'lodash/random';
import sampleSize from 'lodash/sampleSize';
import { prisma } from '../../../prisma/__mocks__/index';
import { TestFactorySeederParams } from '../../utils/factory-interfaces';

const memberRoleFactory = Factory.define<Omit<MemberRole, 'id'>>(
  ({ sequence }) => ({
    uid: `uid-${sequence}`,
    name: `${sequence}`,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
);

const memberRoles = ['DIRECTORYADMIN'].map((role) =>
  memberRoleFactory.build({
    uid: faker.helpers.slugify(`uid-${role.toLowerCase()}`),
    name: role,
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
  })
);

export async function createMemberRoles() {
  return await prisma.memberRole.createMany({ data: memberRoles });
}

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

  const getUidsFrom = async (model, where = {}) => {
    return await prisma[camelCase(model)].findMany({
      select: {
        uid: true,
      },
      where,
    });
  };

  const memberFactory = Factory.define<Omit<Prisma.MemberCreateManyInput, 'id'>>(({ sequence, onCreate }) => {
    onCreate(async (member) => {
      return member;
    });
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
      preferences: {
        showEmail: true,
        showGithubHandle: true,
        showTelegram: true,
        showLinkedin: true,
        showDiscord: false,
        showGithubProjects: false,
        showTwitter: true,
      }
    } as Prisma.MemberCreateManyInput;

    return industryTag;
  });

  const members = await memberFactory.createList(amount);
  const memberRelations = async (members) => {
    const skillUids = await getUidsFrom(Prisma.ModelName.Skill);

    return members.map((member, mIndex) => {
      const randomSkills = sampleSize(skillUids, random(0, 5));
      return {
        where: {
          uid: member.uid,
        },
        data: {
          ...(randomSkills.length && {
            skills: { connect: randomSkills },
          }),
          ...(mIndex === 0 && {
            memberRoles: { connect: [{ id: 1 }] },
          }),
        },
      };
    });
  };

  const relationsToConnect = await memberRelations(members);
  await prisma.member.createMany({ data: members });
  for (const relation of relationsToConnect) {
    await prisma.member.update(relation);
  }
}

export async function getEditMemberParticipantsRequestPayload(uid, includeName) {
  const dataToReturn: any = {
    participantType: 'MEMBER',
    referenceUid: uid,
    uniqueIdentifier: 'name-1',
    newObj: '',
  };
  const newData = {
    logoUid: 'uid-1',
    name: 'name-1',
    shortDescription: faker.lorem.sentence(),
    longDescription: faker.lorem.paragraph(),
    technologies: [],
    fundingStage: {},
    membershipSources: [],
    industryTags: [],
    contactMethod: faker.internet.email(),
    website: faker.internet.url(),
    linkedinHandler: faker.name.firstName(),
    telegramHandler: faker.name.firstName(),
    twitterHandler: faker.name.firstName(),
    blog: faker.internet.url(),
    officeHours: faker.name.firstName(),
    fundingStageUid: 'uid-1',
    oldName: faker.name.firstName(),
    logoUrl: faker.internet.url(),
  };
  if (includeName) {
    const { name, ...newObj } = newData;
    dataToReturn.newData = newObj;
  }
  return dataToReturn;
}
