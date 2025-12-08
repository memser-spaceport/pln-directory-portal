import { faker } from '@faker-js/faker';
import { MemberRole } from '@prisma/client';
import { Factory } from 'fishery';
import { MemberRole as DirectoryRole } from '../../src/utils/constants';

export const memberRoleFactory = Factory.define<Omit<MemberRole, 'id'>>(({ sequence }) => ({
  uid: `uid-${sequence}`,
  name: `${sequence}`,
  createdAt: new Date(),
  updatedAt: new Date(),
}));

// Use MemberRole enum values to ensure consistency
export const memberRoles = [DirectoryRole.DIRECTORY_ADMIN, DirectoryRole.DEMO_DAY_ADMIN].map((role) =>
  memberRoleFactory.build({
    uid: faker.helpers.slugify(`uid-${role.toLowerCase()}`),
    name: role,
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
  })
);
