import { faker } from '@faker-js/faker';
import { Member, Prisma } from '@prisma/client';
import { Factory } from 'fishery';
import camelCase from 'lodash/camelCase';
import random from 'lodash/random';
import sample from 'lodash/sample';
import sampleSize from 'lodash/sampleSize';
import { prisma } from './../index';

const getUidsFrom = async (model, where = {}) => {
  return await prisma[camelCase(model)].findMany({
    select: {
      uid: true,
    },
    where,
  });
};

const membersFactory = Factory.define<Omit<Member, 'id'>>(
  ({ sequence, onCreate }) => {
    onCreate(async (member) => {
      const locationUids = await (
        await getUidsFrom(Prisma.ModelName.Location)
      ).map((result) => result.uid);
      member.locationUid = sample(locationUids) || '';
      const imageUids = await (
        await getUidsFrom(Prisma.ModelName.Image, { thumbnailToUid: null })
      ).map((result) => result.uid);
      member.imageUid = sample(imageUids) || '';
      return member;
    });

    const name = faker.helpers.unique(faker.name.firstName);
    return {
      uid: faker.helpers.slugify(`uid-${name.toLowerCase()}`),
      name,
      email: faker.internet.email(),
      imageUid: '',
      githubHandler: faker.internet.userName(name),
      discordHandler: faker.internet.userName(name),
      twitterHandler: faker.internet.userName(name),
      linkedinHandler: faker.internet.userName(name),
      officeHours: faker.helpers.arrayElement([null, faker.internet.url()]),
      moreDetails: faker.helpers.arrayElement([null, faker.lorem.paragraph()]),
      plnFriend: faker.datatype.boolean(),
      airtableRecId: `airtable-rec-id-${sequence}`,
      externalId: faker.helpers.slugify(`external-${name.toLowerCase()}`),
      createdAt: faker.date.past(),
      plnStartDate: faker.date.past(),
      updatedAt: faker.date.recent(),
      locationUid: '',
    };
  }
);

export const members = async () => await membersFactory.createList(800);

export const memberRelations = async (members) => {
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
