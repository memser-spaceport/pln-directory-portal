import sample from 'lodash/sample';
import sampleSize from 'lodash/sampleSize';
import { Factory } from 'fishery';
import { faker } from '@faker-js/faker';
import { prisma } from './../index';
import { Member } from '@prisma/client';

const getLocationUids = async () => {
  return await prisma.location.findMany({
    select: {
      uid: true,
    },
  });
};

const membersFactory = Factory.define<Member>(({ sequence, onCreate }) => {
  onCreate(async (member) => {
    const locationUids = await (
      await getLocationUids()
    ).map((result) => result.uid);
    member.locationUid = sample(locationUids);
    return member;
  });

  const name = faker.helpers.unique(faker.name.firstName);
  return {
    id: sequence,
    uid: faker.helpers.slugify(`uid-${name.toLowerCase()}`),
    name,
    email: faker.internet.email(),
    image: faker.image.animals(),
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

const getSkillUids = async () => {
  return await prisma.skill.findMany({
    select: {
      uid: true,
    },
  });
};

export const memberRelations = async (members) => {
  const skillUids = await getSkillUids();

  return members.map((member) => ({
    where: {
      id: member.id,
    },
    data: {
      skills: {
        connect: sampleSize(skillUids, 3),
      },
    },
  }));
};
