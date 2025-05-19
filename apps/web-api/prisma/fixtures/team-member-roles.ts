import { faker } from '@faker-js/faker';
import { Prisma, TeamMemberRole } from '@prisma/client';
import camelCase from 'camelcase';
import random from 'lodash/random';
import sampleSize from 'lodash/sampleSize';
import { prisma } from './../index';

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

  const assignedMainTeams = new Set();
  teamUids.forEach((teamUid) => {
    const selectedMembers = sampleSize(memberUids, random(0, 6));

    teamMemberRoles.push(
      ...selectedMembers.map(({ uid }) => {
        const isMainTeam = !assignedMainTeams.has(uid);
        if (isMainTeam) {
          assignedMainTeams.add(uid);
        }

        return {
          teamUid: teamUid.uid,
          memberUid: uid,
          role: faker.name.jobTitle(),
          mainTeam: isMainTeam,
          teamLead: faker.datatype.boolean(),
          startDate: faker.date.past(),
          endDate: faker.date.recent(),
          roleTags: [faker.name.jobType(), faker.name.jobType()],
        };
      })
    );
  });

  return teamMemberRoles;
};
