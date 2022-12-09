import camelCase from 'camelcase';
import sample from 'lodash/sample';
import sampleSize from 'lodash/sampleSize';
import { prisma } from './../index';
import { faker } from '@faker-js/faker';
import { TeamMemberRole, Prisma } from '@prisma/client';

const getIdsFrom = async (model) => {
  return await prisma[camelCase(model)].findMany({
    select: {
      id: true,
    },
  });
};

export const teamMemberRoles = async () => {
  const teamMemberRoles: TeamMemberRole[] = [];
  const teamIds = await getIdsFrom(Prisma.ModelName.Team);
  const memberIds = await getIdsFrom(Prisma.ModelName.Member);
  const roleIds = await getIdsFrom(Prisma.ModelName.Role);

  teamIds.forEach((teamId) =>
    teamMemberRoles.push(
      ...sampleSize(memberIds, 6).map(({ id }) => ({
        teamId: teamId.id,
        memberId: id,
        roleId: sample(roleIds).id,
        mainRole: faker.datatype.boolean(),
        teamLead: faker.datatype.boolean(),
      }))
    )
  );

  return teamMemberRoles;
};
