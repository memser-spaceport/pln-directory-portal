import { MembershipSource } from '@prisma/client';
import { Factory } from 'fishery';
import { prisma } from '../../../prisma/__mocks__/index';
import { TestFactorySeederParams } from '../../utils/factory-interfaces';

export async function createMembershipSource({
  amount,
}: TestFactorySeederParams) {
  const membershipSourceFactory = Factory.define<Omit<MembershipSource, 'id'>>(
    ({ sequence }) => {
      const membershipSource = {
        uid: `uid-${sequence}`,
        title: `Membership Source ${sequence}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      return membershipSource;
    }
  );

  const membershipSources = await membershipSourceFactory.buildList(amount);
  await prisma.membershipSource.createMany({
    data: membershipSources,
  });
}
