import camelCase from 'camelcase';
import sampleSize from 'lodash/sampleSize';
import { prisma } from './../index';
import { faker } from '@faker-js/faker';
import { TeamMemberRole, Prisma } from '@prisma/client';

const getUidsFrom = async (model) => {
  return await prisma[camelCase(model)].findMany({
    select: {
      uid: true,
    },
  });
};

export const teamMemberRoles = async () => {
  const teamMemberRoles: Omit<TeamMemberRole, 'id'>[] = [];
  const teamUids = await getUidsFrom(Prisma.ModelName.Team);
  const memberUids = await getUidsFrom(Prisma.ModelName.Member);

  teamUids.forEach((teamUid) =>
    teamMemberRoles.push(
      ...sampleSize(memberUids, 6).map(({ uid }) => ({
        teamUid: teamUid.uid,
        memberUid: uid,
        role: faker.name.jobTitle(),
        mainTeam: false,
        teamLead: faker.datatype.boolean(),
        startDate: faker.date.past(),
        endDate: faker.date.recent(),
      }))
    )
  );

  return teamMemberRoles;
};
