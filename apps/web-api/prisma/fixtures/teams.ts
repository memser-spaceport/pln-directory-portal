/* eslint-disable prettier/prettier */
import { faker } from '@faker-js/faker';
import { Prisma, Team } from '@prisma/client';
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

const teamsFactory = Factory.define<Omit<Team, 'id'>>(
  ({ sequence, onCreate }) => {
    onCreate(async (team) => {
      const fundingStageUids = await (
        await getUidsFrom(Prisma.ModelName.FundingStage)
      ).map((result) => result.uid);
      team.fundingStageUid = sample(fundingStageUids) || '';
      const imageUids = await (
        await getUidsFrom(Prisma.ModelName.Image, { thumbnailToUid: null })
      ).map((result) => result.uid);
      team.logoUid = sample(imageUids) || '';
      return team;
    });

    const companyName = faker.helpers.unique(faker.company.name);
    return {
      uid: faker.helpers.slugify(`uid-${companyName.toLowerCase()}`),
      name: companyName,
      logoUid: null,
      blog: faker.internet.url(),
      website: faker.internet.url(),
      contactMethod: faker.helpers.arrayElement([
        null,
        faker.internet.url(),
        faker.internet.email(),
      ]),
      twitterHandler: faker.name.firstName(),
      officeHours: faker.name.firstName(),
      linkedinHandler: faker.name.firstName(),
      telegramHandler: faker.name.firstName(),
      shortDescription: faker.helpers.arrayElement([
        null,
        faker.lorem.sentence(),
      ]),
      longDescription: faker.helpers.arrayElement([
        null,
        faker.lorem.paragraph(),
      ]),
      moreDetails: faker.helpers.arrayElement([null, faker.lorem.paragraph()]),
      plnFriend: faker.datatype.boolean(),
      airtableRecId: `airtable-rec-id-${sequence}`,
      createdAt: faker.date.past(),
      updatedAt: faker.date.recent(),
      fundingStageUid: null,
    };
  }
);

export const teams = async () => await teamsFactory.createList(300);

export const teamRelations = async (teams) => {
  const industryTagUids = await getUidsFrom(Prisma.ModelName.IndustryTag);
  const membershipSourceUids = await getUidsFrom(
    Prisma.ModelName.MembershipSource
  );
  const technologyUids = await getUidsFrom(Prisma.ModelName.Technology);

  return teams.map((team) => {
    const randomTechnologies = sampleSize(
      technologyUids,
      random(0, technologyUids.length)
    );

    return {
      where: {
        uid: team.uid,
      },
      data: {
        industryTags: {
          connect: sampleSize(industryTagUids, 3),
        },
        membershipSources: {
          connect: sampleSize(membershipSourceUids, 3),
        },
        ...(randomTechnologies.length && {
          technologies: { connect: randomTechnologies },
        }),
      },
    };
  });
};
