import random from 'lodash/random';
import sample from 'lodash/sample';
import sampleSize from 'lodash/sampleSize';
import { Factory } from 'fishery';
import { faker } from '@faker-js/faker';
import { prisma } from './../index';
import { Member, Prisma } from '@prisma/client';
import { camelCase } from 'lodash';

const getUidsFrom = async (model, where = {}) => {
  return await prisma[camelCase(model)].findMany({
    select: {
      uid: true,
    },
    where,
  });
};

const membersFactory = Factory.define<Member>(({ sequence, onCreate }) => {
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
    id: sequence,
    uid: faker.helpers.slugify(`uid-${name.toLowerCase()}`),
    name,
    email: faker.internet.email(),
    imageUid: '',
    githubHandler: faker.internet.userName(name),
    discordHandler: faker.internet.userName(name),
    twitterHandler: faker.internet.userName(name),
    officeHours: faker.internet.url(),
    plnFriend: faker.datatype.boolean(),
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
    locationUid: '',
  };
});

export const members = async () => await membersFactory.createList(800);

export const memberRelations = async (members) => {
  const skillUids = await getUidsFrom(Prisma.ModelName.Skill);

  return members.map((member) => {
    const randomSkills = sampleSize(skillUids, random(0, 5));
    return {
      where: {
        id: member.id,
      },
      data: {
        ...(randomSkills.length && {
          skills: { connect: randomSkills },
        }),
      },
    };
  });
};
