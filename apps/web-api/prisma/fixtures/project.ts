/* eslint-disable prettier/prettier */
import { faker } from '@faker-js/faker';
import { Prisma, Project } from '@prisma/client';
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

const ProjectFactory = Factory.define<Omit<Project, 'id'>>(
  ({ sequence, onCreate }) => {
    onCreate(async (project) => {
      const teamUids = await (await getUidsFrom(Prisma.ModelName.Team))
        .map((result) => result.uid);
      project.maintainingTeamUid = sample(teamUids) || '';
      const memberUids = await (await getUidsFrom(Prisma.ModelName.Member))
        .map((result) => result.uid);
      project.createdBy = sample(memberUids) || '';
      const imageUids = await (await getUidsFrom(Prisma.ModelName.Image, { thumbnailToUid: null }))
        .map((result) => result.uid);
      project.logoUid = sample(imageUids) || '';
      return project;
    });
    const name = faker.helpers.unique(faker.name.firstName);
    const tags = [
      "AI",
      "AI x Crypto",
      "Blockchain Infrastructure",
      "Blockchain Security",
      "Collaboration",
      "Compute",
      "Consensus & Scalability",
      "DAO Tooling",
      "Data Tooling",
      "DeFi/Fintech",
      "Decentralized Identity",
      "Decentralized Storage",
      "Developer Tooling",
      "Digital Human Rights",
      "Education",
      "Enterprise Solutions",
      "Events Tooling",
      "Funding Mechanisms",
      "Gaming/Metaverse",
      "Governance",
      "Hardware",
      "IoT",
      "NFT",
      "Service Providers",
      "Social Networking",
      "Treasury Management",
      "Verifiable Storage & Privacy",
      "ZK Proofs"
    ]
    const tagsCount = faker.datatype.number({ min: 1, max: 3 });
    return {
      uid: faker.helpers.slugify(`uid-${name.toLowerCase()}`),
      logoUid: '',
      name: name,
      score: parseInt(faker.random.numeric(), 10),
      tagline: faker.lorem.words(3),
      description: faker.lorem.paragraph(),
      contactEmail: faker.internet.email().toLowerCase(),
      lookingForFunding: false,
      kpis: [{ key: faker.random.word(), value: faker.random.word()}],
      readMe: faker.lorem.paragraph(),
      createdBy: '',
      maintainingTeamUid: '',
      isFeatured: faker.datatype.boolean(),
      projectLinks: [{
        name: faker.company.name(),
        url: faker.internet.url()
      }, 
      { 
        name: faker.company.name(),
        url: faker.internet.url() 
      }],
      createdAt: faker.date.past(),
      updatedAt: faker.date.recent(),
      isDeleted: false,
      osoProjectName: faker.random.word(),
      tags: faker.helpers.arrayElements(tags, tagsCount)
    };
  }
);

export const projects = async () => await ProjectFactory.createList(40);

export const projectRelations = async (projects) => {
  const teamUids = await (await getUidsFrom(Prisma.ModelName.Team));

  return projects.map((project) => {
    const randomTeams = sampleSize(teamUids, random(0, 5));
    return {
      where: {
        uid: project.uid,
      },
      data: {
        ...(randomTeams.length && {
          contributingTeams: { connect: randomTeams },
        })
      },
    };
  });
};
