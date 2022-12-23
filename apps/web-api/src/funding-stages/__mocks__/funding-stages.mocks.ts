import { FundingStage } from '@prisma/client';
import { Factory } from 'fishery';
import { prisma } from '../../../prisma/__mocks__/index';
import { TestFactorySeederParams } from '../../utils/factory-interfaces';

export async function createFundingStage({ amount }: TestFactorySeederParams) {
  const industryTagFactory = Factory.define<Omit<FundingStage, 'id'>>(
    ({ sequence }) => {
      const industryTag = {
        uid: `uid-${sequence}`,
        title: `Funding Stage ${sequence}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      return industryTag;
    }
  );

  const industryTags = await industryTagFactory.buildList(amount);
  await prisma.fundingStage.createMany({
    data: industryTags,
  });
}
