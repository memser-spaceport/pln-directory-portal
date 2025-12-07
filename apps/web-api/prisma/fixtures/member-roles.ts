import { faker } from '@faker-js/faker';
import { MemberRole } from '@prisma/client';
import { Factory } from 'fishery';
import { AdminRole } from '../../src/utils/constants';

export const memberRoleFactory = Factory.define<Omit<MemberRole, 'id'>>(
  ({ sequence }) => ({
    uid: `uid-${sequence}`,
    name: `${sequence}`,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
);

// Use AdminRole enum values to ensure consistency
export const memberRoles = [AdminRole.DIRECTORY_ADMIN, AdminRole.DEMO_DAY_ADMIN].map((role) =>
  memberRoleFactory.build({
    uid: faker.helpers.slugify(`uid-${role.toLowerCase()}`),
    name: role,
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
  })
);
