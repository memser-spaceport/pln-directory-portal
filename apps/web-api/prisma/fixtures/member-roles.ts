import { faker } from '@faker-js/faker';
import { MemberRole } from '@prisma/client';
import { Factory } from 'fishery';

export const memberRoleFactory = Factory.define<Omit<MemberRole, 'id'>>(
  ({ sequence }) => ({
    uid: `uid-${sequence}`,
    name: `${sequence}`,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
);

export const memberRoles = ['DIRECTORYADMIN'].map((role) =>
  memberRoleFactory.build({
    uid: faker.helpers.slugify(`uid-${role.toLowerCase()}`),
    name: role,
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
  })
);
